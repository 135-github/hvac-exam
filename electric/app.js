'use strict';
const {qs, units} = window.BANK;
const STORAGE = 'electric-memory-v1';
const DAY = 86400000;
const intervals = [1,3,7,14,30];
const LEARNING_KEYS=['seen','right','wrong','level','due','last','lastGoodDay','ratingToken'];
const main = document.getElementById('main');
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view = 'home';
let filters = {unit:'', type:'', search:'',status:''};
let toastTimer;
const fresh = () => ({records:{},session:null,pausedSessions:[],settings:{count:5,unit:'',type:'',scope:'all',order:'sequence',mode:'answer',autoNext:false,focus:false,font:'normal'},letter:''});

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
  result.settings.count=Number.isInteger(settings.count)&&settings.count>=1&&settings.count<=180?settings.count:5;
  result.settings.unit=units[settings.unit]?settings.unit:'';
  result.settings.type=qs.some(q=>q.t===settings.type)?settings.type:'';
  result.settings.scope=['all','unseen','wrong','star','later','due','verified','reference'].includes(settings.scope)?settings.scope:'all';
  result.settings.order=['sequence','random','smart'].includes(settings.order)?settings.order:'sequence';
  result.settings.mode=['answer','read','recall'].includes(settings.mode)?settings.mode:'answer';
  result.settings.autoNext=settings.autoNext===true;
  result.settings.focus=settings.focus===true;
  result.settings.font=settings.font==='large'?'large':'normal';
  result.letter=typeof value.letter==='string'?value.letter.slice(0,100):'';
  result.session=normalizeSession(value.session);
  result.pausedSessions=Array.isArray(value.pausedSessions)?value.pausedSessions.map(normalizeSession).filter(Boolean):[];
  return result;
}
let data=fresh();
try {
  const stored=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(stored) data=normalize(stored);

} catch { toast('旧记录读取失败，可从备份导入。'); }
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
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{filters={unit:'',type:'',search:'',status:''};go(button.dataset.view);});
  if(view==='home')renderHome();else renderSetup();
  window.scrollTo(0,0);
}
function renderHome() {
  const done=qs.filter(q=>(record(q.id).seen||record(q.id).viewed)).length;
  const wrong=qs.filter(q=>record(q.id).wrong).length;
  const due=qs.filter(isDue).length;
  const today=qs.filter(q=>[record(q.id).viewed,record(q.id).last].some(t=>t&&dayKey(t)===dayKey())).length;
  main.innerHTML='<small>电工考证 · 独立题库 · 180 道</small><h1>有空，就练一点。</h1><p class="home-intro">写论文、等答辩、准备考证的间隙，随时回来接着学。</p>'+
    '<div class="home-grid"><section class="ticket electric-ticket" aria-label="电工题库概览"><div class="ticket-top"><div><small>电工综合模拟练习卷</small><div class="ticket-date">180<span> 道</span></div></div><span class="exam-state">随时续练</span></div>'+
    '<div class="ticket-body"><div class="exam-time">今天，学一点就好。</div><p>140 道单选 · 20 道多选 · 20 道判断</p><p class="muted">32 题已按平台截图核对；148 题仍为参考答案。每题均标明答案来源。</p><div class="ticket-actions"><button id="verified-only">只练已核对 32 题</button><button id="reference-only">查看待核对 148 题</button></div><details class="phone-help"><summary>下次，一点就进来</summary><p>在手机浏览器菜单中选“添加到主屏幕”或“收藏”。进度保存在当前浏览器，换手机前请导出记录。</p><button id="copy-link">复制电工题库链接</button><button id="bookmark">保存我的学习书签</button></details></div></section>'+
    '<section class="start-panel"><h3>这一轮，由你决定。</h3><p>可以只练一道，也可以直接翻答案。</p>'+
    (activeSession()?'<button class="primary big-start" id="resume">接着上次<span>→</span><small>'+sessionCaption(data.session)+'</small><small class="resume-stem">'+escapeHTML(qs[data.session.ids[data.session.index]].s)+'</small></button>':'')+
    '<div class="quick-entry"><button id="one" '+(!activeSession()?'class="primary"':'')+'>先练一道</button><button id="browse">随手翻翻</button></div>'+
    '<details class="free-settings"><summary>自己选范围、题量和方式</summary><div class="free-fields">'+
    '<label>题目范围<select id="free-scope"><option value="all">全部原文题</option><option value="verified">仅截图已核对的 32 题</option><option value="reference">待与平台核对的 148 题</option><option value="unseen">还没练过</option><option value="wrong">错题与待巩固</option><option value="star">收藏与笔记</option><option value="later">留待稍后</option><option value="due">推荐复习</option></select></label>'+
    '<label>题型分区<select id="free-unit"><option value="">全部题型分区</option>'+Object.entries(units).map(([id,n])=>'<option value="'+id+'">'+escapeHTML(n)+'</option>').join('')+'</select></label>'+
    '<label>题型<select id="free-type"><option value="">全部题型</option>'+[...new Set(qs.map(q=>q.t))].map(t=>'<option>'+t+'</option>').join('')+'</select></label>'+
    '<label>出题顺序<select id="free-order"><option value="sequence">按原文顺序</option><option value="random">随机抽题</option><option value="smart">智能推荐</option></select></label>'+
    '<label>本轮题量<input id="free-count" type="number" min="1" max="180" inputmode="numeric"></label>'+
    '<label>练习方式<select id="free-mode"><option value="answer">作答后看解析</option><option value="read">直接背题看解析</option><option value="recall">回忆卡片</option></select></label></div>'+
    '<label class="switch-line"><input type="checkbox" id="auto-next">自评后自动进入下一题</label>'+
    '<p id="available" class="muted"></p><div class="quick-entry"><button id="choose-all">练当前范围全部题</button><button id="daily" class="primary">按我的选择开始</button></div></details>'+
    '<details id="paused-list"><summary>放在这里的进度 · '+data.pausedSessions.length+'</summary><div id="paused-items"></div></details></section></div>'+
    '<div class="stats"><button id="all"><b>'+done+'<small> / 180</small></b><small>已接触</small></button><button id="due"><b>'+due+'</b><small>到期复习</small></button><button id="wrong"><b>'+wrong+'</b><small>待巩固</small></button></div>'+
    '<section class="panel progress-panel"><div class="topline"><div><h3>走过的每一道题</h3><small>'+Math.round(done/qs.length*100)+'% 已接触</small></div><button id="open-map" class="quiet">选一道 →</button></div><div class="stitches" role="img" aria-label="180道题中已接触'+done+'道">'+qs.map(q=>'<span aria-hidden="true" class="stitch '+(record(q.id).wrong?'weak':record(q.id).level>=3?'mastered':record(q.id).seen?'seen':record(q.id).viewed?'viewed':'')+'"></span>').join('')+'</div><div class="map-legend"><span>浅绿 · 看过</span><span>深绿 · 巩固</span><span>暖橙 · 再练</span></div><p class="today-note">'+(today?'今天，已经拾起 '+today+' 道题。':'从任意一道开始，都算数。')+'</p>'+
    '<details><summary class="section-toggle">按题型分区看看</summary>'+Object.entries(units).map(([u,title])=>{
      const list=qs.filter(q=>q.u===u),count=list.filter(q=>record(q.id).seen||record(q.id).viewed).length;
      return '<button class="chapter" data-unit="'+u+'"><span>'+escapeHTML(title)+'</span><small>'+count+'/'+list.length+'</small><progress value="'+count+'" max="'+list.length+'"></progress></button>';
    }).join('')+'</details></section>'+
    '<section class="letter"><label for="letter"><h3>留一句话，给考前的自己</h3></label><textarea id="letter" class="note" maxlength="100" placeholder="比如：认真准备过，就从容一点。">'+escapeHTML(data.letter)+'</textarea><small>自动保存，也会写进你的学习书签。</small></section>'+
    '<details class="footnote"><summary>题库与记录说明</summary><p>来自你提供的《整卷预览》，共 140 道单选、20 道多选、20 道判断。保留原题号和选项顺序，不加入拓展题。32 题按你提供的两轮截图核对，其余 148 题为参考答案，可能与平台不同。助记提示仅辅助回忆，不冒充官方解析。</p><p>记住后的常规复习间隔为 1、3、7、14、30 天。同日重复答对只提升一次等级。电工考试日期尚未提供，复习按常规间隔安排。电工与暖通进度分开保存，互不覆盖。进度只存在当前浏览器，可在右上角导出备份。</p></details><details class="footnote"><summary>为什么有这一页</summary><p>开题报告、开题答辩、论文初稿、电工考证和期末考试，赶在了同一段日子里。于是我们把这 180 道题放到一起，给零散的时间留一个随手能打开的入口。</p><p>练到哪儿，就留在哪儿。忙完了，再接着来。</p></details>';
  bindFreeSettings();
  document.getElementById('open-map').onclick=()=>openQuestionPicker(true);
  document.getElementById('one').onclick=()=>start([pickOne().id],'先练一道');
  document.getElementById('browse').onclick=()=>start(qs.map(q=>q.id),'随手翻翻','read');
  renderPausedSessions();
  if(activeSession())document.getElementById('resume').onclick=renderQuestion;
  document.getElementById('all').onclick=()=>go('practice');
  document.getElementById('due').onclick=()=>go('due');
  document.getElementById('wrong').onclick=()=>go('wrong');
  document.getElementById('letter').oninput=e=>{data.letter=e.target.value;save();};
  document.getElementById('verified-only').onclick=()=>start(qs.filter(q=>q.verified).map(q=>q.id),'截图已核对');
  document.getElementById('reference-only').onclick=()=>{filters.status='reference';go('practice');};
  document.getElementById('copy-link').onclick=copyLink;
  document.getElementById('bookmark').onclick=saveBookmark;
  document.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{filters.unit=b.dataset.unit;go('practice');});
}
function matchesSearch(q,text) {
  const term=text.trim();
  if(!term)return true;
  if(/^#?\d+$/.test(term))return q.id+1===Number(term.replace('#',''));
  return [q.s,...q.o||[],q.cue,q.exp,record(q.id).note||''].join(' ').toLocaleLowerCase().includes(term.toLocaleLowerCase());
}
function pool() {
  return qs.filter(q=>(!filters.unit||q.u===filters.unit) && (!filters.type||q.t===filters.type) &&
    (view!=='due'||isDue(q)) && (view!=='later'||record(q.id).later) && (view!=='wrong'||record(q.id).wrong) &&
    (view!=='star'||record(q.id).star||record(q.id).note) &&
    (!filters.status||(filters.status==='verified'?q.verified:!q.verified)) && matchesSearch(q,filters.search));
}
function renderSetup() {
  const title={practice:'按自己的节奏，复习。',wrong:'再遇见，就记住。',star:'留给自己的重点。',due:'今天，再回想一次。',later:'先放一放，等你回来。'}[view];
  main.innerHTML='<small>'+({practice:'全部 180 道原文题',wrong:'答错的题、没记牢的题，都收在这里',star:'收藏与个人注记',due:'已到复习时间的题目',later:'你标记为稍后再看的题目'}[view])+'</small><h1>'+title+'</h1>'+
    '<div class="toolbar"><select id="unit" aria-label="题型分区"><option value="">全部题型分区</option>'+Object.entries(units).map(([id,n])=>'<option value="'+id+'">'+escapeHTML(n)+'</option>').join('')+'</select><select id="type" aria-label="题型"><option value="">全部题型</option>'+[...new Set(qs.map(q=>q.t))].map(t=>'<option>'+t+'</option>').join('')+'</select><input id="search" type="search" placeholder="题号、题干、选项或注记" aria-label="搜索题号、题目或注记"></div><div class="verification-filter"><label for="status">答案来源</label><select id="status"><option value="">全部 180 题</option><option value="verified">截图已核对 · 32 题</option><option value="reference">待与平台核对 · 148 题</option></select></div><div id="results"></div>';
  for(const key of ['unit','type','search','status']) {
    const node=document.getElementById(key);
    node.value=filters[key];
    node.oninput=()=>{filters[key]=node.value;renderResults();};
  }
  renderResults();
}
function renderResults() {
  const list=pool();
  document.getElementById('results').innerHTML='<div class="modes"><button class="primary" id="order">顺序练习</button><button id="random">随机练习</button><button id="cards">回忆卡片</button><button id="read">背题浏览</button></div><small>'+list.length+' 道题 · 回忆卡片会先隐藏选项</small>'+
    (list.length?list.map(q=>'<button class="list-item" data-q="'+q.id+'"><small>第 '+(q.id+1)+' 题 · '+q.t+'</small><p>'+escapeHTML(q.s)+'</p></button>').join(''):'<section class="panel empty">这里暂时没有题目。<p class="muted">可以换个筛选条件，或去题库继续练习。</p></section>');
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
  if(a && typeof a.correct==='boolean' && !a.rated&&!a.skipAuto)rate(a.correct?(a.hinted?'hard':'good'):'again',false);
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
  return qs.filter(q=>(!s.unit||q.u===s.unit)&&(!s.type||q.t===s.type)&&
    ({all:true,unseen:!record(q.id).seen,wrong:record(q.id).wrong,star:record(q.id).star||record(q.id).note,later:record(q.id).later,due:isDue(q),verified:q.verified,reference:!q.verified})[s.scope]);
}
function bindFreeSettings() {
  const update=()=>{document.getElementById('available').textContent='当前范围 '+freePool().length+' 道 · 随时可以停，也可以跳过';};
  for(const key of ['scope','unit','type','order','count','mode']) {
    const node=document.getElementById('free-'+key);node.value=data.settings[key];
    node.onchange=()=>{
      if(key==='count') {
        const n=Number(node.value);
        if(!Number.isInteger(n)||n<1||n>qs.length){toast('题量可以选 1 到 180 道');node.value=data.settings.count;return;}
        data.settings.count=n;
      } else data.settings[key]=node.value;
      save();update();
    };
  }
  const auto=document.getElementById('auto-next');auto.checked=data.settings.autoNext;
  auto.onchange=()=>{data.settings.autoNext=auto.checked;save();};
  const begin=all=>{
    let list=freePool();
    if(!list.length){toast('这个范围暂时没有题目，可以换个条件。');return;}
    const count=Number(document.getElementById('free-count').value);
    if(!all&&(!Number.isInteger(count)||count<1||count>qs.length)){toast('题量可以选 1 到 180 道');return;}
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
  later.onclick=()=>{filters={unit:'',type:'',search:'',status:''};go('later');};container.append(later);
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
    '<label class="switch-line"><input type="checkbox" id="session-auto-next">自评后自动进入下一题</label>'+
    '<div class="study-actions"><button id="later">'+(record(id).later?'取消留待稍后':'这道题留待稍后')+'</button><button id="end-round">这次先到这里</button></div><p class="muted">选择会自动保存。暂停后，位置和草稿也会留下。</p>';
  document.body.append(dialog);
  dialog.querySelector('#close-study').onclick=()=>dialog.close();
  const mode=dialog.querySelector('#session-mode');mode.value=s.mode;
  mode.onchange=()=>{commitPendingAnswer();s.mode=mode.value;save();dialog.close();renderQuestion();};
  const font=dialog.querySelector('#font-size');font.value=data.settings.font;
  font.onchange=()=>{data.settings.font=font.value;save();applyAppearance(true);};
  const focus=dialog.querySelector('#focus-toggle');focus.checked=data.settings.focus;
  focus.onchange=()=>{data.settings.focus=focus.checked;save();applyAppearance(true);};
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
    (all?'<div class="map-filters"><label>题目范围<select id="map-filter"><option value="all">全部原文题</option><option value="verified">仅截图已核对的 32 题</option><option value="reference">待与平台核对的 148 题</option><option value="unseen">还没看过</option><option value="wrong">需要再巩固</option><option value="star">收藏与笔记</option><option value="later">留待稍后</option></select></label><label>找题号<input id="map-number" type="search" inputmode="numeric" placeholder="例如 106"></label></div>':'')+
    '<p class="muted" id="map-count"></p><div class="picker-grid"></div>';
  document.body.append(dialog);
  dialog.querySelector('#close-picker').onclick=()=>dialog.close();
  const s=data.session;
  const render=()=>{
    const scope=all?dialog.querySelector('#map-filter').value:'all';
    const number=all?dialog.querySelector('#map-number').value.trim():'';
    const list=(all?qs.map(q=>q.id):s.ids).filter(id=>{
      const r=record(id);
      return (!number||String(id+1)===number)&&({all:true,unseen:!r.seen&&!r.viewed,wrong:r.wrong,star:r.star||r.note,later:r.later})[scope];
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
    '<section class="card"><div class="question-meta"><span>第 '+(id+1)+' 题 · '+q.t+'</span><button id="star" class="quiet" aria-pressed="'+!!r.star+'">'+(r.star?'★ 已收藏':'☆ 收藏')+'</button></div>'+
    '<progress aria-label="本轮已接触进度" value="'+Object.values(s.answers).filter(x=>x.revealed||x.rated).length+'" max="'+s.ids.length+'"></progress><h2>'+escapeHTML(q.s)+'</h2>'+answerBadge(q)+'<p class="choice-status" id="choice-status" aria-live="polite"></p><div class="options" id="options"></div><div id="hint-content" aria-live="polite">'+(a.hinted&&!a.revealed?'<div class="memory hint-memory"><small>助记提示 · 可能含答案线索</small><p>'+escapeHTML(q.cue)+'</p>'+(q.warning?'<p class="warn">'+escapeHTML(q.warning)+'</p>':'')+'<small>看过提示后，试着用自己的话回忆。</small></div>':'')+'</div>'+
    '<div id="feedback" aria-live="polite"></div><div id="rating" class="rating-buttons"></div><details class="recall-note" '+(r.note?'open':'')+'><summary>我的注记</summary><textarea id="note" class="note" placeholder="写下理解、易错点，或自己的口诀">'+escapeHTML(r.note||'')+'</textarea><small>自动保存</small></details>'+
    '<button id="restart-question" class="quiet">重新答这道题</button>'+'</section><div class="answer-dock" id="actions"></div></div>';
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
        a.selected=q.t==='多选题'?(a.selected.includes(key)?a.selected.filter(v=>v!==key):[...a.selected,key]):[key];
        save();updateChoiceUI(q,a);
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
  else action(q.key&&s.mode==='answer'?'提交答案':'翻看答案',()=>{
    if(q.key&&s.mode==='answer'&&!a.selected.length){toast('先选一个答案，再提交。');return;}
    a.revealed=true;
    markViewed(id);
    if(q.key&&s.mode==='answer')a.correct=[...a.selected].sort().join('')===[...q.key].sort().join('');
    commitPendingAnswer();
    save();renderQuestion();
    document.getElementById('feedback').scrollIntoView({block:'start'});
  },true);
  action(s.index===s.ids.length-1?'本轮小结':a.revealed?'下一题':'先跳过',next,a.revealed);
}
function updateChoiceUI(q,a) {
  const node=document.getElementById('choice-status');
  if(node)node.textContent=!q.key||data.session.mode!=='answer'||a.revealed?'':q.t==='多选题'?'多选题 · 已选 '+a.selected.length+' 项 · 可再次点击取消':'选择一项，再点下方提交';
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
  return due;
}
function renderFeedback(q,a) {
  const heading=a.correct===undefined?'对照答案，看看记住了多少':a.correct?'答对了':'记住这一次，下次再试';
  document.getElementById('feedback').innerHTML='<div class="feedback"><h3>'+heading+'</h3>'+
    (q.key?'<div class="answer-comparison">'+(typeof a.correct==='boolean'?'<p>你的答案 <b>'+escapeHTML([...a.selected].sort().join('、'))+'</b></p>':'')+'<p>'+ (q.verified?'平台答案':'参考答案')+' <b>'+escapeHTML([...q.key].join('、'))+'</b></p></div>':'')+
    (q.warning?'<p class="warn">'+escapeHTML(q.warning)+'</p>':'')+
    '<div class="memory"><small>一句助记</small><p>'+escapeHTML(q.cue)+'</p></div>'+
    '<details open><summary>答案依据与校对说明</summary><p>'+escapeHTML(q.exp)+'</p></details></div>';
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
  if(updateView){if(data.settings.autoNext&&!editing)next();else renderQuestion();}
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
    (covered<s.ids.length?'<button id="remaining">继续还没看过的题</button>':'')+(weak.length?'<button id="retry">再看这 '+weak.length+' 道</button>':'')+'<button id="another">再来一小轮</button></div><p class="footnote">电工独立题库 · 忙完手头的事，再接着来。</p></section>';
  document.getElementById('finish').onclick=()=>{if(s.finished)data.session=null;save();go('home');};
  document.getElementById('another').onclick=()=>startSmart(s.ids);
  if(weak.length)document.getElementById('retry').onclick=()=>start(weak,'再巩固一次');
  if(covered<s.ids.length)document.getElementById('remaining').onclick=()=>{s.index=s.ids.findIndex(id=>!s.answers[id]?.revealed&&!s.answers[id]?.rated);save();renderQuestion();};
  window.scrollTo(0,0);
}
function answerBadge(q) { return '<p class="answer-source '+(q.verified?'verified':'reference')+'">'+(q.verified?'已按平台截图核对':'参考答案 · 待与平台核对')+'</p>'; }
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href.split(/[?#]/)[0]);toast('电工题库链接已复制'); }
  catch { toast('复制未成功，请从浏览器地址栏复制链接。'); }
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
  ctx.fillStyle='#315f4c';ctx.font='30px "Microsoft YaHei", sans-serif';ctx.fillText('电工考证 · 有空就练一点',115,145);
  ctx.font='130px Inter, sans-serif';ctx.fillText('180 题',110,330);
  ctx.fillStyle='#b76742';ctx.font='26px "Microsoft YaHei", sans-serif';ctx.fillText('电工 · 学习书签',120,390);
  ctx.setLineDash([8,10]);ctx.beginPath();ctx.moveTo(65,445);ctx.lineTo(1015,445);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#273d36';ctx.font='58px Inter, sans-serif';ctx.fillText('一点一点，记得更牢',115,555);
  ctx.font='38px "Microsoft YaHei", sans-serif';ctx.fillText('32 题截图确认 · 148 题参考答案',115,635);
  ctx.font='24px "Microsoft YaHei", sans-serif';ctx.fillStyle='#68776c';ctx.fillText('140 单选 · 20 多选 · 20 判断',115,690);
  const done=qs.filter(q=>record(q.id).seen||record(q.id).viewed).length;
  ctx.fillText('已接触 '+done+' / 180 道',115,790);
  for(let i=0;i<qs.length;i++){
    ctx.fillStyle=record(i).seen?'#719079':record(i).viewed?'#bacbb1':'#e6e8df';
    ctx.fillRect(115+(i%23)*37,825+Math.floor(i/23)*28,23,17);
  }
  ctx.fillStyle='#273d36';ctx.font='32px "Microsoft YaHei", sans-serif';
  wrapCanvas(ctx,data.letter||'认真准备过，就从容一点。',115,1100,830,52);
  ctx.fillStyle='#68776c';ctx.font='22px "Microsoft YaHei", sans-serif';ctx.fillText('记录于 '+dayKey()+' · 把这一页留给自己',115,1320);
  canvas.toBlob(blob=>{if(blob){download(blob,'电工学习书签.png');toast('书签已生成，可保存到相册');}else toast('书签生成失败，请重试。');},'image/png');
}
document.getElementById('brand').onclick=e=>{e.preventDefault();go('home');};
document.getElementById('backup').onclick=()=>download(new Blob([JSON.stringify({format:STORAGE,...data},null,2)],{type:'application/json'}),'电工学习记录.json');
document.getElementById('import-button').onclick=()=>document.getElementById('restore').click();
document.getElementById('restore').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    const raw=JSON.parse(await file.text());
    if(raw.format!==STORAGE)throw Error();
    const imported=normalize(raw);
    if(!confirm('合并学习记录？相同题目采用备份中的记录。'))return;
    data.records={...data.records,...imported.records};
    data.settings=imported.settings;
    if(typeof raw.letter==='string')data.letter=imported.letter;
    parkSession();
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
  clearTimeout(toastTimer);document.getElementById('toast').style.display='none';
  const target=event.target,dock=document.getElementById('actions');
  if(!dock||!target.getBoundingClientRect||target.closest('dialog,#actions')||getComputedStyle(dock).position!=='fixed')return;
  const rect=target.getBoundingClientRect();
  if(rect.bottom>dock.getBoundingClientRect().top-12)target.scrollIntoView({block:'center'});
});
document.addEventListener('pointerdown',()=>{clearTimeout(toastTimer);document.getElementById('toast').style.display='none';});
save();
go('home');
