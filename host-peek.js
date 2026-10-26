/* Local, read-only host inspection. Nothing is added to the shared game state. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,dialog,grid,button,notice,lastGame='';
 const host=()=>window.DreamRoom?.role==='host';
 function node(tag,id,text){const value=document.createElement(tag);if(id)value.id=id;if(text!==undefined)value.textContent=text;return value;}
 function erase(){grid?.replaceChildren();if(notice)notice.textContent='';}
 function close(){if(dialog?.open)dialog.close();erase();}
 function draw(game){
  if(!host()){close();return false;}
  grid.replaceChildren();const pool=game?.gifts||game?.pool||(typeof DreamEngine!=='undefined'?DreamEngine.GIFTS:[]);
  for(let box=0;box<9;box++){
   const card=node('article');card.className='host-peek-card';const number=node('strong',null,String(box+1).padStart(2,'0')+' 号箱');
   const index=game?.boxes?.[box],gift=Number.isInteger(index)&&index>=0&&index<pool.length?pool[index]:null;
   const text=node('span');text.className='host-peek-value';
   if(!gift)text.textContent='内容尚未同步';
   else if(game.mode==='money'||game.mode==='drink'||gift.kind==='money'||gift.kind==='drink'){
    const mode=gift.kind||game.mode;text.textContent=typeof gift.value==='number'&&Number.isFinite(gift.value)?gift.value+' '+(mode==='money'?'元':'小口'):'数值尚未同步';
   }else text.textContent=typeof gift.name==='string'?gift.name:'内容尚未同步';
   const tags=node('small');tags.textContent=(game?.opened||[]).includes(box)?'已揭晓':game?.selected===box?'玩家保留箱':'未打开';
   card.append(number,text,tags);grid.append(card);
  }
  return true;
 }
 function open(){
  if(!api||!host()){close();return false;}
  const blocking=document.querySelector('dialog[open]');if(blocking&&blocking!==dialog){notice.textContent='请先关闭当前弹窗，再偷偷看。';return false;}
  notice.textContent='';const game=api.getGame();if(!draw(game))return false;lastGame=game?.gameId||'';
  if(!dialog.open)dialog.showModal();return true;
 }
 function render(game){
  if(!api)return;const allowed=host();button.hidden=!allowed;notice.hidden=!allowed;
  if(!allowed){close();return;}
  if(dialog.open){if(lastGame!==(game?.gameId||''))close();else draw(game);}
  // Closed dialogs must never hold hidden box names, values or mappings.
  else erase();
 }
 window.HostPeek={init(options){
  if(api)return;api=options;
  button=node('button','hostPeekButton');button.type='button';button.title='偷偷看';button.setAttribute('aria-label','偷偷看 · 仅房主本机可见');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','hostPeekDialog');
  const icon=node('img');icon.src='assets/strong-peek.svg';icon.alt='光头强';icon.width=26;icon.height=26;button.append(icon);button.onclick=open;
  notice=node('span','hostPeekNotice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const corner=document.querySelector('.stage-top');if(corner)corner.append(button,notice);
  dialog=node('dialog','hostPeekDialog');dialog.className='host-peek-dialog';dialog.setAttribute('aria-labelledby','hostPeekTitle');
  const title=node('h2','hostPeekTitle','偷偷看 · 本机房主视角'),help=node('p',null,'只读查看。不会更改箱内内容，不会发送给其他席位。关闭后立即清空显示。');
  grid=node('div','hostPeekGrid');const dismiss=node('button','closeHostPeek','看完了，收起来');dismiss.type='button';dismiss.className='secondary';dismiss.onclick=close;
  dialog.append(title,help,grid,dismiss);document.body.append(dialog);
  dialog.addEventListener('close',erase);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});render(api.getGame());
 },render,open,close};
})();
