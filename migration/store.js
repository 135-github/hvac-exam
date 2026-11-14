/* R2 stores a reviewed, read-only pilot copy. The practicing apps still own their legacy data. */
(function(root){
 'use strict';
 const DB_NAME='exam-memory',VERSION=1;
 const STORES=['attempts','sessions','snapshots','baseline','kv','meta','quarantine','revisions'];
 let opened=null,channel=null;
 const id=()=>crypto.randomUUID();
 const copy=v=>JSON.parse(JSON.stringify(v));
 const fail=message=>Object.assign(new Error(message),{userMessage:message});
 function connect(){
  if(opened)return Promise.resolve(opened);
  return new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB_NAME,VERSION);let blocked=false;
   req.onupgradeneeded=()=>{
    const db=req.result;
    for(const name of STORES)if(!db.objectStoreNames.contains(name)){
     const store=db.createObjectStore(name,{keyPath:'id'});
     if(name==='attempts')for(const field of ['qid','at','session'])store.createIndex(field,field,{unique:false});
     if(['baseline','sessions','quarantine'].includes(name))store.createIndex('runId','runId',{unique:false});
    }
   };
   req.onblocked=()=>{blocked=true;reject(fail('另一个旧页面占用了数据库，请关闭旧的迁移页面后重试。'));};
   req.onerror=()=>reject(req.error||fail('无法打开本机数据库。'));
   req.onsuccess=()=>{
    if(blocked){req.result.close();return;}
    opened=req.result;opened.onversionchange=()=>{opened.close();opened=null;root.dispatchEvent(new Event('pilot-db-closed'));};
    resolve(opened);
   };
  });
 }
 function changed(){
  try{channel?.postMessage({type:'pilot-changed'});}catch{}
  root.dispatchEvent(new Event('pilot-changed'));
 }
 try{if('BroadcastChannel' in root){channel=new BroadcastChannel('exam-memory-r2');channel.onmessage=()=>root.dispatchEvent(new Event('pilot-changed'));}}catch{}
 async function state(){
  const db=await connect();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta','snapshots'],'readonly');let value={id:'pilot:hvac',revision:0,activeRun:null},snapshots=[];
   const request=tx.objectStore('meta').get('pilot:hvac');request.onsuccess=()=>{if(request.result)value=request.result;};
   const list=tx.objectStore('snapshots').getAll();list.onsuccess=()=>{snapshots=list.result.filter(x=>x.subject==='hvac').map(x=>({id:x.id,at:x.at,counts:x.counts,sourceKind:x.sourceKind,sourceHash:x.sourceHash})).sort((a,b)=>b.at-a.at);};
   tx.oncomplete=()=>resolve({meta:value,snapshots});tx.onabort=()=>reject(tx.error||fail('读取试点状态失败。'));tx.onerror=()=>{};
  });
 }
 async function commit({report,rawText,sourceKind,sourceHash,expectedRevision,confirmation}){
  if(report?.subject!=='hvac'||report?.mode!=='read-only-dry-run'||!confirmation?.reviewed||!confirmation?.understood)throw fail('请先完成通风空调的映射核对。');
  if(!report.counts.candidateRecords&&!report.counts.candidateSessions)throw fail('没有可核对的候选记录，仅可导出原件和隔离报告。');
  const db=await connect(),runId=id(),at=Date.now();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta','snapshots','baseline','sessions','quarantine','kv'],'readwrite');let error=null,receipt=null;
   function abort(e){error=e;try{tx.abort();}catch{}}
   tx.oncomplete=()=>{changed();resolve(receipt);};
   tx.onabort=()=>reject(error||tx.error||fail('未保存：事务中断，原练习记录没有改变。'));
   tx.onerror=()=>{};
   const req=tx.objectStore('meta').get('pilot:hvac');
   req.onsuccess=()=>{
    try{
     const before=req.result||{id:'pilot:hvac',revision:0,activeRun:null};
     if(before.revision!==expectedRevision)throw fail('另一个页面已更新试点，请重新核对后保存。');
     tx.objectStore('snapshots').add({id:runId,kind:'reviewed-r2-pilot',subject:'hvac',at,sourceKind,sourceHash,
       rawText,report:copy(report),counts:copy(report.counts),before:copy(before),confirmation:copy(confirmation),
       limitation:'Read-only pilot copy; not live learning storage. Historical content provenance remains unverified.'});
     for(const r of report.records)tx.objectStore('baseline').add({id:runId+':'+r.qid,runId,qid:r.qid,displayNo:r.displayNo,
       legacySnapshot:copy(r.legacySnapshot),baseline:copy(r.baseline),annotation:copy(r.annotation),historicalContentVersion:'unknown'});
     for(const s of report.sessions)tx.objectStore('sessions').add({id:runId+':'+s.path,runId,subject:'hvac',legacySessionId:s.original.id||null,
       ids:copy(s.qids),currentQid:s.currentQid,index:s.original.index,
       answers:Object.fromEntries(s.answers.map(a=>[a.qid,copy(a.original)])),legacySnapshot:copy(s.original)});
     report.quarantine.forEach((q,i)=>tx.objectStore('quarantine').add({id:runId+':'+i,runId,...copy(q)}));
     // Settings and raw annotations are retained inside this pilot snapshot, never applied to practicing apps.
     const next={id:'pilot:hvac',revision:before.revision+1,activeRun:runId,at,sourceHash,sourceKind};
     tx.objectStore('meta').put(next);tx.objectStore('kv').put({id:'r2:notice',value:'readonly-pilot-not-active-learning'});
     receipt={runId,at,revision:next.revision,counts:copy(report.counts)};
    }catch(e){abort(e);}
   };
  });
 }
 async function rollback(expectedRevision,expectedRun){
  const db=await connect();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta','snapshots'],'readwrite');let error=null,next=null;
   tx.oncomplete=()=>{changed();resolve(next);};tx.onabort=()=>reject(error||tx.error||fail('撤回未保存，请重试。'));tx.onerror=()=>{};
   const req=tx.objectStore('meta').get('pilot:hvac');req.onsuccess=()=>{
    const before=req.result;
    if(!before||before.revision!==expectedRevision||before.activeRun!==expectedRun){error=fail('试点状态已变化，请刷新状态后重试。');tx.abort();return;}
    const get=tx.objectStore('snapshots').get(before.activeRun);get.onsuccess=()=>{
     if(!get.result){error=fail('恢复检查点不存在。');tx.abort();return;}
     const prior=get.result.before;
     next={id:'pilot:hvac',revision:before.revision+1,activeRun:prior.activeRun||null,at:Date.now(),
       ...(prior.activeRun?{sourceHash:prior.sourceHash,sourceKind:prior.sourceKind}:{})};
     tx.objectStore('meta').put(next);
     tx.objectStore('snapshots').add({id:id(),kind:'pilot-rollback',subject:'hvac',at:Date.now(),before,after:next,
       counts:{},sourceKind:'rollback',sourceHash:before.sourceHash});
    };
   };
  });
 }
 async function exportCopy(runId){
  const db=await connect();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['snapshots','baseline','sessions','quarantine'],'readonly'),result={format:'exam-memory-r2-pilot-export',schemaVersion:1,learningStorageActive:false};
   const get=tx.objectStore('snapshots').get(runId);get.onsuccess=()=>{result.snapshot=get.result||null;};
   for(const name of ['baseline','sessions','quarantine']){const req=tx.objectStore(name).index('runId').getAll(runId);req.onsuccess=()=>{result[name]=req.result;};}
   tx.oncomplete=()=>result.snapshot?resolve(result):reject(fail('未找到该副本。'));tx.onabort=()=>reject(tx.error||fail('导出读取失败。'));tx.onerror=()=>{};
  });
 }
 root.PilotStore={connect,state,commit,rollback,exportCopy};
})(globalThis);
