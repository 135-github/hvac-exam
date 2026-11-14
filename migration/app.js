/* The pilot is opt-in and never writes any legacy localStorage key. */
(() => {
 'use strict';
 const STORAGE='hvac-memory-v2',MANIFEST_HASH='02574c579b257ceb44229c430636e18230230ae40d081a74a4b4df45c3ed3afd';
 const $=id=>document.getElementById(id),node=(tag,text,parent,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(parent)parent.append(e);return e;};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const sha=text=>digest(new TextEncoder().encode(text));
 let manifestPromise=null,pending=null,state=null,busy=false,sequence=0,dbReady=false,rollbackExpected=null;
 function manifest(){return manifestPromise||=(async()=>{const r=await fetch('./manifests/hvac.json');if(!r.ok)throw Error('冻结清单读取失败，请联网重试。');const m=await r.json();await R1.verifyManifest(m,MANIFEST_HASH,sha);return m;})().catch(e=>{manifestPromise=null;throw e;});}
 function setBusy(value){busy=value;for(const id of ['read-local','backup-file','refresh-state','export-copy','rollback'])$(id).disabled=value;syncButtons();}
 function syncButtons(){
  const hasCandidates=pending&&(pending.report.counts.candidateRecords||pending.report.counts.candidateSessions);
  $('save-copy').disabled=busy||!dbReady||!hasCandidates||pending?.stale||!$('reviewed').checked||!$('understood').checked;
  $('export-copy').disabled=busy||!state?.meta.activeRun;$('rollback').disabled=busy||!state?.meta.activeRun;
 }
 function status(message){$('status').textContent=message;}
 function invalidatePreview(){pending=null;$('preview').hidden=true;$('confirm-section').hidden=true;$('reviewed').checked=false;$('understood').checked=false;$('source-changed').hidden=true;$('save-status').textContent='';syncButtons();}
 function sourceStillCurrent(){
  if(!pending||pending.sourceKind!=='local-browser')return true;
  let matches=false;try{matches=localStorage.getItem(STORAGE)===pending.originalLocalText;}catch{}
  if(!matches){pending.stale=true;$('source-changed').hidden=false;$('reviewed').checked=false;$('understood').checked=false;syncButtons();}
  return matches;
 }
 function render(report){
  $('preview').hidden=false;$('confirm-section').hidden=false;
  for(const id of ['counts','samples','records-list','session-list','quarantine-list'])$(id).replaceChildren();
  for(const [label,n] of [['原记录',report.counts.inputRecords],['候选记录',report.counts.candidateRecords],['候选会话',report.counts.candidateSessions],['待处理项目',report.counts.quarantineItems],['笔记抽样',report.counts.sampleItems],['改写原记录',0]]){const div=node('div',undefined,$('counts'),'metric');node('b',String(n),div);node('span',label,div);}
  $('source-status').textContent=report.sourceExplanation+' 本页只保存经你核对的试点副本，不把来源声明当作历史证明。';
  node('h3','最多十条笔记抽样 · 请逐条看是否属于这道题',$('samples'));
  if(!report.sample.length)node('p','没有带笔记或个人助记的候选记录，请展开下面的全部候选题目和练习位置进行核对。',$('samples'),'muted');
  for(const s of report.sample){const row=node('article',undefined,$('samples'),'sample');node('h3',`第 ${s.displayNo} 题 · ${s.stem}`,row);node('small',s.qid,row);node('p','笔记：'+(s.note||'无'),row);node('p','个人助记：'+(s.mnemonic||'无'),row);}
  for(const r of report.records){const row=node('details',undefined,$('records-list'),'record-item');node('summary',`第 ${r.displayNo} 题 · ${r.stem}`,row);node('p','永久编号：'+r.qid,row);node('p','笔记：'+(r.annotation.note||'无'),row);node('p','个人助记：'+(r.annotation.mnemonic||'无'),row);node('pre',JSON.stringify(r.legacySnapshot,null,2),row);}
  if(!report.sessions.length)node('p','没有可完整映射的会话。',$('session-list'));
  for(const s of report.sessions){const d=node('details',undefined,$('session-list'));node('summary',`${s.path==='session'?'当前练习':'暂停练习'}：第 ${s.currentDisplayNo} 题，共 ${s.qids.length} 题`,d);node('pre',JSON.stringify({currentQid:s.currentQid,ids:s.qids,answers:s.answers},null,2),d);}
  $('quarantine-title').textContent=`待处理记录 · ${report.quarantine.length} 项`;
  if(!report.quarantine.length)node('p','未发现结构错误；来源未验证的候选仍需本人确认。',$('quarantine-list'));
  for(const q of report.quarantine){const d=node('details',undefined,$('quarantine-list'));node('summary',q.path+' · '+q.reason,d);node('p',q.detail,d);node('pre',JSON.stringify(q.rawPayload,null,2),d);}
  if(!report.counts.candidateRecords&&!report.counts.candidateSessions)node('p','没有可确认的候选记录。本次只可导出报告与原始文件，不能保存试点。',$('quarantine-list'),'warning');
  syncButtons();
 }
 async function preview(text,sourceKind,originalLocalText=null){
  const turn=++sequence;invalidatePreview();setBusy(true);status('正在本机校验冻结清单与候选映射…');
  try{
   const raw=JSON.parse(text.replace(/^\uFEFF/,''));
   const exportData=sourceKind==='local-browser'?{...raw,format:STORAGE}:raw;
   const m=await manifest(),report=await R1.analyze(exportData,m,MANIFEST_HASH,sha);
   const hash=await sha(text);if(turn!==sequence)return;
   report.inputFileSha256=hash;
   pending={report,rawText:text,sourceKind,sourceHash:hash,originalLocalText,stale:false,expectedRevision:state?.meta.revision??0};
   render(report);sourceStillCurrent();status('核对预览已生成。尚未写入任何学习记录。');
  }catch(e){if(turn===sequence){invalidatePreview();status('核对未完成：'+e.message+' 原记录未改动。');}}
  finally{if(turn===sequence)setBusy(false);}
 }
 async function refreshState(){
  try{
   const next=await PilotStore.state();state=next;dbReady=true;
   const active=state.snapshots.find(s=>s.id===state.meta.activeRun);
   $('db-status').textContent=active?`当前副本：${new Date(active.at).toLocaleString('zh-CN')}，${active.counts.candidateRecords||0} 条候选记录、${active.counts.candidateSessions||0} 个会话。原练习仍用旧存储。`:'尚无当前试点副本。原练习仍用旧存储。';
   $('snapshot-list').replaceChildren();
   for(const s of state.snapshots){const row=node('div',undefined,$('snapshot-list'),'record-item');node('span',new Date(s.at).toLocaleString('zh-CN')+(s.sourceKind==='rollback'?' · 撤回检查点':' · 试点副本'),row);if(s.sourceKind!=='rollback'){const b=node('button','导出',row,'secondary');b.onclick=()=>exportRun(s.id);}}
   if(!state.snapshots.length)node('p','保存或撤回试点后，这里才会有检查点。',$('snapshot-list'));
   $('saved-stale').hidden=true;
   if(active?.sourceKind==='local-browser'){
    const current=localStorage.getItem(STORAGE);
    if(current===null||await sha(current)!==active.sourceHash){$('saved-stale').hidden=false;$('saved-stale').textContent='原刷题记录已经继续更新。这个试点副本不是最新进度；需要时重新核对并保存。';}
   }
  }catch(e){dbReady=false;$('db-status').textContent='新数据库暂不可用：'+e.message+'。仍可生成核对报告，原题库可照常使用。';}
  syncButtons();
 }
 function download(text,name,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 async function exportRun(run){try{const data=await PilotStore.exportCopy(run);download(JSON.stringify(data,null,2),'通风空调-R2试点副本-'+run+'.json');}catch(e){$('db-status').textContent='导出未完成：'+e.message;}}
 $('read-local').onclick=()=>{
  try{const text=localStorage.getItem(STORAGE);if(text===null){invalidatePreview();status('当前浏览器没有通风空调记录。可以选择之前导出的 JSON 备份。');return;}preview(text,'local-browser',text);}catch(e){status('浏览器不允许读取记录，请改用导出的 JSON 文件。');}
 };
 $('backup-file').onchange=async e=>{const file=e.target.files[0];if(file){try{await preview(await file.text(),'backup-file');}catch(error){status('文件读取失败：'+error.message);}}e.target.value='';};
 $('reviewed').onchange=syncButtons;$('understood').onchange=syncButtons;
 $('download-report').onclick=()=>{if(pending)download(JSON.stringify(pending.report,null,2),'通风空调-R2核对报告.json');};
 $('download-source').onclick=()=>{if(pending){let value;try{value=JSON.parse(pending.rawText);}catch{return;}if(pending.sourceKind==='local-browser')value={...value,format:STORAGE};download(JSON.stringify(value,null,2),'通风空调-试点前原始记录.json');}};
 $('save-copy').onclick=async()=>{
  if(busy||!pending||!sourceStillCurrent()||!$('reviewed').checked||!$('understood').checked)return;
  const payload=pending;setBusy(true);$('save-status').textContent='正在保存，请等待事务完成…';
  try{
   const result=await PilotStore.commit({...payload,confirmation:{reviewed:true,understood:true,at:Date.now(),sampleQids:payload.report.sample.map(s=>s.qid)}});
   status('本次核对结果已存为试点副本。原练习记录未改动；继续刷题后，副本不会自动同步。');
   $('save-status').textContent=`试点副本已保存：${result.counts.candidateRecords} 条候选记录，${result.counts.quarantineItems} 项待处理。原记录未改写。`;
   // Never repeat the same confirmation after a successful transaction.
   $('reviewed').checked=false;$('understood').checked=false;
   await refreshState();payload.expectedRevision=state?.meta.revision??result.revision;
   sourceStillCurrent();await storageInfo();
  }catch(e){$('save-status').textContent='未保存：'+(e.userMessage||e.message)+'。预览仍在，可重新核对后重试。';await refreshState();}
  finally{setBusy(false);}
 };
 $('refresh-state').onclick=refreshState;$('export-copy').onclick=()=>state?.meta.activeRun&&exportRun(state.meta.activeRun);
 $('rollback').onclick=()=>{if(state?.meta.activeRun){rollbackExpected={revision:state.meta.revision,run:state.meta.activeRun};$('rollback-dialog').showModal();}};
 $('cancel-rollback').onclick=()=>$('rollback-dialog').close();
 $('confirm-rollback').onclick=async()=>{
  if(busy||!rollbackExpected)return;const expected=rollbackExpected;rollbackExpected=null;$('rollback-dialog').close();setBusy(true);
  try{await PilotStore.rollback(expected.revision,expected.run);$('save-status').textContent='已撤回到前一个试点检查点。历史副本保留，原刷题记录未改变。';}
  catch(e){$('save-status').textContent='撤回未完成：'+(e.userMessage||e.message);}
  finally{await refreshState();if(pending)pending.expectedRevision=state?.meta.revision??0;$('reviewed').checked=false;$('understood').checked=false;setBusy(false);}
 };
 async function storageInfo(){
  try{const estimate=await navigator.storage?.estimate?.(),persisted=await navigator.storage?.persisted?.();
   const used=estimate?`本站来源约使用 ${(estimate.usage/1048576).toFixed(2)} MB，可用配额约 ${(estimate.quota/1048576).toFixed(0)} MB（包括同来源资源）`:'浏览器未提供用量信息';
   $('storage-status').textContent=used+'；'+(persisted?'已获得持久保存许可。':'尚未获得持久保存许可。');
  }catch{$('storage-status').textContent='暂时无法查询存储用量。';}
 }
 $('persist').onclick=async()=>{try{if(!navigator.storage?.persist){$('storage-status').textContent='当前浏览器不支持持久保存申请，请导出备份。';return;}const ok=await navigator.storage.persist();await storageInfo();$('storage-status').textContent+=(ok?' 浏览器已批准。':' 浏览器未批准，请保留导出备份。');}catch(e){$('storage-status').textContent='申请未完成，请保留导出备份。';}};
 window.addEventListener('storage',e=>{if(e.key===STORAGE){sourceStillCurrent();refreshState();}});
 window.addEventListener('focus',()=>{sourceStillCurrent();refreshState();});
 window.addEventListener('pilot-changed',()=>{if(!busy)refreshState();});
 window.addEventListener('pilot-db-closed',()=>{dbReady=false;$('db-status').textContent='数据库版本已变化，请重新打开此页。';syncButtons();});
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
 refreshState();storageInfo();
 if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js',{scope:'../',updateViaCache:'none'}).catch(()=>{});
})();
