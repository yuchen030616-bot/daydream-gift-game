/* The protocol owns seat grants. Spectators join with one click; hosts invite an online member. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,current,dialog,sending=false,error='',inviting='',previousGame='',previousRole='';
 const room=()=>window.DreamRoom,role=()=>room()?.role||'solo',connected=()=>room()?.connected!==false;
 const participant=()=>['money','drink'].includes(current?.mode)?'玩家':'主播';
 function node(tag,id,text){const n=document.createElement(tag);if(id)n.id=id;if(text!==undefined)n.textContent=text;return n;}
 function message(){return error||(!connected()?'连接中断，恢复后请重试。':role()==='watch'?sending?'正在上场，等待房间同步…':room()?.canRequestNextPlayer?'点击即可上场，自动进入新一局。':'当前席位已安排或对局进行中，请等待本局结束。':role()==='player'?'你已是当前'+participant()+'，直接开始游戏。':'点击一位在线成员旁的“邀请对战”，即可交接'+participant()+'席。');}
 function entries(){
  if(!$('changePlayerRoom')){const leave=$('leaveRoom');if(leave?.parentNode){const b=node('button','changePlayerRoom');b.type='button';b.className='seat-switch-entry seat-primary';b.onclick=primary;if(leave.before)leave.before(b);else leave.parentNode.append(b);}}
  const main=$('changePlayerRoom');if(main){main.hidden=role()==='solo';main.textContent=role()==='host'?'邀请对战':role()==='player'?'已在'+participant()+'席':sending?'正在上场…':'申请上场';main.disabled=role()==='player'||!connected()||sending||role()==='watch'&&!room()?.canRequestNextPlayer;main.onclick=primary;main.setAttribute('aria-label',main.textContent);}
  if(!$('seatSwitchQuickStatus')&&main?.parentNode){const p=node('p','seatSwitchQuickStatus');p.className='seat-quick-status';p.setAttribute('role','status');p.setAttribute('aria-live','polite');main.parentNode.append(p);}
  if($('seatSwitchQuickStatus')){$('seatSwitchQuickStatus').hidden=role()==='solo';$('seatSwitchQuickStatus').textContent=message();}
  if($('copyPlayer'))$('copyPlayer').textContent='复制开箱操作链接';if($('copyWatch'))$('copyWatch').textContent='复制围观邀请链接';
  for(const [parentId,id]of [['settlement','seatSwitchSettlement'],['resultDialog','seatSwitchResult']]){const parent=$(parentId);if(parent&&!$(id)){const b=node('button',id);b.type='button';b.className='seat-switch-entry enamel';b.onclick=()=>{if(parentId==='resultDialog'&&parent.open)parent.close();return primary();};parent.append(b);}}
  if(!$('openSeatSwitch')){const parent=document.querySelector('.decision-actions');if(parent){const b=node('button','openSeatSwitch');b.type='button';b.className='secondary seat-switch-entry';b.onclick=primary;parent.append(b);}}
  for(const id of ['seatSwitchSettlement','seatSwitchResult','openSeatSwitch']){const b=$(id);if(!b)continue;b.hidden=role()==='solo'||role()==='player'||id!=='openSeatSwitch'&&current?.phase!=='ended';b.textContent=role()==='host'?'邀请对战':sending?'正在上场…':'申请上场';b.disabled=!connected()||sending||role()==='watch'&&!room()?.canRequestNextPlayer;}
 }
 async function apply(){
  if(role()!=='watch'||sending||!connected()||!room()?.canRequestNextPlayer)return false;
  sending=true;error='';entries();if(dialog.open)dialog.close();
  try{if(await room().requestNextPlayer()===false){sending=false;error='上场未成功，请等待同步后重试。';}}
  catch(e){sending=false;error=e?.message||'上场失败，请重试。';}
  entries();return !error;
 }
 async function invite(id){
  if(role()!=='host'||inviting||!connected()||!room()?.canInvitePlayer)return false;
  inviting=id;error='';paint();
  try{if(await room().invitePlayer(id)===false)error='这位成员暂时无法上场，请等待房间同步后重试。';else if(dialog.open)dialog.close();}
  catch(e){error=e?.message||'邀请失败，请重试。';}
  finally{inviting='';if(dialog.open)paint();entries();}
 }
 function paint(){
  $('seatSwitchTitle').textContent=role()==='host'?'邀请对战':'申请上场';
  $('seatSwitchCurrent').textContent=role()==='host'?'选择一位在线成员，点击即可让对方进入'+participant()+'席。':'点击“申请上场”，自动进入新一局。';
  $('seatSwitchHint').textContent='房主、报价和管理权限保持不变。进行中的对局不会被打断。';
  $('seatSwitchStatus').textContent=message();$('seatSwitchStatus').classList.toggle('is-error',!!error);
  const list=$('seatSwitchList');list.replaceChildren();
  if(role()==='host'){
   const members=Array.isArray(room()?.members)?room().members.filter(p=>p&&p.id&&p.role!=='host'):[];
   for(const member of members){const card=node('article');card.className='seat-request-card';const name=node('strong',null,member.name||'匿名观众'),hint=node('p',null,member.role==='player'?'当前'+participant():'在线 · 可邀请');const actions=node('div');actions.className='seat-request-actions';const b=node('button',null,inviting===member.id?'正在邀请…':'邀请对战');b.type='button';b.className='enamel';b.disabled=!!inviting||!connected()||!room()?.canInvitePlayer||member.invitable!==true;b.onclick=()=>invite(member.id);actions.append(b);card.append(name,hint,actions);list.append(card);}
   if(!members.length)list.append(node('p',null,'暂无在线成员，请先分享围观邀请链接。'));
  }
  const b=$('requestNextSeat');b.hidden=role()!=='watch';b.disabled=sending||!connected()||!room()?.canRequestNextPlayer;b.textContent=sending?'正在上场…':'申请上场';
 }
 function open(){
  if(!api||role()==='solo'||role()==='player')return false;current=api.getGame();
  if(role()==='watch')return apply();
  window.QuotePopup?.pause();if(dialog.open){paint();return true;}if(document.querySelector('dialog[open]'))return false;paint();dialog.showModal();return true;
 }
 function primary(){return role()==='watch'?apply():open();}
 function render(game){
  if(!api)return;current=game;const changed=game.gameId!==previousGame||role()!==previousRole;
  if(changed){sending=false;error='';if(dialog.open)dialog.close();}
  if(!room()?.canRequestNextPlayer&&room()?.nextPlayerStatus!=='sending')sending=false;
  previousGame=game.gameId;previousRole=role();entries();if(dialog.open)paint();
 }
 window.SeatSwitch={init(options){api=options;current=api.getGame();previousGame=current?.gameId;previousRole=role();dialog=node('dialog','seatSwitchDialog');dialog.className='seat-switch-dialog';dialog.setAttribute('aria-labelledby','seatSwitchTitle');const heading=node('h2','seatSwitchTitle'),who=node('p','seatSwitchCurrent'),hint=node('p','seatSwitchHint'),status=node('p','seatSwitchStatus'),list=node('div','seatSwitchList'),applyButton=node('button','requestNextSeat','申请上场'),close=node('button','closeSeatSwitch','关闭');status.setAttribute('role','status');status.setAttribute('aria-live','polite');applyButton.type='button';applyButton.className='enamel';applyButton.onclick=apply;close.type='button';close.className='secondary';close.onclick=()=>dialog.close();dialog.append(heading,who,hint,status,list,applyButton,close);document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();});render(current);},open,render};
})();
