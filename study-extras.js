/* Shared optional study tools. Each bank keeps its existing progress and answer model. */
(() => {
  'use strict';
  const root = new URL('./', document.currentScript.src);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let registration, readyOffline = false, offlineFailure = false, updateChosen = false;
  let lastPointerAt=0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=Date.now();},true);
  const steps = ['找问题', '写做法', '说理由'];
  // Indices refer to stable construction card IDs; full answers remain in the original bank.
  const cases = {
    22: ['不能未经确认就用顶盖吊环搬运整机；先区分吊整机和吊器身的受力点。',[0,1,2],'不同吊点的承重对象不同。把器身或箱盖吊环当整机吊点，可能造成吊点或结构损坏。'],
    23: ['对需要现场设置坡度的结构，0.5%偏小；先确认产品是否已带规定坡度。',[0,2],'气体需要沿上升方向进入继电器，坡度和方向不当会妨碍气体汇集、影响保护。'],
    24: ['移动干粉灭火器不能代替设计要求的固定灭火系统；仅有10kV这个条件不足以确定强制选型。',[0,2,3],'移动器材与固定系统的作用和覆盖能力不同。选型还与容量、设置位置和消防设计有关。'],
    25: ['农田埋深、砂层和位于给水管正下方的布置需要改；盖板每侧超出50mm这项符合基本要求。YJV选型和90mm净距要补充条件。',[0,1,2,3],'埋深和保护层用于减少机械损伤；管线间距便于保护与检修。型号及净距不能脱离电压、环境和保护条件判断。'],
    26: ['案例中电力与控制电缆应按设计分管；不要推广成所有场合一根管只能穿一根电缆。',[0,1,2,3],'分管有利于散热、抗干扰、故障隔离和检修；交流单芯电缆单独穿钢管还可能引起磁性损耗和发热。'],
    27: ['普通支架上的控制电缆双层，本身没有超过层数要求。还需确认广播用途与消防线路隔离要求。',[0,1,2,3],'控制与电力电缆的层数规定不同；是否属于消防线路又决定了额外的防火保护，不能只数层数。'],
    28: ['回填前必须完成隐蔽验收，不能先盖土、后补签。',[0,1,2,3],'埋好以后难以直接核对深度、间距和保护层；隐蔽前检查、记录和签认才能留下可追溯证据。'],
    29: ['60m只在首尾接地不够；连接板每端1个普通螺栓也不满足免跨接条件。',[0,1,2,3],'槽盒需要连续、可靠的保护联结；连接点和防松措施既要保证机械牢固，也要保证电气连续。'],
    30: ['设计无要求时，水平间距3.5m偏大；φ6mm吊杆不足。',[0,1,2,3],'间距过大、吊杆过细会削弱承载和稳定性；还要结合实际荷载、防晃及产品要求检查。'],
    31: ['先分清电缆槽盒还是配线槽盒；未说明保温或隔离时，不能直接认定上方200mm合格。',[0,1,2,3],'热管道会影响线路温度和绝缘。相对位置、保温条件、槽盒用途不同，所查净距要求也不同。'],
    32: ['电缆与绝缘导线不宜混敷；同一交流回路的导线不应拆到不同金属槽盒或导管。',[0,1,2],'混敷不利于维护和故障隔离；同一交流回路分开穿过铁磁性材料，可能产生不平衡磁通、涡流和发热。'],
    33: ['M5砂浆等级偏低，10mm保护层过薄。',[0,1,2],'砂浆强度与保护层厚度共同保护暗敷导管，墙面看起来平整不代表内部防护合格。'],
    34: ['镀锌导管用熔焊圆钢跨接的做法不当，不能套用非镀锌钢管的做法。',[0,1,2,3],'焊接会损伤镀锌防护层；专用卡与铜芯软导线用于获得可靠联结，同时保留防腐保护。']
  };

  function seconds(q) { return q.t === '案例分析' ? 150 : q.points ? 90 : q.key ? (q.t === '多选题' ? 75 : 45) : (q.t === '计算题' ? 240 : 120); }
  function choose(qs, read, minutes) {
    const now = Date.now();
    const score = q => { const r=read(q.id);return ((r.seen||r.wrong)&&(r.due||0)<=now?10000:0)+(r.wrong?5000:0)+(!r.seen?1000:0)+(5-(r.level||0))*10; };
    const list = qs.map(q=>({q,tie:Math.random()})).sort((a,b)=>score(b.q)-score(a.q)||a.tie-b.tie).map(x=>x.q);
    const selected=[];let used=0;
    for(const q of list)if(used+seconds(q)<=minutes*60||!selected.length){selected.push(q.id);used+=seconds(q);}
    return selected;
  }
  function home({qs,read,begin,subject}) {
    const target=document.querySelector('.start-panel .quick-entry');
    if(!target||document.getElementById('time-pocket'))return;
    const block=document.createElement('details');block.id='time-pocket';block.className='time-pocket';
    block.innerHTML='<summary>手头还有几分钟？</summary><p>按题量估算，优先拾起薄弱和到期内容。随时停下，不用赶时间。</p><div class="time-options">'+[3,10,30].map(m=>'<button type="button" data-minutes="'+m+'">'+(m===30?'半小时':m+' 分钟')+'</button>').join('')+'</div>';
    target.after(block);
    block.querySelectorAll('[data-minutes]').forEach(button=>button.onclick=()=>{
      const minutes=Number(button.dataset.minutes),ids=choose(qs,read,minutes);
      begin(ids,'我有'+minutes+'分钟 · '+ids.length+'道',subject==='construction'?'recall':'answer');
    });
    const links=document.createElement('div');links.className='quiet-resources';
    const sheet=new URL('review/'+subject+'.html',root);
    links.innerHTML='<a href="'+escape(sheet.href)+'">考前三页速记 ↗</a><button type="button" class="offline-help-open">离线与桌面入口</button><button type="button" data-update-site hidden>有更新 · 保存并刷新</button>';
    block.after(links);links.querySelector('.offline-help-open').onclick=openOfflineHelp;
    links.querySelector('[data-update-site]').onclick=applyUpdate;refreshStatus();
  }
  function normalizeWork(a) {
    const old=a.caseWork&&typeof a.caseWork==='object'?a.caseWork:{};
    a.caseWork={step:Number.isInteger(old.step)&&old.step>=0&&old.step<3?old.step:0,
      drafts:[0,1,2].map(i=>typeof old.drafts?.[i]==='string'?old.drafts[i]:(i===0&&!old.drafts?a.draft||'':'')),
      opened:[0,1,2].map(i=>old.opened?.[i]===true)};
    return a.caseWork;
  }
  function caseSteps(q,a,{save,mode}) {
    if(q.t!=='案例分析'||!cases[q.id]||mode==='read')return;
    const work=normalizeWork(a),spec=cases[q.id];
    if(a.revealed){
      if(!work.drafts.some(Boolean))return;
      const summary=document.createElement('details');summary.className='case-drafts';
      summary.innerHTML='<summary>回看我的三步草稿</summary>'+steps.map((title,i)=>'<h4>'+title+'</h4><p>'+escape(work.drafts[i]||'这一步还没写，可以重新练习。')+'</p>').join('');
      document.getElementById('feedback').prepend(summary);return;
    }
    const draft=document.getElementById('draft');if(!draft)return;
    const wrap=document.createElement('section');wrap.className='case-workbench';wrap.setAttribute('aria-label','案例分步练习');
    draft.before(wrap);
    wrap.innerHTML='<div class="case-step-tabs" role="group" aria-label="选择练习步骤">'+steps.map((name,i)=>'<button type="button" data-step="'+i+'">'+(i+1)+' · '+name+'</button>').join('')+'</div><label id="case-prompt" for="draft"></label><div id="case-writing"></div><button type="button" id="step-reveal">对照这一步</button><div id="step-answer" aria-live="polite"></div><p class="case-gentle">草稿自动保存。也可以直接翻看完整答案，再按自己的感受自评。</p>';
    wrap.querySelector('#case-writing').append(draft);
    const answers=[ [spec[0]], spec[1].map(i=>q.points[i]), [spec[2]] ];
    const prompts=['先判断哪些做法有问题、哪些符合要求，缺少什么条件？','试着写出正确做法，记得带上适用条件和关键数字。','用自己的话说明：为什么这样做？避免什么问题？'];
    const render=()=>{
      wrap.querySelectorAll('[data-step]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.step)===work.step)));
      wrap.querySelector('#case-prompt').textContent=prompts[work.step];
      draft.value=work.drafts[work.step];draft.placeholder='可以写关键词，也可以先在心里说一遍';
      const visible=work.opened[work.step];
      wrap.querySelector('#step-reveal').textContent=visible?'收起这一步要点':'对照这一步';
      wrap.querySelector('#step-reveal').setAttribute('aria-expanded',String(visible));
      wrap.querySelector('#step-answer').innerHTML=visible?'<ol>'+answers[work.step].map(p=>'<li>'+escape(p)+'</li>').join('')+'</ol>':'';
    };
    draft.oninput=()=>{work.drafts[work.step]=draft.value;a.draft=draft.value;save();};
    wrap.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>{work.step=Number(button.dataset.step);a.draft=work.drafts[work.step];save();render();draft.focus({preventScroll:true});});
    wrap.querySelector('#step-reveal').onclick=()=>{work.opened[work.step]=!work.opened[work.step];save();render();};
    render();
  }
  function statusText() {
    if(offlineFailure)return '离线暂未准备好，可联网时重试';
    if(readyOffline)return navigator.onLine?'三科离线内容已备好':'当前离线 · 可以继续学习';
    return navigator.onLine?'正在准备离线内容…':'尚未备好离线内容，请先联网打开一次';
  }
  function refreshStatus() {
    document.querySelectorAll('[data-offline-status]').forEach(el=>el.textContent=statusText());
    document.querySelectorAll('[data-update-site]').forEach(el=>el.hidden=!registration?.waiting);
  }
  function openOfflineHelp() {
    document.getElementById('offline-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='offline-dialog';dialog.setAttribute('aria-labelledby','offline-title');
    dialog.innerHTML='<div class="topline"><h3 id="offline-title">下次，直接回来。</h3><button id="close-offline">完成</button></div><p data-offline-status role="status"></p><p>联网打开后，会为三门学科准备题目、答案和速记页。看到“离线内容已备好”后，即使断网也能从原网址继续学。</p><p>手机浏览器菜单中选“添加到主屏幕”或“添加到桌面”；没有这个选项时，可以先收藏网址。</p><p class="muted">进度仍保存在当前浏览器。清理网站数据、无痕浏览或更换设备可能丢失记录，重要笔记请在“学习记录”导出。外部参考资料需要联网。</p><button id="retry-offline">重新检查离线内容</button><button data-update-site hidden>保存并加载新版</button>';
    document.body.append(dialog);dialog.querySelector('#close-offline').onclick=()=>dialog.close();
    dialog.querySelector('#retry-offline').onclick=async()=>{offlineFailure=false;refreshStatus();await setupOffline();};
    dialog.querySelector('[data-update-site]').onclick=applyUpdate;
    refreshStatus();dialog.showModal();
  }
  async function verifyCache(worker) {
    if(!worker)return false;
    return new Promise(resolve=>{
      const channel=new MessageChannel();const timeout=setTimeout(()=>{channel.port1.close();resolve(false);},5000);
      channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data?.ready===true);};
      worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);
    });
  }
  function watchWorker(worker) {
    if(!worker)return;
    worker.addEventListener('statechange',async()=>{
      if(worker.state==='activated'){readyOffline=await verifyCache(worker);offlineFailure=!readyOffline;}
      if(worker.state==='redundant'&&!readyOffline)offlineFailure=true;
      refreshStatus();
    });
  }
  async function setupOffline() {
    if(!('serviceWorker' in navigator)||!window.isSecureContext){offlineFailure=true;refreshStatus();return;}
    try{
      registration=await navigator.serviceWorker.register(new URL('sw.js',root),{scope:root.pathname,updateViaCache:'none'});
      watchWorker(registration.installing);
      registration.addEventListener('updatefound',()=>watchWorker(registration.installing));
      if(registration.active){readyOffline=await verifyCache(registration.active);offlineFailure=!readyOffline;}
      await registration.update();refreshStatus();
    }catch{offlineFailure=!readyOffline;refreshStatus();}
  }
  function applyUpdate() {
    if(!registration?.waiting)return;
    // App inputs already save on each change; flush any pending answer before reloading.
    window.dispatchEvent(new Event('study-before-update'));
    updateChosen=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
  }
  window.StudyExtras={home,caseSteps,choose,pointerRecent:()=>Date.now()-lastPointerAt<500};
  window.addEventListener('online',()=>{refreshStatus();setupOffline();});
  window.addEventListener('offline',refreshStatus);
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(updateChosen)location.reload();else verifyCache(navigator.serviceWorker.controller).then(ready=>{readyOffline=ready;refreshStatus();});
  });
  document.addEventListener('DOMContentLoaded',()=>{
    const menu=document.querySelector('.tool-menu');
    if(menu){
      const button=document.createElement('button');button.textContent='离线与桌面入口';button.onclick=openOfflineHelp;menu.append(button);
      const status=document.createElement('small');status.dataset.offlineStatus='';menu.append(status);
      const update=document.createElement('button');update.dataset.updateSite='';update.textContent='保存并加载新版';update.hidden=true;update.onclick=applyUpdate;menu.append(update);
    }
    setupOffline();refreshStatus();
  });
})();
