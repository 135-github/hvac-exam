'use strict';
// This offline study checkpoint belongs to this browser, independent of learning-record imports.
const StudyCheckpoint = (() => {
  const storageKey = 'electric-checkpoint-v1';
  const limit = 1360;
  const passwordDigest = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  let pending, dialog, admitted;
  function read() {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return {count:0, last:'', locked:false};
    const value = JSON.parse(raw);
    if (!Number.isInteger(value.count) || value.count<0 || value.count>limit || typeof value.last!=='string' || typeof value.locked!=='boolean') throw Error('invalid checkpoint');
    // A lock from the previous 200-question policy no longer meets the threshold.
    if (value.count < limit) value.locked = false;
    return value;
  }
  const write = state => localStorage.setItem(storageKey, JSON.stringify(state));
  function exclusive(fn) {
    return navigator.locks ? navigator.locks.request(storageKey, fn) : Promise.resolve().then(fn);
  }
  function unavailable() {
    const main=document.getElementById('main');
    main.textContent='无法读取或保存本机的练习计数。请允许本站保存数据，然后刷新。';
  }
  function dismiss(){
    if(dialog){dialog.close();dialog.remove();dialog=null;}
    const again=pending;pending=null;if(again)again();
  }
  function lockScreen(){
    admitted=null;
    if(dialog?.isConnected)return;
    dialog=document.createElement('dialog');dialog.className='transfer-dialog';dialog.setAttribute('aria-labelledby','checkpoint-title');
    dialog.innerHTML='<h2 id="checkpoint-title">已练习或浏览 '+limit+' 道题</h2><p>输入密码，继续下一组 '+limit+' 题。</p><form><label>继续练习密码<input type="password" inputmode="numeric" autocomplete="off" required autofocus style="display:block;width:100%;box-sizing:border-box;margin:.5rem 0"></label><p role="status"></p><button class="primary">解锁并继续</button></form>';
    dialog.oncancel=e=>e.preventDefault();
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const panel=dialog,input=panel.querySelector('input'),status=panel.querySelector('[role=status]');
      try{
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.value));
        if(panel!==dialog)return;
        if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==passwordDigest){
          status.textContent='密码不正确，请重新输入。';input.select();return;
        }
        await exclusive(()=>{if(read().locked)write({count:0,last:'',locked:false});});
        if(panel===dialog)dismiss();
      }catch{status.textContent='暂时无法保存解锁状态，请检查浏览器存储设置。';}
    };
    document.body.append(dialog);dialog.showModal();
  }
  function visit(key,draw,valid=()=>true){
    try{
      const state=read();
      if(state.locked){pending=()=>visit(key,draw,valid);lockScreen();return;}
      if(admitted===key && state.last===key){if(valid())draw();return;}
    }catch{unavailable();return;}
    exclusive(()=>{
      if(!valid())return;
      const state=read();
      if(state.locked || (state.last!==key && state.count===limit)){
        if(!state.locked){state.locked=true;write(state);}
        pending=()=>visit(key,draw,valid);lockScreen();return;
      }
      if(state.last!==key){state.last=key;state.count++;write(state);}
      admitted=key;draw();
    }).catch(unavailable);
  }
  function restore(){
    try{if(read().locked)lockScreen();else if(dialog)dismiss();}catch{unavailable();}
  }
  window.addEventListener('storage',e=>{if(e.key===storageKey)restore();});
  window.addEventListener('pageshow',restore);
  return {visit,restore};
})();
