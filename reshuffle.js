/* Fixed-phrase request and owner approval UI. Parent owns authoritative decisions. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,g,openedGameId=null,pending=false,restoring=false,epoch=0,dismissed='',seenStatus='',requestLatch='';
 const role=()=>window.DreamRoom?.role||'solo';
 const player=()=>['player','solo'].includes(role());
 const playable=()=>player()&&(!window.DreamRoom||DreamRoom.canPlay());
 const shuffled=game=>!!(game?.animation?.active||game?.animationActive||game?.stageEvent?.kind==='shuffle'&&game.stageEvent.active);
 const proposal=()=>g?.reshuffleRequest?.gameId===g?.gameId?g.reshuffleRequest:null;
 const reviewable=()=>['host','solo'].includes(role())&&proposal()?.status==='pending';
 const counterBlocked=()=>g?.counterProposal?.status==='pending'&&!proposal();
 const waiting=()=>proposal()?.status==='pending'||requestLatch===g?.gameId;
 const denied=()=>proposal()?.status==='declined';
 function enabled(){return !!g&&!api.isBusy?.()&&!shuffled(g)&&!pending;}
 function restore(){if(restoring||!g)return;restoring=true;try{window.QuotePopup?.render(g,$('bearLine')?.textContent||'');}finally{restoring=false;}}
 function close(){openedGameId=null;if($('reshuffleDialog').open)$('reshuffleDialog').close();}
 function feedback(text){$('reshuffleFeedback').textContent=text;$('reshuffleInlineNotice').textContent=text;}
 function sync(){
  const host=reviewable(),canEnter=host||player();
  for(const id of ['askReshuffle','askReshuffleQuote']){$(id).hidden=!canEnter;$(id).disabled=!enabled()||counterBlocked()||!host&&(!playable()||denied());$(id).textContent=counterBlocked()?'先撤回礼物要求':host?'审核洗牌申请':denied()?'本局申请已被拒绝':waiting()?'查看洗牌申请':'求熊二 · 重新洗牌';}
  $('reshufflePlayerActions').hidden=!player()||waiting()||denied();$('reshuffleHostActions').hidden=!host;
  $('confirmReshuffle').disabled=!enabled()||!playable()||waiting()||denied()||counterBlocked();$('approveReshuffle').disabled=$('rejectReshuffle').disabled=!enabled()||!host;
  $('reshuffleTitle').textContent=host?'熊二，批准这次洗牌吗？':waiting()?'洗牌申请已送到熊二桌上':'想请熊二重新洗牌？';
  $('reshuffleExplanation').textContent=host?'玩家发送了这句话并申请重新洗牌。同意后才会清空本局进度并重新随机九只宝箱；拒绝将保留当前局。':waiting()?'等待房主决定。申请尚未重开本局，收起弹窗不会撤销申请；请勿重复提交。':'发送这句话后只会提交洗牌申请。房主同意后，本局进度才会清空、九只宝箱重新随机；房主拒绝则保留当前这局。';
 }
 function open(){if(!enabled()||counterBlocked()||!(reviewable()||playable()&&!denied()))return;window.QuotePopup?.pause();if(reviewable()){for(const id of ['resultDialog','playerStartDialog']){const dialog=$(id);if(dialog?.open)dialog.close();}}if(document.querySelector('dialog[open]:not(#reshuffleDialog)'))return;openedGameId=g.gameId;sync();$('reshuffleDialog').showModal();(reviewable()?$('rejectReshuffle'):waiting()?$('closeReshuffle'):$('declineReshuffle')).focus();}
 async function accept(){if(!enabled()||!playable()||waiting()||denied()||counterBlocked()||!$('reshuffleDialog').open||openedGameId!==g.gameId)return;const ticket=epoch,gameId=g.gameId;pending=true;sync();feedback('正在发送申请，等待房主决定…');try{const result=await api.request();if(ticket!==epoch)return;if(result===false)throw Error('暂未发送成功，请等待连接恢复后再试。');requestLatch=gameId;sync();feedback('申请已发送，等待房主决定。');}catch(e){if(ticket===epoch)feedback(e.message||'未能发送，请稍后重试。');}finally{if(ticket===epoch){pending=false;sync();}}}
 async function review(accept){if(!enabled()||!reviewable()||openedGameId!==g.gameId)return;const ticket=epoch,id=proposal().id;pending=true;sync();try{const result=await api.review(id,accept);if(ticket!==epoch)return;if(result===false)throw Error('审核暂未同步，请稍后重试。');dismissed=id;close();}catch(e){if(ticket===epoch)feedback(e.message||'未能同步，请稍后重试。');}finally{if(ticket===epoch){pending=false;sync();}}}
 function render(game){if(!api)return;const old=g?.gameId;g=game;if(old!==g.gameId){epoch++;pending=false;dismissed='';requestLatch='';seenStatus='';close();feedback('');}if(shuffled(g)){epoch++;pending=false;close();}
  const p=proposal();if(p&&p.status!=='pending')requestLatch='';sync();
  const status=p?[p.id,p.status].join(':'):'';if(status!==seenStatus){seenStatus=status;if(p?.status==='declined'){dismissed=p.id;close();feedback(player()?'房主拒绝，本局保留。':'已拒绝洗牌申请，本局保留。');}else if(p?.status==='approved')close();}
  if(reviewable()&&dismissed!==p.id&&!shuffled(g)&&!$('reshuffleDialog').open)open();
 }
 window.ReshufflePrompt={init(options){if(api)return;api=options;
  document.querySelector('.decision-actions').insertAdjacentHTML('afterbegin','<button id="askReshuffle" class="reshuffle-entry" type="button" hidden>求熊二 · 重新洗牌</button><p id="reshuffleInlineNotice" class="reshuffle-inline-notice" role="status" aria-live="polite"></p>');
  document.querySelector('.quote-popup-actions').insertAdjacentHTML('afterend','<button id="askReshuffleQuote" class="secondary reshuffle-quote-entry" type="button" hidden>求熊二 · 重新洗牌</button>');
  document.body.insertAdjacentHTML('beforeend','<dialog id="reshuffleDialog" class="reshuffle-dialog" aria-labelledby="reshuffleTitle" aria-describedby="reshuffleExplanation"><button id="closeReshuffle" class="reshuffle-close" type="button" aria-label="收起洗牌申请">×</button><span class="eyebrow">A LITTLE REQUEST FOR BEAR</span><img class="reshuffle-bear" src="assets/bear-negotiator.png" alt="等待你决定的熊二"><h2 id="reshuffleTitle">想请熊二重新洗牌？</h2><blockquote>求求熊二大王了，我是你的兵</blockquote><p id="reshuffleExplanation"></p><div id="reshufflePlayerActions" class="reshuffle-actions"><button id="confirmReshuffle" class="enamel" type="button">发送并申请 · 等房主批准</button><button id="declineReshuffle" class="secondary" type="button">拒绝 · 保留本局</button></div><div id="reshuffleHostActions" class="reshuffle-actions" hidden><button id="approveReshuffle" class="enamel" type="button">同意 · 重新洗牌</button><button id="rejectReshuffle" class="secondary" type="button">拒绝 · 保留本局</button></div><p id="reshuffleFeedback" role="status" aria-live="polite"></p></dialog>');
  const dismiss=()=>{if(proposal()?.status==='pending')dismissed=proposal().id;close();};$('askReshuffle').onclick=$('askReshuffleQuote').onclick=()=>{dismissed='';open();};$('confirmReshuffle').onclick=accept;$('approveReshuffle').onclick=()=>review(true);$('rejectReshuffle').onclick=()=>review(false);$('declineReshuffle').onclick=$('closeReshuffle').onclick=dismiss;$('reshuffleDialog').oncancel=e=>{e.preventDefault();dismiss();};$('reshuffleDialog').onclose=()=>{openedGameId=null;restore();};
  document.addEventListener('close',()=>queueMicrotask(()=>{if(g&&reviewable()&&dismissed!==proposal().id&&!$('reshuffleDialog').open)render(g);}),true);
 },render};
})();
