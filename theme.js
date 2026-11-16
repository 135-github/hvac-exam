/* Appearance is shared across subjects; study records are never modified here. */
(() => {
 'use strict';
 const KEY='study-pocket-appearance-v1';
 const themes={simple:['原本简约','浅色纸面 · 清爽阅读'],voxel:['我的世界','像素方块 · 草地配色'],battleground:['刺激战场','战术面板 · 深色黄标']};
 const colors={simple:'#f7f5ef',voxel:'#dce9cf',battleground:'#151d22'};let button,menu;
 const clean=value=>Object.hasOwn(themes,value)?value:'voxel';
 function apply(value){const theme=clean(value);document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[theme]);
  if(button){button.textContent='外观';button.setAttribute('aria-label','外观：当前'+themes[theme][0]+'，选择界面风格');button.title='当前：'+themes[theme][0];}
  menu?.querySelectorAll('[data-theme-choice]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.themeChoice===theme)));
 }
 let saved;try{saved=localStorage.getItem(KEY);}catch{}apply(saved);
 document.addEventListener('DOMContentLoaded',()=>{
  const header=document.querySelector('.site-header');if(!header)return;const actions=document.createElement('div');actions.className='header-actions';
  const picker=document.createElement('div');picker.className='theme-picker';button=document.createElement('button');button.type='button';button.id='theme-toggle';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','theme-menu');
  menu=document.createElement('div');menu.id='theme-menu';menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label','选择界面风格');
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  for(const [key,[label,description]] of Object.entries(themes)){const choice=document.createElement('button');choice.type='button';choice.dataset.themeChoice=key;const name=document.createElement('b');name.textContent=label;const detail=document.createElement('small');detail.textContent=description;choice.append(name,detail);
   choice.onclick=()=>{apply(key);try{localStorage.setItem(KEY,key);}catch{window.toast?.('风格已切换；当前浏览器无法保存偏好。');}close();button.focus();};menu.append(choice);
  }
  picker.append(button,menu);actions.append(picker);const tools=header.querySelector('.tools');if(tools)actions.append(tools);header.append(actions);apply(document.documentElement.dataset.theme);
  button.onclick=()=>{const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));};
  document.addEventListener('click',event=>{if(!picker.contains(event.target))close();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();button.focus();}});
 },{once:true});window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)apply(event.newValue);});
})();
