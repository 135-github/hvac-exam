'use strict';
// Pure read-only analysis shared by the CLI and standalone local preview.
(function(root) {
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function canonical(value) {
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  // Exact parsed strings, ordered arrays. No semantic normalization or typo guessing.
  function contentFields(q) {
    return Object.fromEntries(Object.entries(q).filter(([k])=>!['id','qid','legacyIndex','displayNo'].includes(k)));
  }
  function answerFields(q) {
    const out={};
    for(const k of ['t','s','o','key','points','exp'])if(own(q,k))out[k]=q[k];
    return out;
  }
  async function verifyManifest(manifest,expectedHash,sha256) {
    if(await sha256(canonical(manifest))!==expectedHash)throw Error('迁移清单指纹不符，停止分析。');
    const ids=new Set(),indices=new Set();
    for(const e of manifest.entries) {
      if(ids.has(e.qid)||indices.has(e.legacyIndex))throw Error('迁移清单包含重复编号。');
      ids.add(e.qid);indices.add(e.legacyIndex);
    }
  }
  function validRecord(r) {
    if(!object(r))return false;
    for(const k of ['seen','right','level','due','last','viewed'])if(own(r,k)&&(!Number.isFinite(r[k])||r[k]<0))return false;
    for(const k of ['note','mnemonic','reason','ratingToken','lastGoodDay'])if(own(r,k)&&typeof r[k]!=='string')return false;
    for(const k of ['wrong','star','later'])if(own(r,k)&&typeof r[k]!=='boolean')return false;
    if(own(r,'seen')&&!Number.isInteger(r.seen)||own(r,'right')&&!Number.isInteger(r.right))return false;
    if(own(r,'right')&&r.right>(r.seen||0))return false;
    return true;
  }
  async function analyze(raw,manifest,expectedHash,sha256) {
    await verifyManifest(manifest,expectedHash,sha256);
    const quarantine=[],records=[],sessions=[];
    const report={reportVersion:1,mode:'read-only-dry-run',synthetic:raw?._testOnly===true,subject:manifest.subject,
      frozenCommit:manifest.source.commit,manifestHash:expectedHash,sourceStatus:'unverifiable',
      sourceExplanation:'旧导出没有可验证的题库版本。下列映射仅为候选，未迁移、未确认。',
      writesToUserStorage:0,readyForMigration:false,records,sessions,quarantine,sample:[],
      settingsPolicy:'预览保留原设置；R1 不写入、不替换任何设置。',warnings:[]};
    function isolate(path,reason,payload,detail='') {quarantine.push({path,reason,detail,rawPayload:payload});}
    if(!object(raw)) {isolate('$','INVALID_EXPORT',raw);return finish();}
    if(raw.format!==manifest.legacyFormat) {isolate('$','WRONG_SUBJECT_OR_FORMAT',raw,'只接受本科目现有导出格式。');return finish();}
    const declared=raw.sourceEvidence;
    if(declared!==undefined) {
      if(!object(declared)||declared.commit!==manifest.source.commit||declared.questionsSha256!==manifest.source.files.json.sha256) {
        isolate('$','SOURCE_FINGERPRINT_MISMATCH',raw,'来源声明与冻结提交不一致，不猜测来源。');return finish();
      }
      report.sourceStatus='declared-source-matches';
      report.sourceExplanation='导出所声明的提交和文件指纹匹配；这不是对历史浏览器写入来源的独立证明。仍需人工确认。';
    }
    const entries=new Map(manifest.entries.map(e=>[e.legacyIndex,e]));
    function entry(key) {
      if(typeof key==='string'&&!/^(0|[1-9]\d*)$/.test(key))return null;
      const n=typeof key==='number'?key:Number(key);
      return Number.isSafeInteger(n)&&n>=0?entries.get(n)||null:null;
    }
    if(!object(raw.records))isolate('records','INVALID_RECORDS',raw.records??null);
    else for(const [key,value] of Object.entries(raw.records)) {
      const e=entry(key),path='records.'+key;
      if(!e){isolate(path,'NO_MAPPING',value);continue;}
      if(!validRecord(value)){isolate(path,'INVALID_RECORD',value);continue;}
      // Preserve all known/unknown historical fields. No fabricated attempts/dates/hints.
      records.push({legacyKey:key,qid:e.qid,displayNo:e.displayNo,stem:e.stem,
        mappingStatus:'candidate-needs-human-review',historicalContentVersion:'unknown',
        legacySnapshot:value,baseline:Object.fromEntries(['seen','right','wrong','level','due','last','lastGoodDay','ratingToken'].filter(k=>own(value,k)).map(k=>[k,value[k]])),
        annotation:Object.fromEntries(['note','mnemonic','reason','star','later','viewed'].filter(k=>own(value,k)).map(k=>[k,value[k]])),
        unknownFields:Object.keys(value).filter(k=>!['seen','right','wrong','level','due','last','lastGoodDay','ratingToken','note','mnemonic','reason','star','later','viewed'].includes(k))});
    }
    const sessionIds=new Set();
    function inspectSession(s,path) {
      if(s===null||s===undefined)return;
      if(!object(s)||!Array.isArray(s.ids)||!s.ids.length||!Number.isInteger(s.index)||s.index<0||s.index>=s.ids.length||!object(s.answers)) {
        isolate(path,'INVALID_SESSION',s);return;
      }
      if(typeof s.id==='string'&&sessionIds.has(s.id)){isolate(path,'AMBIGUOUS_SESSION_ID',s);return;}
      if(typeof s.id==='string')sessionIds.add(s.id);
      const mapped=s.ids.map(id=>typeof id==='number'?entry(id):null);
      if(mapped.some(e=>!e)||new Set(s.ids).size!==s.ids.length) {isolate(path,'INVALID_OR_AMBIGUOUS_SESSION_REFERENCES',s);return;}
      const answers=[];
      for(const [key,a] of Object.entries(s.answers)) {
        const e=entry(key);
        if(!e||!s.ids.includes(e.legacyIndex)||!object(a)||!Array.isArray(a.selected)||a.selected.some(v=>typeof v!=='string')) {
          isolate(path,'INVALID_ANSWER_REFERENCE_OR_PAYLOAD',s,'有无法对应的答案表项；整个会话原样隔离，不截断。');return;
        }
        if(own(a,'draft')&&typeof a.draft!=='string'||own(a,'ratingBefore')&&!validRecord(a.ratingBefore)) {
          isolate(path,'INVALID_ANSWER_PAYLOAD',s);return;
        }
        const record=object(raw.records)?raw.records[key]:null;
        answers.push({legacyKey:key,qid:e.qid,original:a,
          undoRelationship:a.ratingToken?(record?.ratingToken===a.ratingToken?'matches-latest-record':'not-latest-or-missing'):'no-token'});
      }
      sessions.push({path,original:s,qids:mapped.map(e=>e.qid),currentQid:mapped[s.index].qid,
        currentDisplayNo:mapped[s.index].displayNo,answers,mappingStatus:'candidate-needs-human-review'});
    }
    inspectSession(raw.session,'session');
    if(own(raw,'pausedSessions')&&!Array.isArray(raw.pausedSessions))isolate('pausedSessions','INVALID_PAUSED_SESSIONS',raw.pausedSessions);
    else (raw.pausedSessions||[]).forEach((s,i)=>inspectSession(s,`pausedSessions[${i}]`));
    const annotated=records.filter(r=>r.annotation.note||r.annotation.mnemonic).sort((a,b)=>a.qid.localeCompare(b.qid));
    // Evenly spaced, reproducible sample, at most ten; do not invent missing annotations.
    const count=Math.min(10,annotated.length);
    for(let i=0;i<count;i++) {
      const r=annotated[count===1?0:Math.floor(i*(annotated.length-1)/(count-1))];
      report.sample.push({qid:r.qid,legacyKey:r.legacyKey,displayNo:r.displayNo,stem:r.stem,note:r.annotation.note||'',mnemonic:r.annotation.mnemonic||'',confirmation:'pending'});
    }
    report.warnings.push('所有候选映射仍需本人确认；抽样通过不能证明未抽样记录正确。');
    if(annotated.length<10)report.warnings.push(`仅有 ${annotated.length} 条带笔记或助记的可映射记录，全部列入抽样。`);
    report.warnings.push('旧 ratingToken/ratingBefore 原样保留；R2 必须提供兼容撤销或明确隔离，R1 不创建虚构作答。');
    report.warnings.push('历史汇总不作为逐次作答证据；新统计不能猜测旧记录的提示使用、题目版本或错误次数。');
    return finish();
    function finish() {
      report.counts={inputRecords:object(raw?.records)?Object.keys(raw.records).length:0,
        candidateRecords:records.length,candidateSessions:sessions.length,
        answerEntries:sessions.reduce((n,s)=>n+s.answers.length,0),quarantineItems:quarantine.length,
        needsHumanReview:records.length+sessions.length,sampleItems:report.sample.length,
        newAttempts:0,migratedRecords:0};
      return report;
    }
  }
  const api={canonical,contentFields,answerFields,verifyManifest,analyze};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.R1=api;
})(typeof globalThis!=='undefined'?globalThis:this);
