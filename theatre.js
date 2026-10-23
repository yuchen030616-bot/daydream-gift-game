/* Public stage effects and role-scoped banter controls; authority stays in parent. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,current=null,lastGame='',lastEvent='',timer=null,noticeTimer=null;
 function placeControls(){const controls=$('theatreControls'),dialog=$('quoteDialog');if(!controls)return;if(dialog?.open)dialog.appendChild(controls);else document.querySelector('.decision').insertAdjacentElement('afterend',controls);}
 const role=()=>window.DreamRoom?.role||'solo';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function stop(){clearTimeout(timer);timer=null;const shuffle=$('theatreShuffle'),bubble=$('theatreBanter');if(shuffle)shuffle.hidden=true;if(bubble){bubble.hidden=true;try{if(bubble.matches(':popover-open'))bubble.hidePopover();}catch{}}}
 function hint(text){clearTimeout(noticeTimer);$('theatreNotice').textContent=text;noticeTimer=setTimeout(()=>{$('theatreNotice').textContent='';},2400);}
 function send(speaker,index){const r=role();if(!api||r==='watch'||speaker==='host'&&r!=='host'||speaker==='player'&&!['player','solo'].includes(r))return;if(api.isBusy?.()){hint('这一刻正在揭晓，稍等一下再放话。');return;}try{const result=api.send(speaker,index);if(result===false)hint('先让这句话落地，稍等片刻再说。');else if(result?.catch)result.catch(()=>hint('这句还没发出去，请稍后再试。'));}catch{hint('稍等片刻，再来一句。');}}
 function showEvent(event){
  stop();if(event.kind==='shuffle'){
   $('theatreShuffle').hidden=false;
   $('theatreShuffleLine').textContent=String(event.text||'熊二正在洗牌，请稍候…');
   const stage=document.querySelector('.stage');if(!window.MobilePages?.focus('game'))stage?.scrollIntoView?.({behavior:'instant',block:'center'});
  }else if(event.kind==='banter'){
   const bubble=$('theatreBanter');(document.querySelector('dialog[open]')||document.body).appendChild(bubble);$('theatreSpeaker').textContent=event.speaker==='host'?'熊二 · 谈判放话':'追梦人 · 接招吧';$('theatreLine').textContent=String(event.text||'');bubble.hidden=false;
   // A normal positioned panel never enters the modal top layer or steals focus.
  }
  const duration=[2200,3000].includes(event.duration)?event.duration:event.kind==='shuffle'?2200:3000;
  timer=setTimeout(()=>{stop();},duration);
 }
 function render(g){
  if(!api||!g)return;current=g;placeControls();
  if(g.gameId!==lastGame){stop();lastEvent='';lastGame=g.gameId;clearTimeout(noticeTimer);$('theatreNotice').textContent='';}
  const r=role(),busy=!!api.isBusy?.();$('playerBanter').hidden=!['player','solo'].includes(r);$('hostBanter').hidden=r!=='host';$('theatreControls').hidden=r==='watch';
  for(const button of document.querySelectorAll('[data-theatre-speaker]')){button.setAttribute('aria-disabled',String(busy));const i=Number(button.dataset.theatreIndex);button.textContent=g.mode==='drink'?(button.dataset.theatreSpeaker==='host'?['嘴硬冠军','概率大师','算盘对决','表情预定']:['良心兑水','格局打开','算盘坏了','先别得意'])[i]:button.dataset.theatreSpeaker==='host'?['见好就收','小奖还在','俺再算算','最后一口'][i]:['嘴硬一下','我要大的','再加点','这局不怂'][i];}
  const event=g.stageEvent;
  if(event?.active&&event.kind==='banter'&&!$('theatreBanter').hidden)(document.querySelector('dialog[open]')||document.body).appendChild($('theatreBanter'));
  if(!event||event.active===false){stop();if(event?.id)lastEvent=event.id;return;}
  if(event.active===true&&event.id&&event.id!==lastEvent){lastEvent=event.id;showEvent(event);}
 }
 window.GameTheatre={init(options){if(api)return;api=options;
  const stage=document.querySelector('.stage');if(!stage)return;stage.style.position='relative';
  stage.insertAdjacentHTML('beforeend',`<div id="theatreShuffle" class="theatre-shuffle" role="status" aria-live="polite" hidden><span class="theatre-kicker">BEAR'S SECRET SHUFFLE</span><h3>九只梦盒，重新藏好。</h3><div class="theatre-shuffle-boxes" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i style="--box:${i}"><span>✦</span></i>`).join('')}</div><p id="theatreShuffleLine">熊二正在洗牌，请稍候…</p></div>`);
  const controls=`<section id="theatreControls" class="theatre-controls" aria-label="直播放话互动"><div class="theatre-controls-heading"><strong>✦ 森林放话台</strong><span>隔空过招，给梦想加点戏</span></div><div id="playerBanter" class="theatre-button-row">${['嘴硬一下','我要大的','再加点','这局不怂'].map((text,i)=>`<button type="button" data-theatre-speaker="player" data-theatre-index="${i}">${escape(text)}</button>`).join('')}</div><div id="hostBanter" class="theatre-button-row" hidden>${['见好就收','小奖还在','俺再算算','最后一口'].map((text,i)=>`<button type="button" data-theatre-speaker="host" data-theatre-index="${i}">${escape(text)}</button>`).join('')}</div><p id="theatreNotice" role="status" aria-live="polite"></p></section>`;
  document.querySelector('.decision').insertAdjacentHTML('afterend',controls);
  document.body.insertAdjacentHTML('beforeend','<aside id="theatreBanter" class="theatre-banter" role="status" aria-live="polite" hidden><img src="assets/bear-negotiator.png" alt="熊二"><div><span id="theatreSpeaker"></span><p id="theatreLine"></p></div></aside>');
  for(const button of document.querySelectorAll('[data-theatre-speaker]'))button.onclick=()=>send(button.dataset.theatreSpeaker,Number(button.dataset.theatreIndex));
  document.addEventListener('close',e=>{if(e.target===$('quoteDialog'))queueMicrotask(placeControls);queueMicrotask(()=>{const bubble=$('theatreBanter');if(bubble&&!bubble.hidden)(document.querySelector('dialog[open]')||document.body).appendChild(bubble);});},true);
 },render,stop};
})();

