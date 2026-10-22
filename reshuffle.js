/* Explicit, fixed-phrase reshuffle consent; parent owns the actual reset. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,g,openedGameId=null,pending=false,restoring=false,epoch=0;
 const role=()=>window.DreamRoom?.role||'solo';
 const player=()=>['player','solo'].includes(role());
 const shuffled=game=>!!(game?.animation?.active||game?.animationActive||game?.stageEvent?.kind==='shuffle'&&game.stageEvent.active);
 const playable=()=>player()&&(!window.DreamRoom||DreamRoom.canPlay());
 function enabled(){return !!g&&playable()&&!api.isBusy?.()&&!shuffled(g)&&!pending;}
 function restore(){if(restoring||!g)return;restoring=true;try{window.QuotePopup?.render(g,$('bearLine')?.textContent||'');}finally{restoring=false;}}
 function close(){openedGameId=null;if($('reshuffleDialog').open)$('reshuffleDialog').close();}
 function sync(){for(const id of ['askReshuffle','askReshuffleQuote']){$(id).hidden=!player();$(id).disabled=!enabled();}$('confirmReshuffle').disabled=!enabled();}
 function open(){if(!enabled())return;window.QuotePopup?.pause();if(document.querySelector('dialog[open]:not(#reshuffleDialog)'))return;openedGameId=g.gameId;$('reshuffleFeedback').textContent='';$('reshuffleDialog').showModal();$('declineReshuffle').focus();}
 async function accept(){if(!enabled()||!$('reshuffleDialog').open||openedGameId!==g.gameId)return;const ticket=epoch;pending=true;sync();$('reshuffleFeedback').textContent='正在发送这句话，等待熊二重新洗牌…';try{const result=await api.request();if(ticket!==epoch)return;if(result===false)throw Error('暂未发送成功，请等待连接恢复后再试。');close();}catch(e){if(ticket===epoch)$('reshuffleFeedback').textContent=e.message||'未能发送，请稍后重试。';}finally{if(ticket===epoch){pending=false;sync();}}}
 function render(game){if(!api)return;const previous=g?.gameId;g=game;if(previous!==g.gameId||shuffled(g)){epoch++;pending=false;close();}sync();}
 window.ReshufflePrompt={init(options){if(api)return;api=options;
  document.querySelector('.decision-actions').insertAdjacentHTML('afterbegin','<button id="askReshuffle" class="reshuffle-entry" type="button" hidden>求熊二 · 重新洗牌</button>');
  document.querySelector('.quote-popup-actions').insertAdjacentHTML('afterend','<button id="askReshuffleQuote" class="secondary reshuffle-quote-entry" type="button" hidden>求熊二 · 重新洗牌</button>');
  document.body.insertAdjacentHTML('beforeend','<dialog id="reshuffleDialog" class="reshuffle-dialog" aria-labelledby="reshuffleTitle" aria-describedby="reshuffleExplanation"><button id="closeReshuffle" class="reshuffle-close" type="button" aria-label="拒绝并保留本局">×</button><span class="eyebrow">A LITTLE REQUEST FOR BEAR</span><img class="reshuffle-bear" src="assets/bear-negotiator.png" alt="等待你决定的熊二"><h2 id="reshuffleTitle">想请熊二重新洗牌？</h2><blockquote>求求熊二大王了，我是你的兵</blockquote><p id="reshuffleExplanation">接受并发送这句话后，本局进度清空，九只宝箱重新随机；拒绝保留当前这局。</p><div class="reshuffle-actions"><button id="confirmReshuffle" class="enamel" type="button">接受并发送 · 重新洗牌</button><button id="declineReshuffle" class="secondary" type="button">拒绝 · 保留本局</button></div><p id="reshuffleFeedback" role="status" aria-live="polite"></p></dialog>');
  $('askReshuffle').onclick=$('askReshuffleQuote').onclick=open;$('confirmReshuffle').onclick=accept;$('declineReshuffle').onclick=$('closeReshuffle').onclick=close;$('reshuffleDialog').oncancel=e=>{e.preventDefault();close();};$('reshuffleDialog').onclose=()=>{openedGameId=null;restore();};
 },render};
})();
