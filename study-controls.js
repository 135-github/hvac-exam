/* Shared accessible controls; each subject owns its settings and records. */
(() => {
  'use strict';
  const selection=(saved,legacy,allowed)=>Array.isArray(saved)?[...new Set(saved.filter(v=>typeof v==='string'&&allowed.includes(v)))]:legacy&&allowed.includes(legacy)?[legacy]:[...allowed];
  const matches=(selected,legacy,value)=>Array.isArray(selected)?selected.includes(value):!legacy||legacy===value;
  function filters(settings,changed){
    for(const key of ['scope','unit','type','order','mode']){
      const select=document.getElementById('free-'+key);if(!select)continue;
      const label=select.parentElement,title=label.firstChild.textContent.trim();
      const options=[...select.options].map(o=>({value:o.value,text:o.textContent}));
      const multiple=key==='unit'||key==='type';
      const field=document.createElement('fieldset');field.className='choice-field';field.id='free-'+key;
      const legend=document.createElement('legend');legend.textContent=title+(multiple?' · 可多选':'');field.append(legend);
      const list=document.createElement('div');list.className='filter-choices';field.append(list);
      const allowed=options.filter(o=>o.value).map(o=>o.value),storage=key+'Selections';
      if(multiple)settings[storage]=selection(settings[storage],settings[key],allowed);
      const sync=()=>{for(const input of list.querySelectorAll('input')){if(multiple){input.checked=input.value?settings[storage].includes(input.value):settings[storage].length===allowed.length;input.indeterminate=!input.value&&settings[storage].length>0&&settings[storage].length<allowed.length;}else input.checked=settings[key]===input.value;}};
      for(const option of options){
        const chip=document.createElement('label');chip.className='filter-choice';
        const input=document.createElement('input');input.type=multiple?'checkbox':'radio';input.name='free-'+key;input.value=option.value;
        const text=document.createElement('span');text.textContent=option.text;chip.append(input,text);list.append(chip);
        input.onchange=()=>{if(multiple){settings[storage]=input.value?(input.checked?[...settings[storage],input.value]:settings[storage].filter(v=>v!==input.value)):(input.checked?[...allowed]:[]);settings[storage]=[...new Set(settings[storage])];settings[key]=settings[storage].length===1?settings[storage][0]:'';}else settings[key]=input.value;sync();changed();};
      }
      sync();label.replaceWith(field);
    }
  }
  function progress(list,read,begin,format){
    const grid=document.querySelector('.stitches');if(!grid)return;
    grid.replaceChildren();grid.setAttribute('role','group');grid.setAttribute('aria-label','题目进度，点击题号直接开始');
    const ids=list.map(q=>q.id);
    for(const q of list){
      const r=read(q.id),state=r.wrong?'weak':r.level>=3?'mastered':r.seen?'seen':r.viewed?'viewed':'';
      const label={weak:'需要再练',mastered:'已巩固',seen:'已练过',viewed:'已翻看','':'未接触'}[state];
      const button=document.createElement('button');button.type='button';button.className='stitch '+state;button.dataset.question=q.id;
      const view=format?format(q):{text:q.id+1,title:`第${q.id+1}题`};
      button.textContent=view.text;button.title=`${view.title} · ${label}：${q.s}`;button.setAttribute('aria-label',button.title);
      button.onclick=()=>begin(ids,'进度方块选题','answer',ids.indexOf(q.id));grid.append(button);
    }
  }
  window.StudyControls={selection,matches,filters,progress};
})();
