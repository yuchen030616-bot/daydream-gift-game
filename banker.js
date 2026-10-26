/* Room owner approves quote-only delegation. This UI never changes authority itself. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),room=()=>window.DreamRoom;
 let api,game,busy=false,dismissed='',dismissedInvite='',lastKey='',listKey='',epoch=0;
 const host=()=>room()?.role==='host';
 const requests=()=>room()?.bankerRequests||[];
 const pending=()=>requests().filter(r=>['pending','queued'].includes(r.status));
 const key=()=>pending().map(r=>r.id).join('|');
 function status(text){$('bankerStatus').textContent=text;}
 function close(){dismissed=key();if(room()?.hostInvitation)dismissedInvite=room().hostInvitation.id;if($('bankerDialog').open)$('bankerDialog').close();}
 function renderList(){const signature=JSON.stringify([host(),busy,room()?.connected,room()?.handoffPending,game?.mode,pending(),host()?room()?.members:[]]);if(signature===listKey)return;listKey=signature;const list=$('bankerRequestsList'),members=$('bankerMembersList');list.replaceChildren();members.replaceChildren();
  if(!host())return;for(const request of pending()){
   const row=document.createElement('div');row.className='banker-request';
   const name=document.createElement('strong');name.textContent=request.name+(request.status==='queued'?' · 等本轮结算后交接':' · 申请接任房主和庄家');row.append(name);
   const actions=document.createElement('div');actions.className='banker-review-actions';
   for(const[accept,label]of [[false,'拒绝'],[true,'同意 · 交接房主']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=busy||room()?.connected===false||room()?.handoffPending;button.onclick=()=>decide(request.id,accept);actions.append(button);}row.append(actions);list.append(row);
  }
  for(const member of room()?.members||[]){if(member.role==='host')continue;const row=document.createElement('div');row.className='banker-request';const name=document.createElement('strong');name.textContent=member.name+' · '+(member.role==='player'?(game?.mode==='money'||game?.mode==='drink'?'玩家':'主播'):'围观');const button=document.createElement('button');button.type='button';button.textContent='邀请成为房主';button.disabled=busy||room()?.connected===false||!member.handoffInvitable||room()?.handoffPending;button.onclick=()=>{if(host())return invoke(()=>room().inviteHost(member.id),'邀请已发送，等待对方明确接受成为房主和庄家。');};row.append(name,button);members.append(row);}
 }
 function sync(){if(!api)return;const active=room()&&room().role!=='solo',banker=room()?.currentBanker;
  $('bankerEntry').hidden=!active;$('bankerEntry').textContent=room()?.hostInvitation?'收到房主邀请 · 接受/拒绝':host()?'庄家 / 房主 · 邀请换人':'申请庄家 · 接任房主';
  $('bankerCurrent').textContent=banker?'当前庄家：'+banker.name+(banker.host?'（房主）':'（仅报价）'):'当前庄家：房主';
  $('requestBanker').hidden=host()||!!room()?.hostInvitation;$('requestBanker').disabled=busy||room()?.canRequestBanker!==true||room()?.connected===false||room()?.handoffPending;$('requestBanker').textContent=room()?.role==='player'?'申请换边并接任房主':'申请成为庄家并接任房主';
  $('reclaimBanker').hidden=!host()||banker?.host!==false;$('reclaimBanker').disabled=busy||room()?.connected===false;
  $('bankerReviewHeading').hidden=!host();$('bankerMemberHeading').hidden=!host();$('bankerMembersList').hidden=!host();$('bankerInvitation').hidden=!room()?.hostInvitation;
  $('acceptHostInvitation').disabled=$('declineHostInvitation').disabled=busy||room()?.connected===false;renderList();
 }
 async function invoke(fn,message){if(busy||room()?.connected===false)return;busy=true;const ticket=epoch;sync();status('正在同步…');try{const ok=await fn();if(ticket!==epoch)return;if(ok===false)throw Error('当前未能完成，请等待最新房间状态后重试。');status(message);}catch(e){if(ticket===epoch)status(e.message||'同步失败，请稍后重试。');}finally{if(ticket===epoch){busy=false;sync();}}}
 function decide(id,accept){if(!host()||!pending().some(r=>r.id===id))return;return invoke(()=>room().decideBanker(id,accept),accept?'正在安全交接房主，确认前原房主继续负责。':'已拒绝这份接任申请。');}
 function open(){if(!api||!room()||room().role==='solo')return;window.QuotePopup?.pause();if(document.querySelector('dialog[open]:not(#bankerDialog)'))return;sync();if(!$('bankerDialog').open)$('bankerDialog').showModal();$('closeBanker').focus();}
 function render(g){if(!api)return;game=g;const next=room()?.role+':'+room()?.currentBanker?.peer;if(next!==lastKey){if(lastKey&&lastKey.split(':')[0]!==room()?.role)close();epoch++;busy=false;lastKey=next;}sync();const state=room()?.bankerRequestStatus;if(room()?.handoffPending)status('正在安全交接房主；新页面保存确认后才切换，原房主不会提前失去管理。');else if(state==='queued')status('交接已排队，本轮计分结算后执行；当前财务主体保持。');else if(state==='pending'||state==='sending')status('接任申请等待原房主审批，当前身份保持。');else if(state==='declined')status('未接受这次交接，房间和对局保持。');else if(host())status('你是当前房主和庄家。可直接邀请在线成员接任；开箱玩家不同时报价。');else status(room()?.role==='player'?'你当前是开箱席，只负责选箱和开箱；如接任房主须完整换边后才能报价。':'你当前是围观席；申请接任房主须经当前房主确认，未接任前不能报价或管理。');
  if(host()&&pending().length&&dismissed!==key()&&!$('bankerDialog').open)open();
  if(!host()&&room()?.hostInvitation&&dismissedInvite!==room().hostInvitation.id&&!$('bankerDialog').open)open();
 }
 window.BankerPanel={init(options){if(api)return;api=options;
  const entry=document.createElement('button');entry.id='bankerEntry';entry.type='button';entry.className='banker-entry';entry.textContent='庄家 · 申请 / 查看';($('roomActions')||$('roomPanel')).append(entry);
  document.body.insertAdjacentHTML('beforeend','<dialog id="bankerDialog" class="banker-dialog" aria-labelledby="bankerTitle"><button id="closeBanker" class="banker-close" type="button" aria-label="关闭庄家面板">×</button><span class="eyebrow">THE QUOTE DESK</span><h2 id="bankerTitle">庄家 · 接任房主</h2><p id="bankerCurrent"></p><p>接任后你将成为房主和庄家，负责报价及房间管理。若你原来开箱，原房主会接替开箱；同一人不兼任开箱与报价。</p><button id="requestBanker" class="enamel" type="button">申请成为庄家并接任房主</button><button id="reclaimBanker" class="secondary" type="button" hidden>房主收回报价权</button><section id="bankerInvitation" hidden><p>房主邀请你成为庄家并接任房主。仅在资料安全保存、双方确认后才正式换位。</p><button id="acceptHostInvitation" class="enamel" type="button">接受 · 成为房主和庄家</button><button id="declineHostInvitation" class="secondary" type="button">拒绝 · 保持当前身份</button></section><h3 id="bankerMemberHeading">在线成员 · 直接邀请</h3><div id="bankerMembersList"></div><h3 id="bankerReviewHeading">待审批申请</h3><div id="bankerRequestsList"></div><p id="bankerStatus" role="status" aria-live="polite"></p></dialog>');
  $('bankerEntry').onclick=open;$('closeBanker').onclick=close;$('bankerDialog').oncancel=e=>{e.preventDefault();close();};
  $('requestBanker').onclick=()=>{if(host()||room()?.canRequestBanker!==true)return;return invoke(()=>room().requestBanker(),'庄家申请已发送，等待房主同意。');};
  $('reclaimBanker').onclick=()=>{if(!host())return;return invoke(()=>room().reclaimBanker(),'房主已收回报价权。');};
  for(const[id,accept]of [['acceptHostInvitation',true],['declineHostInvitation',false]])$(id).onclick=()=>{const invite=room()?.hostInvitation;if(!invite||host())return;return invoke(()=>room().acceptHostInvitation(invite.id,accept),accept?'已接受接任，正在安全保存房间资料。':'已拒绝接任，当前身份保持。');};
  document.addEventListener('close',()=>queueMicrotask(()=>{if(game)render(game);}),true);render(options.getGame());
 },render,open};
})();
