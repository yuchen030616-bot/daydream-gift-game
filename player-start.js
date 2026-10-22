(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let dispatch,current,dismissed=false;
 const player=()=>window.DreamRoom?.role==='player';
 function show(){if(!player()||current?.started!==false||dismissed||document.querySelector('dialog[open]'))return;$('playerStartDialog').showModal();}
 function render(game){
  const justStarted=player()&&current?.started===false&&game.started===true;
  if(game.gameId?game.gameId!==current?.gameId:game!==current)dismissed=false;
  current=game;const waiting=player()&&game.phase==='select'&&game.started===false;
  $('readyPlayer').hidden=!waiting;
  if(!waiting){dismissed=false;if($('playerStartDialog').open)$('playerStartDialog').close();if(justStarted)document.querySelector('.stage')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
  const ready=DreamRoom.canPlay();$('beginPlayer').disabled=!ready;
  $('startNickname').textContent=($('roomMyName')?.textContent||'').replace(/^我的昵称：/,'')+'，轮到你追梦啦！';
  $('startConnection').textContent=ready?(game.director?.enabled?'本局为导演设置局：房主已设置藏宝，具体礼物仍保密。开始后先选一只保留箱。':'开始后先选一只保留箱，接下来由你决定收下报价还是继续。'):'正在等待房主同步，连接就绪后即可开始。';
  show();
 }
 window.PlayerStart={init(fn){dispatch=fn;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="playerStartDialog" class="player-start-dialog" aria-labelledby="playerStartTitle"><span class="eyebrow">YOUR DREAM STARTS HERE</span><img src="assets/bear-negotiator.png" alt="熊二等待你开始"><h2 id="playerStartTitle">准备好，开启你的梦想！</h2><p id="startNickname"></p><p id="startConnection" role="status"></p><button id="beginPlayer" class="enamel" type="button">开始游戏 ✦</button><button id="laterPlayer" class="secondary" type="button">稍后开始</button></dialog>`);
  document.querySelector('.decision-actions').insertAdjacentHTML('afterbegin','<button id="readyPlayer" class="enamel" type="button" hidden>准备开始游戏 ✦</button>');
  $('beginPlayer').onclick=()=>{if(!player()||current?.started!==false||!DreamRoom.canPlay()||$('beginPlayer').disabled)return;$('beginPlayer').disabled=true;dispatch('start');};
  const later=()=>{dismissed=true;$('playerStartDialog').close();};$('laterPlayer').onclick=later;$('playerStartDialog').oncancel=e=>{e.preventDefault();later();};
  $('readyPlayer').onclick=()=>{dismissed=false;render(current);};
  document.addEventListener('close',()=>queueMicrotask(show),true);
 },render};
})();
