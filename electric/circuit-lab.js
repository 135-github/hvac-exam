'use strict';
function showCircuitLab() {
  const dialog=document.createElement('dialog');
  dialog.className='circuit-lab';
  dialog.setAttribute('aria-labelledby','circuit-title');
  dialog.innerHTML='<div class="topline"><h3 id="circuit-title">接触器自锁</h3><button class="close-lab">关闭</button></div>'+
    '<p>按住启动，再松手。观察并联在启动按钮两端的 KM 辅助触点。</p>'+
    '<svg viewBox="0 0 360 220" role="img" aria-label="停止触点串联在前，启动触点和 KM 辅助触点并联，再串联 KM 线圈">'+
    '<g fill="none" stroke="currentColor" stroke-width="3"><path d="M20 34v148 M340 34v148"/>'+
    '<path d="M20 94h32 M76 94h34 M110 94V65h29 M162 65h38v29 M110 94v45h29 M162 139h38V94 M200 94h41 M294 94h46"/>'+
    '<path id="stop-contact" d="M52 94h24"/><path id="start-contact"/><path id="aux-contact"/><rect x="241" y="79" width="53" height="30" rx="4"/></g>'+
    '<g fill="currentColor" font-size="13" text-anchor="middle"><text x="20" y="25">L</text><text x="340" y="25">N</text><text x="64" y="72">停止</text><text x="151" y="44">启动</text><text x="152" y="169">KM 辅助触点</text><text x="267" y="99">KM</text><text x="267" y="131">线圈</text></g>'+
    '<g fill="none" stroke="#129669" stroke-width="5" stroke-linecap="round"><path id="common-flow" d="M20 94h90 M200 94h41 M294 94h46"/><path id="start-flow" d="M110 94V65h90v29"/><path id="hold-flow" d="M110 94v45h90V94"/></g></svg>'+
    '<p class="circuit-state" role="status"></p><div class="lab-buttons"><button class="lab-start">启动</button><button class="lab-stop">停止</button></div><p><small>触屏或鼠标可按住，键盘可用空格或回车。图中为控制回路。</small></p>';
  const el=selector=>dialog.querySelector(selector);
  let running=false,starting=false,stopping=false;
  function paint(){
    el('#start-contact').setAttribute('d',starting?'M139 65h23':'M139 65l21 -11');
    el('#aux-contact').setAttribute('d',running?'M139 139h23':'M139 139l21 -11');
    el('#stop-contact').setAttribute('d',stopping?'M52 94l22 -11':'M52 94h24');
    el('#common-flow').style.display=running?'':'none';el('#start-flow').style.display=running&&starting?'':'none';el('#hold-flow').style.display=running?'':'none';
    el('.circuit-state').textContent=stopping?'停止按钮断开，线圈释放，电机停止。':starting&&running?'启动支路接通，线圈吸合，KM 辅助触点闭合。':running?'已松开启动，辅助触点保持通路，电机继续运行。':'线圈未得电，辅助触点断开，电机停止。';
  }
  function momentary(button,press,release){
    let down=false;
    const begin=()=>{if(!down){down=true;press();paint();}};
    const end=()=>{if(down){down=false;release();paint();}};
    button.onpointerdown=e=>{if(e.button!==0)return;button.setPointerCapture(e.pointerId);begin();};
    button.onlostpointercapture=button.onpointercancel=button.onpointerup=end;
    button.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();begin();}};
    button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();end();}};
    button.onblur=end;button.onclick=e=>{if(e.detail===0&&!down){begin();end();}};
  }
  momentary(el('.lab-start'),()=>{starting=true;running=!stopping;},()=>{starting=false;});
  momentary(el('.lab-stop'),()=>{stopping=true;running=false;},()=>{stopping=false;running=starting;});
  el('.close-lab').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);paint();dialog.showModal();
}
function offerCircuit(q) {
  if(![203,259,284,290,434].includes(q.id))return;
  const button=document.createElement('button');button.className='demo-link';button.textContent='看电路演示 · 接触器自锁';
  button.onclick=showCircuitLab;document.querySelector('#feedback .memory').before(button);
}
