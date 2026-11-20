'use strict';
const ReviewLab = (() => {
  const groups = [
    ['正反转互锁',[198,242]], ['热继电器与过载保护',[203,254,510,537]],
    ['三相半波整流的导通角',[37,287]], ['阻性负载的电流断续',[231,562]],
    ['电流互感器的二次回路',[441,486]], ['交流接触器的工作机构',[290,434]],
    ['功率因数与无功补偿',[465,585]]
  ];
  const additions = {
    640:['绝缘体中的电荷','铜芯和塑料外皮都含有电子。为什么在通常条件下，电流更容易通过铜芯？',['铜中可自由移动的电子较多','塑料中完全没有电子','铜中只有带正电的粒子'],0,'两种材料都有电子。铜中有较多可自由移动的电子，绝缘材料中的电荷大多受到束缚。'],
    284:['接触器自锁','运行中的接触器因控制电源中断而释放。重新供电后，启动按钮已经松开，电机会怎样？',['自行恢复运转','保持停止，需再次启动','自动反转'],1,'断电使线圈释放，自锁辅助触点也断开。恢复供电时启动支路和自锁支路都不通。'],
    506:['变压器铁芯涡流','把整块铁芯改为片间绝缘的薄硅钢片，主要限制哪一种电流？',['二次绕组的负载电流','一次绕组的励磁电流','铁芯内感应产生的涡流'],2,'片间绝缘限制涡流回路，从而降低铁芯的涡流损耗。'],
    534:['电容与电荷量','两个电容器两端电压相同，其中一个电容量是另一个的两倍。它的电荷量是多少？',['一半','两倍','相同'],1,'由 Q＝CU，电压相同，电荷量与电容量成正比。']
  };
  function family(id){return groups.find(([,ids])=>ids.includes(id));}
  function related(id,excluded=[]){
    const ids=(family(id)?.[1]||[]).filter(n=>n!==id&&!excluded.includes(n));
    return ids.sort((a,b)=>(record(a).seen||0)-(record(b).seen||0))[0];
  }
  function topic(id){return additions[id]?.[0]||family(id)?.[0];}
  function saveResult(id,correct){
    data.records[id]={...record(id),transfer:{correct,at:Date.now()}};
    save();
  }
  function makePlan(){
    const weak=qs.filter(q=>record(q.id).wrong||isDue(q)).sort((a,b)=>
      Number(!!record(b.id).wrong)-Number(!!record(a.id).wrong)||(record(a.id).due||0)-(record(b.id).due||0));
    const anchors=weak.slice(0,2).map(q=>q.id);
    let source,variant;
    for(const id of anchors){
      const candidate=related(id,anchors);
      if(candidate!==undefined){source=id;variant=candidate;break;}
    }
    const ids=[...anchors], labels=anchors.map(id=>record(id).wrong?'薄弱题':'到期复习');
    const remaining=shuffled(qs.filter(q=>!ids.includes(q.id)&&q.id!==variant)).sort((a,b)=>
      Number(!!(record(a.id).seen||record(a.id).viewed))-Number(!!(record(b.id).seen||record(b.id).viewed)));
    while(ids.length<5){
      if(ids.length===3&&variant!==undefined){ids.push(variant);labels.push('同考点变式');continue;}
      const q=remaining.shift();ids.push(q.id);labels.push(record(q.id).seen||record(q.id).viewed?'回顾':'新题');
    }
    return {ids,labels,source,variant};
  }
  function begin(){
    const plan=makePlan();
    start(plan.ids,'薄弱点复习 · 5 题');
    data.session.reviewPlan=plan;save();renderQuestion();
  }
  function bindHome(){
    const button=document.getElementById('review-now');
    const plan=makePlan();
    button.textContent='复习薄弱题 · 5 题';
    const counts=new Map();for(const label of plan.labels)counts.set(label,(counts.get(label)||0)+1);
    const detail=document.createElement('small');detail.className='review-mix';
    detail.textContent='本轮 '+[...counts].map(([key,n])=>n+' 道'+key).join(' · ');button.parentElement.after(detail);
    button.onclick=begin;
  }
  function attempt(source){
    StudyCheckpoint.visit('transfer:'+sessionId(),()=>drawAttempt(source));
  }
  function drawAttempt(source){
    const original=qs[source], target=related(source);
    const item=additions[source];
    const q=item?{s:item[1],o:item[2].map((v,i)=>String.fromCharCode(65+i)+'. '+v),key:String.fromCharCode(65+item[3]),cue:item[4]}:qs[target];
    if(!q)return;
    const dialog=document.createElement('dialog');dialog.className='transfer-dialog';
    const close=document.createElement('button');close.textContent='返回复习';close.onclick=()=>dialog.close();
    const title=document.createElement('h3');title.textContent='举一反三 · '+topic(source);
    const stem=document.createElement('p');stem.textContent=q.s;
    const note=document.createElement('small');note.textContent=item?'补充情境题':questionLabel(q)+' · 题库原题';
    const status=document.createElement('p');status.setAttribute('role','status');
    const options=document.createElement('div');options.className='options';
    const selected=new Set();
    status.textContent=q.key.length>1?'选满 '+q.key.length+' 项后核对':'选择一项核对';
    for(const option of q.o){
      const key=option[0],button=document.createElement('button');
      button.className='option';button.textContent=option;button.setAttribute('aria-pressed','false');
      button.onclick=()=>{
        if(selected.has(key))selected.delete(key);else selected.add(key);
        button.setAttribute('aria-pressed',String(selected.has(key)));button.classList.toggle('selected',selected.has(key));
        if(selected.size!==q.key.length)return;
        const correct=[...q.key].every(k=>selected.has(k));saveResult(source,correct);
        for(const b of options.children){b.disabled=true;b.classList.toggle('correct',q.key.includes(b.textContent[0]));}
        status.textContent=(correct?'同考点已答对。':'这次还需巩固。')+'答案 '+q.key+'。'+(q.cue||'');
      };options.append(button);
    }
    dialog.append(title,note,stem,options,status,close);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();if(view==='wrong')renderResults();},{once:true});dialog.showModal();
  }
  function bindReview(){
    if(view!=='wrong')return;
    for(const row of document.querySelectorAll('#results .list-item')){
      const id=Number(row.dataset.q);if(!topic(id))continue;
      const box=document.createElement('div');box.className='related-action';
      const button=document.createElement('button');button.textContent='练一道同考点题';button.onclick=()=>attempt(id);
      const label=document.createElement('small');label.textContent=record(id).transfer?(record(id).transfer.correct?'同考点已答对':'同考点待巩固'):topic(id);
      box.append(label,button);row.after(box);
    }
  }
  function decorateQuestion(q){
    const plan=data.session.reviewPlan;if(!plan)return;
    const label=plan.labels[data.session.index];const el=document.createElement('small');el.className='review-step';
    el.textContent=label+(q.id===plan.variant?' · '+topic(plan.source):'');main.querySelector('.card h2').before(el);
  }
  function graded(q,a){
    const p=data.session.reviewPlan;if(p&&q.id===p.variant&&p.source!==undefined)saveResult(p.source,a.correct);
  }
  function summary(){
    const plan=data.session.reviewPlan;if(!plan)return;
    const detail=document.createElement('p');
    detail.textContent=plan.ids.map((id,i)=>plan.labels[i]+' · '+questionLabel(qs[id])+' '+({true:'✓',false:'需重练'}[data.session.answers[id]?.correct]||'未判分')).join('　');
    main.querySelector('.finish-actions').before(detail);
  }
  return {bindHome,bindReview,decorateQuestion,graded,summary};
})();
