'use strict';
const MemoryDeck = (() => {
  // Each row is linked to the original, stable bank IDs.
  const cards = [
    ['scr','顺序控制段','先找题干里的动作：开始、转移，还是问操作数？',[
      ['开始一段','SCR（本题库写法）',[282]],
      ['转移到下一步','SCRT，末尾的 T 对应转移。',[239]],
      ['操作数 n 的寄存器区','S 区。单选第 13、29 题是同一问法。',[192,208]]]],
    ['contacts','PLC 触点的连接方式','常闭触点的指令随位置改变。先看接母线、串联还是并联。',[
      ['常开触点接母线','LD',[227]],['常闭触点接母线','LDI',[111,247]],
      ['串联一个常闭触点','ANI',[112]],['并联一个常闭触点','ORI',[113]]]],
    ['blocks','PLC 回路块与单个触点','题干说“回路块”时，看整个支路怎样连接。',[
      ['回路块串联','ANB',[115]],['回路块并联','ORB。原卷还考连续使用 ORB 时最多七次。',[114]]]],
    ['conversion','PLC 数据转换与运算','从源数据读到目标数据，方向很重要。',[
      ['BCD 码转整数','BCD-I。单选第 101、174 题重复考这个方向。',[280,353]],
      ['整数转双整数','I-D：16 位整数转换为 32 位双整数。',[548]],
      ['实数开平方','SQRT',[359]],['字按位取反','INV-W',[322]]]],
    ['width','移位与数据宽度','看到“最大移位位数”，先看操作对象。',[
      ['字移位','一个字是 16 位，最大移位位数为 16。',[541]],
      ['双字移位','一个双字是 32 位，最大移位位数为 32。',[586]]]],
    ['symbols','电器名称与文字符号','题目用中文问器件，答案写字母。',[
      ['时间继电器','KT',[209]],['热继电器','FR',[358]],['熔断器','FU',[327]]]],
    ['protection','电机控制回路的保护','先区分过载、短路、失压，再找对应元件。',[
      ['持续过载','热继电器起过载保护作用。',[182,203,254]],
      ['短路','热继电器有热惯性，不能承担短路保护。',[269,510]],
      ['欠压和失压','自锁控制回路中由接触器承担。',[284]]]],
    ['interlock','正反转接触器互锁','一台接触器吸合时，要阻止另一台同时吸合。',[
      ['问控制方式','互锁控制。',[198]],
      ['问触点怎样接','将对方接触器的常闭辅助触点串入本方线圈回路。',[242]]]],
    ['angles','三相半波可控整流的三个角度','题干都在说角度，要看问的是谁的角度、什么边界。',[
      ['最大移相范围','150°。',[37]],['单只晶闸管最大导通角','120°。',[287]],
      ['电阻性负载的断续边界','控制角大于 30°，电流开始断续；小于或等于 30° 时连续。',[231,562]]]],
    ['feedback','调速系统的反馈补偿','电流正反馈和电压负反馈，分别补偿哪一处压降？',[
      ['电流正反馈','补偿电枢电阻上的压降。',[286]],
      ['电压负反馈','补偿电源内阻上的压降。',[360]]]],
    ['slip','异步电动机的转速和转差率','先分清同步转速与转子实际转速。',[
      ['转子实际转速','还与转差率有关，n＝(1－s)n₁。',[508]],
      ['转差率范围','随运行状态而变，不能一概限定为 0 到 1。',[624]],
      ['电动状态下，同步转速一定','转子越慢，转差率越大，转子电动势频率越高。',[652]]]]
  ];
  function element(tag,text) {
    const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;
  }
  function open(key) {
    const dialog=element('dialog');dialog.className='transfer-dialog memory-deck';dialog.setAttribute('aria-label','关联记忆卡');
    const bar=element('div');bar.className='topline';const label=element('label','关联记忆卡');label.htmlFor='memory-card-select';
    const close=element('button','关闭');close.onclick=()=>dialog.close();bar.append(label,close);
    const select=element('select');select.id=label.htmlFor;
    for(const [id,title] of cards){const option=element('option',title);option.value=id;select.append(option);}
    const section=element('section'), nav=element('div');nav.className='deck-nav';
    const prev=element('button','上一张'),counter=element('small'),next=element('button','下一张');nav.append(prev,counter,next);
    dialog.append(bar,select,section,nav);document.body.append(dialog);
    function display(index) {
      const [id,title,prompt,rows]=cards[index];select.value=id;section.replaceChildren();
      const heading=element('h3',title),intro=element('p',prompt),table=element('dl');
      for(const [front,back] of rows)table.append(element('dt',front),element('dd',back));
      const toggle=element('button','遮住答案自背');
      toggle.className='quiet';toggle.onclick=()=>{
        const hidden=table.classList.toggle('covered');for(const item of table.querySelectorAll('dd'))item.hidden=hidden;
        toggle.textContent=hidden?'显示答案':'遮住答案自背';
      };
      const refs=element('details');refs.append(element('summary','查看关联原题'));
      for(const qid of new Set(rows.flatMap(row=>row[2]))){
        const q=qs[qid],source=element('p');source.append(element('b',(Number(q.u)<=3?'综合卷 · ':'')+questionLabel(q)),element('br'),document.createTextNode(q.s));refs.append(source);
      }
      section.append(heading,intro,toggle,table,refs);
      prev.disabled=index===0;next.disabled=index===cards.length-1;counter.textContent=(index+1)+' / '+cards.length;
      prev.onclick=()=>display(index-1);next.onclick=()=>display(index+1);dialog.scrollTop=0;
    }
    select.onchange=()=>display(select.selectedIndex);
    dialog.onclose=()=>dialog.remove();display(Math.max(0,cards.findIndex(card=>card[0]===key)));dialog.showModal();
  }
  function entry(label,key){
    const b=element('button',label);b.type='button';b.className='quiet deck-entry';b.onclick=()=>open(key);return b;
  }
  function forQuestion(q){
    const matches=cards.filter(card=>card[3].some(row=>row[2].includes(q.id)));
    if(!matches.length)return;
    if(matches.length===1){
      const [key,title]=matches[0];
      document.querySelector('#feedback .feedback').append(entry('关联记忆卡 · '+title,key));return;
    }
    const details=element('details');details.className='deck-related';
    details.append(element('summary','关联记忆卡'));
    for(const [key,title] of matches)details.append(entry(title,key));
    document.querySelector('#feedback .feedback').append(details);
  }
  function home(){main.querySelector('.start-panel').append(entry('关联记忆卡'));}
  return {home,forQuestion,open};
})();
