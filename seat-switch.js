/* Seat changes are authorized by DreamRoom; this controller only presents requests. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,dialog,current,previousGame='',previousRole='',previousPhase='',sending=false,lastStatus=null,error='',dismissed='',decisionIds=new Set();
 const room=()=>window.DreamRoom;
 const role=()=>room()?.role||'solo';
 const status=()=>typeof room()?.nextPlayerStatus==='string'?room().nextPlayerStatus:null;
 const requests=()=>Array.isArray(room()?.nextPlayers)?room().nextPlayers.filter(item=>item&&item.gameId===current?.gameId):[];
 const pending=()=>requests().filter(item=>item.status==='pending');
 const pendingKey=()=>current?.gameId+':'+pending().map(item=>item.id).join(',');
 const connected=()=>room()?.connected!==false;
 const seatWindow=()=>current?.phase==='ended'||current?.phase==='select'&&current?.started===false&&current?.selected===null;
 function element(tag,id,text){const node=document.createElement(tag);if(id)node.id=id;if(text!==undefined)node.textContent=text;return node;}
 function title(){return role()==='host'?'下一位开箱玩家':role()==='watch'?'申请下一局开箱':'当前开箱席位';}
 function entries(){
  if(!$('changePlayerRoom')){const leave=$('leaveRoom');if(leave?.parentNode){const button=element('button','changePlayerRoom','换人');button.type='button';button.className='seat-switch-entry';button.setAttribute('aria-label','换人 · 管理开箱席位');button.onclick=open;if(leave.before)leave.before(button);else leave.parentNode.append(button);}}
  if($('changePlayerRoom'))$('changePlayerRoom').hidden=role()==='solo';
  if($('copyPlayer'))$('copyPlayer').textContent='复制开箱操作链接';if($('copyWatch'))$('copyWatch').textContent='复制围观邀请链接';
  for(const [parentId,id]of [['settlement','seatSwitchSettlement'],['resultDialog','seatSwitchResult']]){
   const parent=$(parentId);if(!parent||$(id))continue;const button=element('button',id);button.type='button';button.className='seat-switch-entry enamel';
   button.onclick=()=>{if(parentId==='resultDialog'&&parent.open)parent.close();open();};parent.append(button);
  }
  if(!$('openSeatSwitch')){const parent=document.querySelector('.decision-actions');if(parent){const button=element('button','openSeatSwitch');button.type='button';button.className='secondary seat-switch-entry';button.onclick=open;parent.append(button);}}
  for(const id of ['seatSwitchSettlement','seatSwitchResult','openSeatSwitch']){const button=$(id);if(!button)continue;button.hidden=role()==='solo'||id!=='openSeatSwitch'&&current?.phase!=='ended';button.textContent=role()==='host'?'下一位开箱玩家'+(pending().length?' · '+pending().length+' 位申请':''):role()==='watch'?(status()==='pending'||status()==='sending'||sending?'查看开箱申请 · 等待房主':'申请下一局开箱'):'查看下一位开箱安排';}
 }
 function inform(text,isError=false){$('seatSwitchStatus').textContent=text;$('seatSwitchStatus').classList.toggle('is-error',isError);}
 async function apply(){
  if(role()!=='watch'||sending||status()==='declined'||!room()?.canRequestNextPlayer||!connected())return;
  sending=true;error='';paint();
  try{const accepted=await room().requestNextPlayer();if(accepted===false){sending=false;error='申请没有发出或尚未被采用，请确认连接后重试。';}if(status()==='pending'||status()==='approved'||status()==='declined')sending=false;}
  catch(failure){sending=false;error=failure?.message||'申请失败，请稍后重试。';}
  if(dialog.open)paint();entries();
 }
 async function decide(id,approve){
  if(role()!=='host'||!seatWindow()||decisionIds.size||!pending().some(item=>item.id===id)||!connected())return;
  decisionIds.add(id);error='';paint();
  try{const accepted=await room().decideNextPlayer(id,approve);if(accepted===false)error='这份申请未能处理，可能已过期。请等待同步后重试。';}
  catch(failure){error=failure?.message||'处理失败，请稍后重试。';}
  finally{decisionIds.delete(id);if(dialog.open)paint();}
 }
 function paint(){
  $('seatSwitchTitle').textContent=title();
  $('seatSwitchCurrent').textContent=role()==='host'?'你的席位：房主观看席。房间管理与报价权限保持不变。':role()==='player'?'你的席位：当前开箱玩家。开始前或本局结束后，房主可安排换人。':role()==='watch'?(room()?.joinIntent==='player'?'你打开了开箱邀请，目前仍是围观席。请申请后由房主交接；开始前或结算后可以申请。':'你的席位：围观。开始前或结算后可申请开箱，房主同意后自动切换。'):'正在确认房间席位，请等待同步。';
  $('seatSwitchHint').textContent='这里只更换开箱玩家。房间、房主和管理权限不变；申请获批后才会交接席位。';
  const state=status(),wait=sending||state==='sending'||state==='pending';
  const applyButton=$('requestNextSeat');applyButton.hidden=role()!=='watch';applyButton.disabled=state==='declined'||wait||!room()?.canRequestNextPlayer||!connected();
  applyButton.textContent=wait?'已申请 · 等待房主':'申请下一局开箱';
  $('seatSwitchList').replaceChildren();
  if(role()==='host'){
   const list=pending();
   for(const request of list){
    const card=element('article');card.className='seat-request-card';const name=element('strong',null,typeof request.name==='string'&&request.name?request.name:'匿名观众');
    const hint=element('p',null,'申请成为下一局开箱玩家');const actions=element('div');actions.className='seat-request-actions';
    const approve=element('button',null,'同意，交给这位开箱');approve.type='button';approve.className='enamel';approve.disabled=!!decisionIds.size||!seatWindow()||!connected();approve.onclick=()=>decide(request.id,true);
    const decline=element('button',null,'暂不同意');decline.type='button';decline.className='secondary';decline.disabled=approve.disabled;decline.onclick=()=>decide(request.id,false);
    actions.append(approve,decline);card.append(name,hint,actions);$('seatSwitchList').append(card);
   }
   if(!list.length)$('seatSwitchList').append(element('p',null,'暂时没有待审核的申请。围观者可在开始前或结算后申请。'));
  }
  if(error)inform(error,true);
  else if(!connected())inform('当前连接已中断。恢复连接后可重试，开箱席位不会在离线时改变。',true);
  else if(role()==='host')inform(pending().length?'请选择一位申请者。同意后系统自动交接开箱席位并准备下一局。':'等待下一位申请者。关闭面板后，可从“我的”或设置重新打开。');
  else if(role()==='player')inform('你已是当前开箱玩家，无需申请，也不能替其他围观者获得席位。');
  else if(wait)inform('申请已提交。请等待房主审核；同意后会自动进入开箱席位，无需重新获取链接。');
  else if(state==='approved')inform('房主已同意，正在同步你的新开箱席位…');
  else if(state==='declined')inform('房主暂未同意这次申请。本轮不能重复申请，可以继续围观。');
  else if(!seatWindow())inform('本局正在进行，请先观看至结算，再申请下一局开箱。');
  else if(!room()?.canRequestNextPlayer)inform('开箱申请暂不可用，请等待房主同步或稍后重新查看。');
  else inform('点击申请后，房主会看到你的昵称。只有房主同意后才会切换席位。');
 }
 function open(){
  if(!api||role()==='solo')return false;current=api.getGame();entries();
  window.QuotePopup?.pause();
  if(dialog.open){paint();return true;}if(document.querySelector('dialog[open]'))return false;
  paint();dialog.showModal();return true;
 }
 function render(game){
  if(!api)return;current=game;const state=status(),changed=game.gameId!==previousGame||role()!==previousRole||game.phase!==previousPhase;
  if(changed){sending=false;decisionIds.clear();error='';if(dialog.open)dialog.close();}
  if(state!==lastStatus){sending=false;error='';}lastStatus=state;previousGame=game.gameId;previousRole=role();previousPhase=game.phase;
  entries();if(dialog.open)paint();
  if(role()==='host'&&seatWindow()&&pending().length&&!dialog.open&&dismissed!==pendingKey())open();
 }
 window.SeatSwitch={init(options){
  api=options;current=api.getGame();previousGame=current?.gameId;previousRole=role();previousPhase=current?.phase;
  dialog=element('dialog','seatSwitchDialog');dialog.className='seat-switch-dialog';dialog.setAttribute('aria-labelledby','seatSwitchTitle');
  const heading=element('h2','seatSwitchTitle'),who=element('p','seatSwitchCurrent'),hint=element('p','seatSwitchHint'),statusNode=element('p','seatSwitchStatus');statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
  const list=element('div','seatSwitchList'),applyButton=element('button','requestNextSeat','申请下一局开箱');applyButton.type='button';applyButton.className='enamel';applyButton.onclick=apply;
  const close=element('button','closeSeatSwitch','稍后再看');close.type='button';close.className='secondary';close.onclick=()=>dialog.close();
  dialog.append(heading,who,hint,statusNode,list,applyButton,close);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dismissed=pendingKey();});dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  document.addEventListener('close',()=>queueMicrotask(()=>{if(api)render(api.getGame());}),true);render(current);
 },open,render};
})();
