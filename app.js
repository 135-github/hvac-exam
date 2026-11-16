'use strict';
const {qs, units} = window.BANK;
const STORAGE = 'hvac-memory-v2';
const DAY = 86400000;
const intervals = [1,3,7,14,30];
const LEARNING_KEYS=['seen','right','wrong','level','due','last','lastGoodDay','ratingToken'];
const EXAM_START = Date.parse('2026-11-17T14:00:00+08:00');
const EXAM_END = Date.parse('2026-11-17T15:30:00+08:00');
const LAST_REVIEW = Date.parse('2026-11-17T09:00:00+08:00');
const EXAM_TEXT = '通风与空调工程考试\n2026年11月17日 14:00—15:30（北京时间）\nB7 一楼 106 合班教室';
const main = document.getElementById('main');
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view = 'home';
let filters = {unit:'', type:'', search:''};
let toastTimer;
const fresh = () => ({records:{},session:null,pausedSessions:[],settings:{count:5,unit:'',type:'',scope:'all',order:'sequence',mode:'answer',instantAnswer:true,autoNext:false,correctAutoNext:true,focus:false,font:'normal'},letter:''});

function toast(text) {
  const node = document.getElementById('toast');
  node.textContent=text;
  node.style.display='block';
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>node.style.display='none',3500);
}
function validRecord(r) {
  return r && typeof r==='object' && !Array.isArray(r) &&
    ['seen','right','level','due','last','viewed'].every(k=>r[k]===undefined || Number.isFinite(r[k]) && r[k]>=0) &&
    (r.note===undefined || typeof r.note==='string') &&
    (r.mnemonic===undefined || typeof r.mnemonic==='string' && r.mnemonic.length<=500) &&
    ['wrong','star','later'].every(k=>r[k]===undefined || typeof r[k]==='boolean');
}
function normalizeSession(old) {
  if(!old || !Array.isArray(old.ids) || !Number.isInteger(old.index) || old.index<0 || !old.answers || typeof old.answers!=='object')return null;
  const ids=[...new Set(old.ids.filter(id=>Number.isInteger(id)&&qs[id]))];
  if(!ids.length)return null;
  const current=old.ids.slice(old.index).find(id=>ids.includes(id));
  const answers={};
  for(const id of ids) {
    const a=old.answers[id];
    if(a && Array.isArray(a.selected) && a.selected.every(s=>typeof s==='string')) {
      answers[id]={...a,draft:typeof a.draft==='string'?a.draft:''};
      if(!validRecord(a.ratingBefore))delete answers[id].ratingBefore;
      else answers[id].ratingBefore=Object.fromEntries(LEARNING_KEYS.filter(key=>a.ratingBefore[key]!==undefined).map(key=>[key,a.ratingBefore[key]]));
    }
  }
  return {id:typeof old.id==='string'?old.id:sessionId(),ids,index:current===undefined?ids.length-1:ids.indexOf(current),answers,title:typeof old.title==='string'?old.title:'上次练习',mode:['answer','read','recall'].includes(old.mode)?old.mode:old.cards?'recall':'answer',finished:old.finished===true};
}
function sessionId() { return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9); }

function normalize(value) {
  if(!value || !value.records || typeof value.records!=='object' || Array.isArray(value.records)) throw Error('Invalid records');
  const result=fresh();
  for(const [id,r] of Object.entries(value.records)) {
    if(!/^\d+$/.test(id) || !validRecord(r)) throw Error('Invalid record');
    if(qs[id]) result.records[id]={...r,level:Math.min(r.level||0,5)};
  }
  const settings=value.settings||{};
  result.settings.count=Number.isInteger(settings.count)&&settings.count>=1&&settings.count<=161?settings.count:5;
  result.settings.unit=units[settings.unit]?settings.unit:'';
  result.settings.type=qs.some(q=>q.t===settings.type)?settings.type:'';
  result.settings.unitSelections=StudyControls.selection(settings.unitSelections,result.settings.unit,[...new Set(qs.map(q=>q.u))]);
  result.settings.typeSelections=StudyControls.selection(settings.typeSelections,result.settings.type,[...new Set(qs.map(q=>q.t))]);
  result.settings.scope=['all','unseen','wrong','star','later','due'].includes(settings.scope)?settings.scope:'all';
  result.settings.order=['sequence','random','smart'].includes(settings.order)?settings.order:'sequence';
  result.settings.mode=['answer','read','recall'].includes(settings.mode)?settings.mode:'answer';
  result.settings.instantAnswer=settings.instantAnswer!==false;
  result.settings.autoNext=settings.autoNext===true;
  result.settings.correctAutoNext=settings.correctAutoNext!==false;
  result.settings.focus=settings.focus===true;
  result.settings.font=settings.font==='large'?'large':'normal';
  result.letter=typeof value.letter==='string'?value.letter.slice(0,100):'';
  result.session=normalizeSession(value.session);
  result.pausedSessions=Array.isArray(value.pausedSessions)?value.pausedSessions.map(normalizeSession).filter(Boolean):[];
  return result;
}
function migrateGitHubProgress(raw) {
  const migrated=fresh();
  if(!raw||typeof raw!=='object')return migrated;
  const typeNames={'单选题':'single','多选题':'multiple','判断题':'judge'};
  const oldIds=Object.fromEntries(qs.filter(q=>q.key).map(q=>['u'+q.u.padStart(2,'0')+'-'+typeNames[q.t]+'-'+q.n.padStart(3,'0'),q.id]));
  const favorites=new Set(Array.isArray(raw.favorites)?raw.favorites:[]),wrong=new Set(Array.isArray(raw.wrong)?raw.wrong:[]);
  const sourceRecords=raw.records&&typeof raw.records==='object'?raw.records:{};
  for(const [oldId,id] of Object.entries(oldIds)) {
    const r=sourceRecords[oldId];
    if(!r&&!favorites.has(oldId)&&!wrong.has(oldId))continue;
    const next={star:favorites.has(oldId),wrong:wrong.has(oldId)||r?.lastCorrect===false,level:0,due:0};
    if(Number.isFinite(r?.attempts)&&r.attempts>0){next.seen=Math.floor(r.attempts);next.right=Math.min(next.seen,Number.isFinite(r.correct)?Math.max(0,Math.floor(r.correct)):0);}
    if(Number.isFinite(r?.updatedAt)&&r.updatedAt>=0){next.last=r.updatedAt;next.viewed=r.updatedAt;}
    migrated.records[id]=next;
  }
  const old=raw.session;
  if(old&&Array.isArray(old.ids)) {
    const ids=[...new Set(old.ids.map(id=>oldIds[id]).filter(id=>Number.isInteger(id)))];
    if(ids.length) {
      const oldIndex=Number.isInteger(old.index)?Math.max(0,old.index):0;
      const current=old.ids.slice(oldIndex).map(id=>oldIds[id]).find(id=>ids.includes(id));
      const answers={};
      for(const oldId of old.ids) {
        const id=oldIds[oldId],a=old.answers?.[oldId];
        if(!Number.isInteger(id)||!a||!Array.isArray(a.selected))continue;
        const selected=a.selected.map(key=>qs[id].t==='判断题'?({A:'√',B:'×'}[key]||key):key).filter(key=>qs[id].o.some(option=>option[0]===key));
        const rated=typeof a.correct==='boolean'&&!!migrated.records[id]?.seen;
        answers[id]={selected,draft:'',revealed:true,rated,skipAuto:true,...(typeof a.correct==='boolean'?{correct:a.correct}:{}),...(rated?{grade:a.correct?'good':'again'}:{})};
      }
      migrated.session={id:sessionId(),ids,index:current===undefined?0:ids.indexOf(current),answers,title:'原站上次练习',mode:'answer'};
    }
  }
  return migrated;
}
let data=fresh();
try {
  const stored=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(stored) data=normalize(stored);
  else {
    const githubOld=JSON.parse(localStorage.getItem('hvac-study-v1')||'null');
    if(githubOld)data=migrateGitHubProgress(githubOld);
    const old=JSON.parse(localStorage.getItem('hvacWrongV1')||'{}');
    Object.keys(old).filter(id=>qs[id] && old[id]).forEach(id=>data.records[id]={...data.records[id],wrong:true,due:0});
  }
} catch {
  try { const damaged=localStorage.getItem(STORAGE);if(damaged)localStorage.setItem(STORAGE+'-recovery',damaged); } catch {}
  toast('旧记录读取失败。可在“学习记录”找恢复原件，或导入之前的备份。');
}
function save() {
  try { localStorage.setItem(STORAGE,JSON.stringify(data)); }
  catch { toast('当前浏览器无法保存，请导出记录备份。'); }
}
function record(id) { return data.records[id]||{}; }
function isDue(q) { const r=record(q.id);return (r.seen||r.wrong) && (r.due||0)<=Date.now(); }
function activeSession() { return data.session && data.session.index<data.session.ids.length; }
function dayKey(time=Date.now()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
}
function examState(now=Date.now()) {
  if(now>=EXAM_END)return '考试已结束，辛苦了';
  if(now>=EXAM_START)return '考试进行中';
  const midnight=Date.parse(dayKey(now)+'T00:00:00+08:00');
  const days=Math.round((Date.parse('2026-11-17T00:00:00+08:00')-midnight)/DAY);
  return days>0?'距离考试 '+days+' 天':'今天 14:00 开考';
}
function shuffled(items) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
const menus=[['home','首页'],['practice','题库'],['wrong','复习'],['star','收藏']];
function go(next) {
  commitPendingAnswer();
  applyAppearance(false);
  view=next;
  document.getElementById('nav').innerHTML=menus.map(([id,label])=>'<button data-view="'+id+'" class="'+(id===view?'active':'')+'" '+(id===view?'aria-current="page"':'')+'>'+label+'</button>').join('');
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{filters={unit:'',type:'',search:''};go(button.dataset.view);});
  if(view==='home')renderHome();else renderSetup();
  window.scrollTo(0,0);
}
function renderHome() {
  const done=qs.filter(q=>(record(q.id).seen||record(q.id).viewed)).length;
  const wrong=qs.filter(q=>record(q.id).wrong).length;
  const due=qs.filter(isDue).length;
  const today=qs.filter(q=>[record(q.id).viewed,record(q.id).last].some(t=>t&&dayKey(t)===dayKey())).length;
  main.innerHTML='<small>原文题库 · 161 道</small><h1>有空，就练一点。</h1><p class="home-intro">写论文、等答辩、准备考证的间隙，随时回来接着学。</p>'+
    '<div class="home-grid"><section class="ticket" aria-label="考试安排"><div class="ticket-top"><div><small>2026 年 11 月</small><div class="ticket-date">11<span> / </span>17</div></div><span class="exam-state" id="exam-state">'+examState()+'</span></div>'+
    '<div class="ticket-body"><div class="exam-time">14:00 — 15:30</div><p class="exam-room">B7 一楼 · 106 合班教室</p><small>通风与空调工程 · 北京时间 · 90 分钟</small><div class="ticket-actions"><button id="copy-exam">复制考试信息</button><button id="bookmark">保存考前书签</button></div></div></section>'+
    '<section class="start-panel"><h3>这一轮，由你决定。</h3><p>可以只练一道，也可以直接翻答案。</p>'+
    (activeSession()?'<button class="primary big-start" id="resume">接着上次<span>→</span><small>'+sessionCaption(data.session)+'</small><small class="resume-stem">'+escapeHTML(qs[data.session.ids[data.session.index]].s)+'</small></button>':'')+
    '<div class="quick-entry"><button id="one" '+(!activeSession()?'class="primary"':'')+'>先练一道</button><button id="browse">随手翻翻</button></div>'+
    '<details class="free-settings"><summary>自己选范围、题量和方式</summary><p class="filter-help">章节和题型可多选；不勾选本组时不会出题。其他项目直接点选。</p><div class="free-fields">'+
    '<label>题目范围<select id="free-scope"><option value="all">全部原文题</option><option value="unseen">还没练过</option><option value="wrong">错题与待巩固</option><option value="star">收藏与笔记</option><option value="later">留待稍后</option><option value="due">推荐复习</option></select></label>'+
    '<label>章节<select id="free-unit"><option value="">全部章节</option>'+Object.entries(units).map(([id,n])=>'<option value="'+id+'">'+escapeHTML(n)+'</option>').join('')+'</select></label>'+
    '<label>题型<select id="free-type"><option value="">全部题型</option>'+[...new Set(qs.map(q=>q.t))].map(t=>'<option>'+t+'</option>').join('')+'</select></label>'+
    '<label>出题顺序<select id="free-order"><option value="sequence">按原文顺序</option><option value="random">随机抽题</option><option value="smart">智能推荐</option></select></label>'+
    '<label>本轮题量<input id="free-count" type="number" min="1" max="161" inputmode="numeric"></label>'+
    '<label>练习方式<select id="free-mode"><option value="answer">作答后看解析</option><option value="read">直接背题看解析</option><option value="recall">回忆卡片</option></select></label></div>'+
    '<label class="switch-line"><input type="checkbox" id="auto-next">自评“记住了”后自动下一题</label>'+
    '<p id="available" class="muted" role="status" aria-live="polite"></p><div class="quick-entry"><button id="choose-all">练当前范围全部题</button><button id="daily" class="primary">按我的选择开始</button></div></details>'+
    '<details id="paused-list"><summary>放在这里的进度 · '+data.pausedSessions.length+'</summary><div id="paused-items"></div></details></section></div>'+
    '<div class="stats"><button id="all"><b>'+done+'<small> / 161</small></b><small>已接触</small></button><button id="due"><b>'+due+'</b><small>到期复习</small></button><button id="wrong"><b>'+wrong+'</b><small>待巩固</small></button></div>'+
    '<section class="panel progress-panel"><div class="topline"><div><h3>走过的每一道题</h3><small>'+Math.round(done/qs.length*100)+'% 已接触</small></div><button id="open-map" class="quiet">选一道 →</button></div><div class="stitches"></div><div class="map-legend"><span>灰 · 未接触</span><span>浅绿 · 看过</span><span class="mastered-key">深绿／亮绿 · 巩固</span><span class="weak-key">暖橙 · 再练</span><span>点题号直接跳转</span></div><p class="today-note">'+(today?'今天，已经拾起 '+today+' 道题。':'从任意一道开始，都算数。')+'</p>'+
    '<details><summary class="section-toggle">按章节看看</summary>'+Object.entries(units).map(([u,title])=>{
      const list=qs.filter(q=>q.u===u),count=list.filter(q=>record(q.id).seen||record(q.id).viewed).length;
      return '<button class="chapter" data-unit="'+u+'"><span>'+escapeHTML(title)+'</span><small>'+count+'/'+list.length+'</small><progress value="'+count+'" max="'+list.length+'"></progress></button>';
    }).join('')+'</details></section>'+
    '<section class="letter"><label for="letter"><h3>留一句话，给考前的自己</h3></label><textarea id="letter" class="note" maxlength="100" placeholder="比如：认真准备过，就从容一点。">'+escapeHTML(data.letter)+'</textarea><small>自动保存，也会写进你的考前书签。</small></section>'+
    '<details class="footnote"><summary>题库与记录说明</summary><p>来自你提供的 Word，共 65 道单选、37 道多选、54 道判断、4 道简答、1 道计算。助记词辅助回忆，参考答案沿用原文，有疑点的题目另作提示。</p><p>记住后的常规复习间隔为 1、3、7、14、30 天。同日重复答对只提升一次等级。考前会把较远的复习安排提前至 11 月 17 日上午 9 点。进度只存在当前浏览器，可在右上角导出备份。</p></details><details class="footnote"><summary>为什么有这一页</summary><p>开题报告、开题答辩、论文初稿、电工考证和期末考试，赶在了同一段日子里。于是我们把这 161 道题放到一起，给零散的时间留一个随手能打开的入口。</p><p>练到哪儿，就留在哪儿。忙完了，再接着来。</p></details>';
  const homeGrid=main.querySelector('.home-grid');homeGrid.prepend(homeGrid.querySelector('.start-panel'));
  bindFreeSettings();
  StudyControls.progress(qs,record,start);
  window.StudyExtras?.home({qs,read:record,begin:start,subject:'hvac'});
  document.getElementById('open-map').onclick=()=>openQuestionPicker(true);
  document.getElementById('one').onclick=()=>start([pickOne().id],'先练一道');
  document.getElementById('browse').onclick=()=>start(qs.map(q=>q.id),'随手翻翻','read');
  renderPausedSessions();
  if(activeSession())document.getElementById('resume').onclick=renderQuestion;
  document.getElementById('all').onclick=()=>go('practice');
  document.getElementById('due').onclick=()=>go('due');
  document.getElementById('wrong').onclick=()=>go('wrong');
  document.getElementById('letter').oninput=e=>{data.letter=e.target.value;save();};
  document.getElementById('copy-exam').onclick=copyExam;
  document.getElementById('bookmark').onclick=saveBookmark;
  document.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{filters.unit=b.dataset.unit;go('practice');});
}
function matchesSearch(q,text) {
  const term=text.trim();
  if(!term)return true;
  if(/^#?\d+$/.test(term))return q.id+1===Number(term.replace('#',''));
  return [q.s,...q.o||[],q.cue,q.exp,record(q.id).note||'',record(q.id).mnemonic||''].join(' ').toLocaleLowerCase().includes(term.toLocaleLowerCase());
}
function pool() {
  return qs.filter(q=>(!filters.unit||q.u===filters.unit) && (!filters.type||q.t===filters.type) &&
    (view!=='due'||isDue(q)) && (view!=='later'||record(q.id).later) && (view!=='wrong'||record(q.id).wrong) &&
    (view!=='star'||record(q.id).star||record(q.id).note||record(q.id).mnemonic) &&
    matchesSearch(q,filters.search));
}
function renderSetup() {
  const title={practice:'按自己的节奏，复习。',wrong:'再遇见，就记住。',star:'留给自己的重点。',due:'今天，再回想一次。',later:'先放一放，等你回来。'}[view];
  main.innerHTML='<small>'+({practice:'全部 161 道原文题',wrong:'答错的题、没记牢的题，都收在这里',star:'收藏与个人注记',due:'已到复习时间的题目',later:'你标记为稍后再看的题目'}[view])+'</small><h1>'+title+'</h1>'+
    '<div class="toolbar"><select id="unit" aria-label="章节"><option value="">全部章节</option>'+Object.entries(units).map(([id,n])=>'<option value="'+id+'">'+escapeHTML(n)+'</option>').join('')+'</select><select id="type" aria-label="题型"><option value="">全部题型</option>'+[...new Set(qs.map(q=>q.t))].map(t=>'<option>'+t+'</option>').join('')+'</select><input id="search" type="search" placeholder="题号、题干、选项或注记" aria-label="搜索题号、题目或注记"></div><div id="results"></div>';
  for(const key of ['unit','type','search']) {
    const node=document.getElementById(key);
    node.value=filters[key];
    node.oninput=()=>{filters[key]=node.value;renderResults();};
  }
  renderResults();
}
function renderResults() {
  const list=pool();
  document.getElementById('results').innerHTML='<div class="modes"><button class="primary" id="order">顺序练习</button><button id="random">随机练习</button><button id="cards">回忆卡片</button><button id="read">背题浏览</button></div><small>'+list.length+' 道题 · 回忆卡片会先隐藏选项</small>'+
    (list.length?list.map(q=>'<button class="list-item" data-q="'+q.id+'"><small>第 '+(q.id+1)+' 题 · 单元 '+q.u+' · '+q.t+'</small><p>'+escapeHTML(q.s)+'</p></button>').join(''):'<section class="panel empty">这里暂时没有题目。<p class="muted">可以换个筛选条件，或去题库继续练习。</p></section>');
  document.getElementById('order').onclick=()=>start(list.map(q=>q.id),'顺序练习');
  document.getElementById('random').onclick=()=>start(shuffled(list.map(q=>q.id)),'随机练习');
  document.getElementById('cards').onclick=()=>start(list.map(q=>q.id),'回忆卡片','recall');
  document.getElementById('read').onclick=()=>start(list.map(q=>q.id),'背题浏览','read');
  document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>start([Number(b.dataset.q)],'单题练习'));
}
function priority(q) {
  const r=record(q.id);
  if(isDue(q))return 1000+(r.wrong?50:0);
  if(!r.seen)return 500;
  return (r.wrong?300:100)+(5-(r.level||0))*10+(1-(r.right||0)/r.seen)*20;
}
function startSmart(exclude=[]) {
  const remaining=qs.filter(q=>!exclude.includes(q.id));
  const ordered=shuffled(remaining.length?remaining:qs).sort((a,b)=>priority(b)-priority(a));
  start(ordered.slice(0,data.settings.count).map(q=>q.id),'智能推荐');
}
function parkSession() {
  commitPendingAnswer();
  if(activeSession()&&!data.session.finished) {
    data.pausedSessions=data.pausedSessions.filter(s=>s.id!==data.session.id);
    data.pausedSessions.unshift(data.session);
  }
}
function start(ids,title,mode='answer',index=0) {
  if(!ids.length){toast('这个范围暂时没有题目，可以换个条件。');return;}
  parkSession();
  data.session={id:sessionId(),ids,index,answers:{},title,mode};
  save();renderQuestion();window.scrollTo(0,0);
}

function markViewed(id) {
  data.records[id]={...record(id),viewed:Date.now()};
  save();
}
function commitPendingAnswer() {
  const s=data.session,a=s?.answers[s.ids[s.index]];
  if(a && typeof a.correct==='boolean' && !a.rated&&!a.skipAuto)rate(a.correct?((a.hinted||a.peeked)?'hard':'good'):'again',false);
}
function moveTo(index) {
  if(!data.session || index<0 || index>=data.session.ids.length)return;
  commitPendingAnswer();data.session.index=index;save();renderQuestion();window.scrollTo(0,0);
}
function pickOne() {
  const unseen=qs.filter(q=>!record(q.id).seen);
  const list=unseen.length?unseen:qs;
  return list[Math.floor(Math.random()*list.length)];
}
function freePool() {
  const s=data.settings;
  return qs.filter(q=>StudyControls.matches(s.unitSelections,s.unit,q.u)&&StudyControls.matches(s.typeSelections,s.type,q.t)&&
    ({all:true,unseen:!record(q.id).seen,wrong:record(q.id).wrong,star:record(q.id).star||record(q.id).note||record(q.id).mnemonic,later:record(q.id).later,due:isDue(q)})[s.scope]);
}
function bindFreeSettings() {
  const update=()=>{const count=freePool().length;document.getElementById('available').textContent='当前范围 '+count+' 道 · 本轮 '+Math.min(count,data.settings.count)+' 道；练全部会出 '+count+' 道。';document.getElementById('daily').disabled=!count;document.getElementById('choose-all').disabled=!count;};
  for(const key of ['scope','unit','type','order','count','mode']) {
    const node=document.getElementById('free-'+key);node.value=data.settings[key];
    node.onchange=()=>{
      if(key==='count') {
        const n=Number(node.value);
        if(!Number.isInteger(n)||n<1||n>qs.length){toast('题量可以选 1 到 161 道');node.value=data.settings.count;return;}
        data.settings.count=n;
      } else data.settings[key]=node.value;
      save();update();
    };
  }
  StudyControls.filters(data.settings,()=>{save();update();});
  const auto=document.getElementById('auto-next');auto.checked=data.settings.autoNext;
  auto.onchange=()=>{data.settings.autoNext=auto.checked;save();};
  const begin=all=>{
    let list=freePool();
    if(!list.length){toast('这个范围暂时没有题目，可以换个条件。');return;}
    const count=Number(document.getElementById('free-count').value);
    if(!all&&(!Number.isInteger(count)||count<1||count>qs.length)){toast('题量可以选 1 到 161 道');return;}
    data.settings.count=all?list.length:count;
    if(data.settings.order==='random')list=shuffled(list);
    if(data.settings.order==='smart')list=shuffled(list).sort((a,b)=>priority(b)-priority(a));
    start(list.slice(0,data.settings.count).map(q=>q.id),'自由练习',data.settings.mode);
  };
  document.getElementById('daily').onclick=()=>begin(false);
  document.getElementById('choose-all').onclick=()=>begin(true);
  update();
}
function sessionCaption(s) {
  const id=s.ids[s.index],mode={answer:'作答',read:'背题',recall:'回忆'}[s.mode]||'作答';
  return mode+' · 原文第 '+(id+1)+' 题 · 本轮 '+(s.index+1)+' / '+s.ids.length;
}
function renderPausedSessions() {
  const container=document.getElementById('paused-items');
  if(!data.pausedSessions.length)container.innerHTML='<p class="muted">另开一轮时，这里的旧进度会替你收好。</p>';
  for(const session of data.pausedSessions) {
    const button=document.createElement('button');button.className='saved-session';
    button.innerHTML='<b>'+escapeHTML(session.title)+'</b><small>'+sessionCaption(session)+'</small><span class="resume-stem">'+escapeHTML(qs[session.ids[session.index]].s)+'</span>';
    button.onclick=()=>{
      data.pausedSessions=data.pausedSessions.filter(s=>s.id!==session.id);
      parkSession();data.session=session;save();renderQuestion();window.scrollTo(0,0);
    };
    container.append(button);
  }
  const later=document.createElement('button');later.className='saved-session';
  later.textContent='留待稍后的题 · '+qs.filter(q=>record(q.id).later).length;
  later.onclick=()=>{filters={unit:'',type:'',search:''};go('later');};container.append(later);
}
function applyAppearance(practicing) {
  document.body.classList.toggle('is-practicing',practicing);
  document.body.classList.toggle('focus-mode',practicing&&data.settings.focus);
  document.body.dataset.font=data.settings.font;
}
function openStudySettings() {
  document.getElementById('study-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='study-dialog';dialog.setAttribute('aria-labelledby','study-title');
  const s=data.session,id=s.ids[s.index];
  dialog.innerHTML='<div class="topline"><h3 id="study-title">按舒服的方式练</h3><button id="close-study">完成</button></div><div class="study-fields">'+
    '<label>练习方式<select id="session-mode"><option value="answer">作答后看解析</option><option value="read">直接背题看解析</option><option value="recall">回忆卡片</option></select></label>'+
    '<label>题目字号<select id="font-size"><option value="normal">标准</option><option value="large">大字</option></select></label></div>'+
    '<label class="switch-line"><input type="checkbox" id="focus-toggle">专注模式：收起页头和底部导航</label>'+
    '<label class="switch-line"><input type="checkbox" id="correct-auto-next">手动提交后答对自动下一题，答错停留</label>'+
    '<label class="switch-line"><input type="checkbox" id="instant-answer">点选即判题：单选即判，多选选满即判；答对直接下一题</label>'+
    '<label class="switch-line"><input type="checkbox" id="session-auto-next">自评“记住了”后自动下一题</label>'+
    '<div class="study-actions"><button id="later">'+(record(id).later?'取消留待稍后':'这道题留待稍后')+'</button><button id="end-round">这次先到这里</button></div><p class="muted">选择会自动保存。暂停后，位置和草稿也会留下。</p>';
  document.body.append(dialog);
  dialog.querySelector('#close-study').onclick=()=>dialog.close();
  const instant=dialog.querySelector('#instant-answer');instant.checked=data.settings.instantAnswer;
  instant.onchange=()=>{data.settings.instantAnswer=instant.checked;save();renderQuestion();};
  const mode=dialog.querySelector('#session-mode');mode.value=s.mode;
  mode.onchange=()=>{commitPendingAnswer();s.mode=mode.value;save();dialog.close();renderQuestion();};
  const font=dialog.querySelector('#font-size');font.value=data.settings.font;
  font.onchange=()=>{data.settings.font=font.value;save();applyAppearance(true);};
  const focus=dialog.querySelector('#focus-toggle');focus.checked=data.settings.focus;
  focus.onchange=()=>{data.settings.focus=focus.checked;save();applyAppearance(true);};
  const correctAuto=dialog.querySelector('#correct-auto-next');correctAuto.checked=data.settings.correctAutoNext;
  correctAuto.onchange=()=>{data.settings.correctAutoNext=correctAuto.checked;save();};
  const auto=dialog.querySelector('#session-auto-next');auto.checked=data.settings.autoNext;
  auto.onchange=()=>{data.settings.autoNext=auto.checked;save();};
  dialog.querySelector('#later').onclick=e=>{data.records[id]={...record(id),later:!record(id).later};save();e.target.textContent=record(id).later?'取消留待稍后':'这道题留待稍后';};
  dialog.querySelector('#end-round').onclick=()=>{commitPendingAnswer();dialog.close();renderSummary();};
  dialog.showModal();
}
function openQuestionPicker(all=false) {
  all=all===true;
  document.getElementById('question-picker')?.remove();
  const dialog=document.createElement('dialog');dialog.id='question-picker';dialog.setAttribute('aria-labelledby','picker-title');
  dialog.innerHTML='<div class="topline"><h3 id="picker-title">'+(all?'题目地图':'本轮选题')+'</h3><button id="close-picker">关闭</button></div><p class="muted">数字是原文题号。随时跳到想看的那一道。</p>'+
    (all?'<div class="map-filters"><label>题目范围<select id="map-filter"><option value="all">全部原文题</option><option value="unseen">还没看过</option><option value="wrong">需要再巩固</option><option value="star">收藏与笔记</option><option value="later">留待稍后</option></select></label><label>找题号<input id="map-number" type="search" inputmode="numeric" placeholder="例如 106"></label></div>':'')+
    '<p class="muted" id="map-count"></p><div class="picker-grid"></div>';
  document.body.append(dialog);
  dialog.querySelector('#close-picker').onclick=()=>dialog.close();
  const s=data.session;
  const render=()=>{
    const scope=all?dialog.querySelector('#map-filter').value:'all';
    const number=all?dialog.querySelector('#map-number').value.trim():'';
    const list=(all?qs.map(q=>q.id):s.ids).filter(id=>{
      const r=record(id);
      return (!number||String(id+1)===number)&&({all:true,unseen:!r.seen&&!r.viewed,wrong:r.wrong,star:r.star||r.note||r.mnemonic,later:r.later})[scope];
    });
    const grid=dialog.querySelector('.picker-grid');grid.replaceChildren();
    dialog.querySelector('#map-count').textContent=list.length?'共 '+list.length+' 道 · 点题号就能开始':'这里暂时没有题目，可以换个条件。';
    list.forEach(id=>{
      const a=s?.answers[id],r=record(id);
      const status=all?(r.wrong?'再巩固':r.level>=3?'已巩固':r.seen?'已练过':r.viewed?'已翻看':'未看过'):(a?.rated?(a.grade==='good'?'已记住':'再巩固'):a?.revealed?'已翻看':'未作答');
      const button=document.createElement('button');button.innerHTML=(id+1)+'<small>'+status+'</small>';button.dataset.id=id;
      button.className=status==='再巩固'?'weak':['已记住','已巩固','已练过'].includes(status)?'rated':status==='已翻看'?'viewed':'';
      button.setAttribute('aria-label','第 '+(id+1)+' 题，'+status);
      if(!all&&id===s.ids[s.index])button.setAttribute('aria-current','true');
      button.onclick=()=>{dialog.close();if(all)start(list,'地图选题','answer',list.indexOf(id));else moveTo(s.ids.indexOf(id));};grid.append(button);
    });
  };
  if(all){dialog.querySelector('#map-filter').onchange=render;dialog.querySelector('#map-number').oninput=render;}
  render();
  dialog.showModal();
}
function currentAnswer() {
  const s=data.session,id=s.ids[s.index];
  return s.answers[id] ||= {selected:[],draft:'',revealed:false,rated:false};
}
function renderQuestion() {
  if(!activeSession()){go('home');return;}
  applyAppearance(true);
  const s=data.session,id=s.ids[s.index],q=qs[id],a=currentAnswer(),r=record(id);
  if(s.mode==='read'&&!a.revealed){a.revealed=true;a.peeked=true;markViewed(id);}
  main.innerHTML='<div class="question-wrap"><div class="topline"><button id="back" class="quiet">← 暂停，回首页</button><button class="quiet" id="jump">选题 · '+(s.index+1)+' / '+s.ids.length+'</button></div><div class="session-tools"><button id="hint">助记提示</button><button id="peek">看答案</button><button id="study-settings">练习设置</button></div><button id="exit-focus" class="quiet">专注中 · 退出专注</button>'+
    '<section class="card"><div class="question-meta"><span>第 '+(id+1)+' 题 · 单元 '+q.u+' · '+q.t+'</span><button id="star" class="quiet" aria-pressed="'+!!r.star+'">'+(r.star?'★ 已收藏':'☆ 收藏')+'</button></div>'+
    '<progress aria-label="本轮已接触进度" value="'+Object.values(s.answers).filter(x=>x.revealed||x.rated).length+'" max="'+s.ids.length+'"></progress><h2>'+escapeHTML(q.s)+'</h2><p class="choice-status" id="choice-status" aria-live="polite"></p><div class="options" id="options"></div><div id="hint-content" aria-live="polite">'+(a.hinted&&!a.revealed?'<div class="memory hint-memory"><small>助记提示 · 可能含答案线索</small><p>'+escapeHTML(record(q.id).mnemonic||q.cue)+'</p>'+(q.warning?'<p class="warn">'+escapeHTML(q.warning)+'</p>':'')+'<small>看过提示后，试着用自己的话回忆。</small></div>':'')+'</div>'+
    '<div id="feedback" aria-live="polite"></div><div id="rating" class="rating-buttons"></div><details class="recall-note" '+(r.note?'open':'')+'><summary>我的注记</summary><textarea id="note" class="note" placeholder="写下理解、易错点，或自己的口诀">'+escapeHTML(r.note||'')+'</textarea><small>自动保存</small></details>'+
    '<button id="restart-question" class="quiet">重新答这道题</button>'+'</section><div class="answer-dock" id="actions"></div></div>';
  main.querySelector('.card').dataset.result=a.correct===false?'wrong':a.correct===true?'correct':'pending';
  document.getElementById('back').onclick=()=>go('home');
  document.getElementById('star').onclick=e=>{data.records[id]={...record(id),star:!record(id).star};save();e.currentTarget.textContent=record(id).star?'★ 已收藏':'☆ 收藏';e.currentTarget.setAttribute('aria-pressed',String(!!record(id).star));};
  document.getElementById('note').oninput=e=>{data.records[id]={...record(id),note:e.target.value};save();};
  document.getElementById('jump').onclick=()=>openQuestionPicker();
  document.getElementById('study-settings').onclick=openStudySettings;
  document.getElementById('exit-focus').onclick=()=>{data.settings.focus=false;save();applyAppearance(true);};
  document.getElementById('hint').disabled=a.revealed||a.hinted;
  document.getElementById('hint').onclick=()=>{a.hinted=true;save();renderQuestion();document.getElementById('hint-content').scrollIntoView({block:'center'});};
  document.getElementById('peek').onclick=()=>{a.revealed=true;a.peeked=true;markViewed(id);save();renderQuestion();document.getElementById('feedback').scrollIntoView({block:'start'});};
  document.getElementById('peek').disabled=a.revealed;
  document.getElementById('restart-question').onclick=()=>{commitPendingAnswer();delete s.answers[id];s.mode='answer';save();renderQuestion();};

  const options=document.getElementById('options');
  if(q.key && s.mode!=='recall') {
    for(const option of q.o) {
      const button=document.createElement('button'),key=option[0],selected=a.selected.includes(key);
      button.dataset.key=key;
      button.className='option'+(selected?' selected':'')+(a.revealed&&q.key.includes(key)?' correct':'')+(a.revealed&&selected&&!q.key.includes(key)?' incorrect':'');
      button.innerHTML='<span class="option-key">'+key+'</span><span class="option-text">'+escapeHTML(option.slice(1).replace(/^\.\s*/,''))+'</span><span class="option-state" aria-hidden="true"></span>';
      button.setAttribute('aria-pressed',String(selected));
      button.disabled=a.revealed;
      button.onclick=()=>{
        if(a.revealed || data.session!==s || s.ids[s.index]!==id)return;
        a.selected=q.t==='多选题'?(a.selected.includes(key)?a.selected.filter(v=>v!==key):[...a.selected,key]):[key];
        save();updateChoiceUI(q,a);
        if(data.settings.instantAnswer && s.mode==='answer' && a.selected.length===q.key.length)submitCurrentAnswer();
      };
      options.append(button);
    }
  } else if(s.mode!=='read') {
    options.innerHTML='<textarea id="draft" class="note" placeholder="先试着回忆，可以在这里写下答案">'+escapeHTML(a.draft)+'</textarea>';
    document.getElementById('draft').oninput=e=>{a.draft=e.target.value;save();};
  }
  updateChoiceUI(q,a);
  action('上一题',()=>moveTo(s.index-1));
  document.getElementById('actions').lastElementChild.disabled=s.index===0;
  if(a.revealed)renderFeedback(q,a);
  else action(q.key&&s.mode==='answer'?(data.settings.instantAnswer?'提前提交当前选择':'提交答案'):'翻看答案',submitCurrentAnswer,true);
  action(s.index===s.ids.length-1?'本轮小结':a.revealed?'下一题':'先跳过',next,a.revealed);
}
function submitCurrentAnswer() {
  const s=data.session;if(!s||s.finished)return;
  const id=s.ids[s.index],q=qs[id],a=currentAnswer();
  if(!q||a.revealed)return;
  if(q.key&&s.mode==='answer'&&!a.selected.length){toast('先选择答案。');return;}
  a.revealed=true;markViewed(id);
  if(q.key&&s.mode==='answer')a.correct=[...a.selected].sort().join('')===[...q.key].sort().join('');
  commitPendingAnswer();save();
  if(a.correct===true&&(data.settings.instantAnswer||data.settings.correctAutoNext)){next();toast('答对了 ✓');return;}
  renderQuestion();document.getElementById('feedback')?.scrollIntoView({block:'start'});
}
function updateChoiceUI(q,a) {
  const node=document.getElementById('choice-status');
  if(node)node.textContent=!q.key||data.session.mode!=='answer'||a.revealed?'':data.settings.instantAnswer?(q.t==='多选题'?'选满 '+q.key.length+' 项自动判题 · 已选 '+a.selected.length+' 项 · 未满可取消':'点选即判题 · 答对直接下一题'):(q.t==='多选题'?'多选题 · 已选 '+a.selected.length+' 项 · 可再次点击取消':'选择一项，再点下方提交');
  document.querySelectorAll('#options .option').forEach(button=>{
    const key=button.dataset.key,selected=a.selected.includes(key),correct=q.key.includes(key);
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
    const status=a.revealed?(typeof a.correct==='boolean'?(correct?(selected?'选对':q.t==='多选题'?'漏选':'答案'):(selected?'错选':'')):(correct?'答案':'')):(selected?'已选':'');
    button.querySelector('.option-state').textContent=status;
    button.setAttribute('aria-label',button.querySelector('.option-key').textContent+' '+button.querySelector('.option-text').textContent+(status?'，'+status:''));
  });
}
function action(label,handler,primary=false,detail='',target='actions') {
  const button=document.createElement('button');
  button.innerHTML=escapeHTML(label)+(detail?'<small>'+escapeHTML(detail)+'</small>':'');
  button.onclick=handler;
  if(primary)button.className='primary';
  document.getElementById(target).append(button);
}
function reviewTime(grade,previous,now=Date.now()) {
  const level=Math.min((previous.level||0)+(previous.lastGoodDay!==dayKey(now)?1:0),5);
  const delay=grade==='again'?600000:grade==='hard'?DAY:intervals[Math.max(0,level-1)]*DAY;
  const due=now+delay;
  return now<LAST_REVIEW?Math.min(due,LAST_REVIEW):due;
}
function renderFeedback(q,a) {
  const heading=a.correct===undefined?'对照答案，看看记住了多少':a.correct?'答对了':'记住这一次，下次再试';
  document.getElementById('feedback').innerHTML='<div class="feedback"><h3>'+heading+'</h3>'+
    (q.key?'<div class="answer-comparison">'+(typeof a.correct==='boolean'?'<p>你的答案 <b>'+escapeHTML([...a.selected].sort().join('、'))+'</b></p>':'')+'<p>参考答案 <b>'+escapeHTML([...q.key].join('、'))+'</b></p></div>':'')+
    (q.warning?'<p class="warn">'+escapeHTML(q.warning)+'</p>':'')+
    '<div class="memory"><small>联想助记</small><p>'+escapeHTML(record(q.id).mnemonic||q.cue)+'</p></div>'+
    '<details open><summary>解析与参考答案</summary><p>'+escapeHTML(q.exp)+'</p></details></div>';
  const editor=document.createElement('details');editor.className='mnemonic-editor';
  editor.innerHTML='<summary>换成我的助记</summary><label for="my-mnemonic">写下你脑海里的画面或顺口溜</label><textarea id="my-mnemonic" class="note" maxlength="500" placeholder="例如：风管像道路，风量越大，需要的路越宽。">'+escapeHTML(record(q.id).mnemonic||'')+'</textarea><small>自动保存；清空后恢复题库助记。</small>';
  document.querySelector('#feedback .memory').after(editor);
  editor.querySelector('textarea').oninput=event=>{data.records[q.id]={...record(q.id),mnemonic:event.target.value};save();document.querySelector('#feedback .memory p').textContent=event.target.value||q.cue;};
  if(q.key&&a.correct===false&&q.t==='多选题') {
    const missing=[...q.key].filter(key=>!a.selected.includes(key));
    const extra=a.selected.filter(key=>!q.key.includes(key));
    const differences=[missing.length?'漏选 '+missing.join('、'):'',extra.length?'错选 '+extra.sort().join('、'):''].filter(Boolean).join('；');
    document.querySelector('.answer-comparison').insertAdjacentHTML('beforeend','<p class="answer-difference">'+escapeHTML(differences)+'</p>');
  }
  if(a.hinted)document.getElementById('feedback').insertAdjacentHTML('beforeend','<p class="hint-notice">这次用过助记提示。答对后默认安排再巩固，你也可以调整复习安排。</p>');
  if(a.correct===false) {
    document.getElementById('feedback').insertAdjacentHTML('beforeend','<details class="reason"><summary>记一下错因（可选）</summary><select id="reason" aria-label="错题原因"><option value="">选择原因</option><option>概念混淆</option><option>漏看条件</option><option>公式或单位</option><option>多选漏选</option><option>记忆模糊</option></select></details>');
    document.getElementById('reason').value=record(q.id).reason||'';
    document.getElementById('reason').onchange=e=>{data.records[q.id]={...record(q.id),reason:e.target.value};save();};
  }
  const rating=document.getElementById('rating');
  if(a.rated) {
    rating.innerHTML='<div class="saved-rating" role="status"><b>已记录 · '+({good:a.correct===true?'答对了':'记住了',hard:'再巩固',again:'需要重练'}[a.grade]||'已完成')+'</b><small>建议复习：'+reviewLabel(record(q.id).due)+'</small></div>';
    if(canEditRating(q.id,a)) {
      if(a.correct!==false)action(a.editRating?'收起调整':'调整复习安排',()=>{a.editRating=!a.editRating;renderQuestion();},false,'','rating');
      action('撤销本次记录',()=>undoRating(q.id,a),false,'','rating');
    }
    if(!a.editRating)return;
  } else rating.innerHTML='<p class="rating-help">'+(a.skipAuto?'本次记录已撤销，可重新评价，也可直接下一题。':'自评可选；直接下一题只记录看过。')+'</p>';
  rating.insertAdjacentHTML('beforeend','<div id="rating-choices" class="rating-choices"></div>');
  if(a.correct===false)action('记为需要重练',()=>rate('again'),false,'','rating-choices');
  else {
    action('没记住',()=>rate('again'),false,'稍后再练','rating-choices');
    action('有点模糊',()=>rate('hard'),false,'再巩固一次','rating-choices');
    action('记住了',()=>rate('good'),true,'记录掌握','rating-choices');
  }
}
function reviewLabel(time) {
  if(!Number.isFinite(time))return '下次回来时';
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
}
function canEditRating(id,a) {
  return !!a.ratingBefore&&!!a.ratingToken&&record(id).ratingToken===a.ratingToken;
}
function undoRating(id,a) {
  if(!canEditRating(id,a)){toast('这道题已有更新的记录，本次不再覆盖。');return;}
  const restored={...record(id)};
  LEARNING_KEYS.forEach(key=>delete restored[key]);
  Object.assign(restored,a.ratingBefore);data.records[id]=restored;
  a.rated=false;a.skipAuto=true;a.editRating=false;
  delete a.grade;delete a.ratingBefore;delete a.ratingToken;
  save();renderQuestion();toast('已撤销本次记录，笔记和收藏仍保留');
}
function rate(grade,updateView=true) {
  const s=data.session,id=s.ids[s.index],a=currentAnswer();
  const editing=a.rated;
  if(editing&&!canEditRating(id,a)){toast('这道题已有更新的记录，本次不再覆盖。');return;}
  if(!editing)a.ratingBefore=Object.fromEntries(LEARNING_KEYS.filter(key=>record(id)[key]!==undefined).map(key=>[key,record(id)[key]]));
  const r=a.ratingBefore,correct=a.correct===undefined?grade==='good':a.correct;
  const level=grade==='good'?Math.min((r.level||0)+(r.lastGoodDay!==dayKey()?1:0),5):0;
  a.ratingToken=sessionId();
  data.records[id]={...record(id),seen:(r.seen||0)+1,right:(r.right||0)+(correct?1:0),wrong:grade!=='good',level,due:reviewTime(grade,r),last:Date.now(),lastGoodDay:grade==='good'?dayKey():r.lastGoodDay,ratingToken:a.ratingToken};
  a.rated=true;a.grade=grade;a.editRating=false;a.skipAuto=false;
  save();
  if(updateView){if(data.settings.autoNext&&!editing&&grade==='good'&&a.correct!==false)next();else renderQuestion();}
}
function next() {
  commitPendingAnswer();
  const s=data.session;
  if(s.index<s.ids.length-1){s.index++;save();renderQuestion();window.scrollTo(0,0);return;}
  s.finished=s.ids.every(id=>s.answers[id]?.revealed||s.answers[id]?.rated);save();
  renderSummary();
}
function renderSummary() {
  applyAppearance(false);
  const s=data.session;
  const covered=s.ids.filter(id=>s.answers[id]?.revealed||s.answers[id]?.rated).length;
  s.finished=covered===s.ids.length;save();
  const completed=s.ids.filter(id=>s.answers[id]?.rated).length;
  const remembered=s.ids.filter(id=>s.answers[id]?.grade==='good').length;
  const weak=s.ids.filter(id=>s.answers[id]?.rated&&s.answers[id].grade!=='good');
  main.innerHTML='<section class="panel empty"><div class="summary-mark" aria-hidden="true">✓</div><small>进度已经留好了。</small><h1>这次，就到这里。</h1><p>翻看 '+s.ids.filter(id=>s.answers[id]?.revealed).length+' 道 · 作答 / 自评 '+completed+' 道 · 记住 '+remembered+' 道</p><p class="muted">'+(weak.length?'还有 '+weak.length+' 道值得再回想一次。':'可以歇一会儿，再回来。')+'</p><div class="finish-actions"><button id="finish" class="primary">收好进度，回首页</button>'+
    (covered<s.ids.length?'<button id="remaining">继续还没看过的题</button>':'')+(weak.length?'<button id="retry">再看这 '+weak.length+' 道</button>':'')+'<button id="another">再来一小轮</button></div><p class="footnote">11 月 17 日 · 14:00—15:30 · B7 一楼 106 合班教室</p></section>';
  document.getElementById('finish').onclick=()=>{if(s.finished)data.session=null;save();go('home');};
  document.getElementById('another').onclick=()=>startSmart(s.ids);
  if(weak.length)document.getElementById('retry').onclick=()=>start(weak,'再巩固一次');
  if(covered<s.ids.length)document.getElementById('remaining').onclick=()=>{s.index=s.ids.findIndex(id=>!s.answers[id]?.revealed&&!s.answers[id]?.rated);save();renderQuestion();};
  window.scrollTo(0,0);
}
async function copyExam() {
  try { await navigator.clipboard.writeText(EXAM_TEXT);toast('考试信息已复制'); }
  catch { toast('复制未成功，可以长按考试信息选取文字。'); }
}
function download(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function wrapCanvas(ctx,text,x,y,width,lineHeight) {
  let line='';
  for(const char of text) {
    if(ctx.measureText(line+char).width>width){ctx.fillText(line,x,y);line='';y+=lineHeight;}
    line+=char;
  }
  ctx.fillText(line,x,y);
  return y+lineHeight;
}
function saveBookmark() {
  const canvas=document.createElement('canvas');
  canvas.width=1080;canvas.height=1440;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f7f5ef';ctx.fillRect(0,0,1080,1440);
  ctx.fillStyle='#fffefa';ctx.fillRect(65,65,950,1310);
  ctx.strokeStyle='#dedfd4';ctx.strokeRect(65,65,950,1310);
  ctx.fillStyle='#315f4c';ctx.font='30px "Microsoft YaHei", sans-serif';ctx.fillText('通风与空调 · 考前一页',115,145);
  ctx.font='130px Inter, sans-serif';ctx.fillText('11 / 17',110,330);
  ctx.fillStyle='#b76742';ctx.font='26px "Microsoft YaHei", sans-serif';ctx.fillText('2026 年 · 考前书签',120,390);
  ctx.setLineDash([8,10]);ctx.beginPath();ctx.moveTo(65,445);ctx.lineTo(1015,445);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#273d36';ctx.font='58px Inter, sans-serif';ctx.fillText('14:00 — 15:30',115,555);
  ctx.font='38px "Microsoft YaHei", sans-serif';ctx.fillText('B7 一楼 · 106 合班教室',115,635);
  ctx.font='24px "Microsoft YaHei", sans-serif';ctx.fillStyle='#68776c';ctx.fillText('北京时间 · 90 分钟',115,690);
  const done=qs.filter(q=>record(q.id).seen||record(q.id).viewed).length;
  ctx.fillText('已接触 '+done+' / 161 道',115,790);
  for(let i=0;i<qs.length;i++){
    ctx.fillStyle=record(i).seen?'#719079':record(i).viewed?'#bacbb1':'#e6e8df';
    ctx.fillRect(115+(i%23)*37,825+Math.floor(i/23)*28,23,17);
  }
  ctx.fillStyle='#273d36';ctx.font='32px "Microsoft YaHei", sans-serif';
  wrapCanvas(ctx,data.letter||'认真准备过，就从容一点。',115,1100,830,52);
  ctx.fillStyle='#68776c';ctx.font='22px "Microsoft YaHei", sans-serif';ctx.fillText('记录于 '+dayKey()+' · 把这一页留给自己',115,1320);
  canvas.toBlob(blob=>{if(blob){download(blob,'考前书签-2026-11-17.png');toast('书签已生成，可保存到相册');}else toast('书签生成失败，请重试。');},'image/png');
}
document.getElementById('brand').onclick=e=>{e.preventDefault();go('home');};
document.getElementById('backup').onclick=()=>download(new Blob([JSON.stringify({format:STORAGE,...data},null,2)],{type:'application/json'}),'通风空调学习记录.json');
// Keep a damaged original available without mixing it into a valid backup.
try {
  const recovery=localStorage.getItem(STORAGE+'-recovery');
  if(recovery){
    const button=document.createElement('button');button.id='recovery-export';
    button.textContent='导出异常记录原件（用于修复）';
    button.onclick=()=>download(new Blob([recovery],{type:'text/plain;charset=utf-8'}),'学习记录-待修复原件.txt');
    document.querySelector('.tool-menu').append(button);
  }
} catch {}
document.getElementById('import-button').onclick=()=>document.getElementById('restore').click();
const legacyExport=document.createElement('button');
legacyExport.textContent='导出原站旧记录（含考试历史）';
try {
  if(localStorage.getItem('hvac-study-v1')) {
    document.querySelector('.tool-menu').append(legacyExport);
    legacyExport.onclick=()=>download(new Blob([localStorage.getItem('hvac-study-v1')],{type:'application/json'}),'原站学习记录-含考试历史.json');
  }
} catch {}
document.getElementById('restore').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    const raw=JSON.parse(await file.text());
    if(raw.format!==STORAGE)throw Error();
    const imported=normalize(raw);
    if(!confirm('合并学习记录？相同题目采用备份中的记录。'))return;
    parkSession();
    data.records={...data.records,...imported.records};
    data.settings=imported.settings;
    if(typeof raw.letter==='string')data.letter=imported.letter;
    const sessions=[...(imported.session?[imported.session]:[]),...imported.pausedSessions,...data.pausedSessions];
    data.session=null;data.pausedSessions=sessions.filter((s,i)=>sessions.findIndex(other=>other.id===s.id)===i);save();go('home');toast('学习记录与暂存练习已导入');
  } catch {toast('请使用本站导出的学习记录文件。');}
  e.target.value='';
};
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE||!event.newValue)return;
  try{data=normalize(JSON.parse(event.newValue));go('home');toast('已同步其他标签页的进度');}catch{}
});
document.addEventListener('focusin',event=>{
  // Do not move a pointer-clicked button between pointerdown and click.
  if(event.target.matches('button,a,summary') && window.StudyExtras?.pointerRecent())return;
  clearTimeout(toastTimer);document.getElementById('toast').style.display='none';
  const target=event.target,dock=document.getElementById('actions');
  if(!dock||!target.getBoundingClientRect||target.closest('dialog,#actions')||getComputedStyle(dock).position!=='fixed')return;
  const rect=target.getBoundingClientRect();
  if(rect.bottom>dock.getBoundingClientRect().top-12)target.scrollIntoView({block:'center'});
});
document.addEventListener('pointerdown',()=>{clearTimeout(toastTimer);document.getElementById('toast').style.display='none';});
setInterval(()=>{const node=document.getElementById('exam-state');if(node)node.textContent=examState();},60000);
save();
go('home');

// Desktop shortcuts do not intercept typing, IME, or dialog interaction.
document.addEventListener('keydown',event=>{
 if(event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!document.body.classList.contains('is-practicing')||event.target.closest('input,textarea,select,[contenteditable="true"],dialog'))return;
 const choices=[...document.querySelectorAll('#options .option:not(:disabled)')];
 if(/^[1-4]$/.test(event.key)&&choices[Number(event.key)-1]){event.preventDefault();choices[Number(event.key)-1].click();}
});

// A new release is activated only when the learner chooses to load it.
window.addEventListener('study-before-update',()=>{commitPendingAnswer();save();});
// Review-sheet links open a stable original question and preserve the parked round.
{
 const requested=new URLSearchParams(location.search).get('question');
 if(requested && /^\d+$/.test(requested) && Number(requested)>=1 && Number(requested)<=qs.length){
  const url=new URL(location.href);url.searchParams.delete('question');history.replaceState(null,'',url.pathname+url.search+url.hash);
  start([Number(requested)-1],'从速记回看','answer');
 }
}
