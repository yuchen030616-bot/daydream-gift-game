/* Local preferences only. Game links remain usable without JavaScript or a nickname. */
(function(){'use strict';
 const choices={blackjack:{name:'21点对战',url:'blackjack.html'},dream:{name:'爱做梦的熊二',url:'dream.html'}},$=id=>document.getElementById(id);
 const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
 function saveName(){const value=$('hallName').value.trim(),count=Array.from(value).length;if(!value){$('nameFeedback').textContent='';return;}if(count>16||/[\u0000-\u001f\u007f-\u009f<>]/.test(value)){$('nameFeedback').textContent='昵称请填 1–16 个字符，不使用尖括号。';return;}const saved=write('daydream.nickname',value);$('nameFeedback').textContent=saved?'昵称已保存，下次进入游戏也会记得。':'可以直接进入游戏，再设置昵称。';}
 const name=read('daydream.nickname');if(typeof name==='string')$('hallName').value=name;
 const last=read('daydream.hall.lastGame'),selected=choices[last]?last:'blackjack';$('recentGame').textContent=choices[selected].name;$('startGame').href=choices[selected].url;
 $('hallName').addEventListener('change',saveName);$('hallName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveName();$('startGame').focus();}});
 for(const card of document.querySelectorAll('[data-game]'))card.addEventListener('click',()=>{saveName();write('daydream.hall.lastGame',card.dataset.game);});
 $('startGame').addEventListener('click',()=>{saveName();write('daydream.hall.lastGame',selected);});
})();
