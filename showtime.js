/* Public theatre uses only revealed game state; no private quote arithmetic. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let api,previous=null,shown='',latest=null,locked=false,momentTimer,pendingResult=false,pendingSettlementScroll=false;
  const role=()=>window.DreamRoom?.role||'solo';
  const playable=()=>['solo','player'].includes(role())&&(!window.DreamRoom||DreamRoom.canPlay());
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function moment(title,subtitle){
    const el=$('momentBanner');clearTimeout(momentTimer);el.innerHTML=`<strong>${escape(title)}</strong><small>${escape(subtitle)}</small>`;el.hidden=false;
    try{if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();}catch{}
    momentTimer=setTimeout(()=>{el.hidden=true;try{el.hidePopover?.();}catch{}},2300);
  }
  function comparisonHTML(g){const c=g.comparison,mode=g.mode||'gift';if(mode==='drink'&&c.kind==='skip')return `<div class="settlement-grid"><article><span>本局已自愿跳过</span>${api.art(g.result)}<strong>${escape(g.result.name)}</strong><p>不用饮用，按自己的意愿参与就好。</p></article></div>`;const label=c.kind==='keep'?'最后拒绝的报价':mode==='money'?'原箱金额':mode==='drink'?'原箱小口数':'原箱本来藏着';return `<div class="settlement-grid"><article><span>${mode==='drink'?'本局小口数':'你最终拿到'}</span>${api.art(g.result)}<strong>${escape(g.result.name)}</strong></article><article><span>${label}</span>${api.art(c.alternative)}<strong>${escape(c.alternative.name)}</strong></article></div>`;}
  function verdict(g){
    const c=g.comparison;
    if(g.mode==='drink')return c.kind==='skip'?'本局已跳过，不用喝。随时选择不参与，轻松玩就好。':c.verdict==='win'?'本局小口数更少。是否饮用由你决定，也可以跳过。':c.verdict==='loss'?'本局小口数更多。无需勉强，随时可以选择不喝。':'本局小口数相同。自愿参与，不想喝就不喝。';
    if(g.mode==='money')return c.verdict==='win'?'本局结果高于对比金额。':c.verdict==='loss'?'本局结果低于对比金额。':'本局结果与对比金额相同。';
    if(c.verdict==='loss')return c.kind==='keep'?'嘿嘿，刚才那口价你不收！这下俺的蜂蜜保住啦～':'嘿嘿，大礼物还躲在原箱里呢！这波俺的蜂蜜可省下来啦～';
    if(c.verdict==='win')return c.kind==='keep'?'哎呀！还好你没收那口价，俺这算盘算不过你啦！':'哎呀！你拿到的比原箱还值，俺的蜂蜜罐要空啦！';
    return '嘿嘿，这回不多不少！咱俩的算盘，算到一块儿去啦～';
  }
  function scrollSettlement(){
    if(!pendingSettlementScroll||latest?.phase!=='ended'||!latest.comparison||$('settlement').hidden)return;
    const blocking=document.querySelector('dialog[open]');
    if(blocking&&blocking!==$('resultDialog'))return;
    $('settlement').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    pendingSettlementScroll=false;
  }
  function showResult(){
    if(!latest?.comparison||latest.phase!=='ended'||document.querySelector('dialog[open]'))return;
    const g=latest,c=g.comparison,d=$('resultDialog');d.className='showtime-result is-'+(g.mode==='drink'?'even':c.verdict);
    $('resultTitle').textContent=g.mode==='drink'?(c.kind==='skip'?'本局已跳过，不用喝':'本局轻饮结果'):g.mode==='money'?(c.verdict==='win'?'本局金额更高':c.verdict==='loss'?'本局金额更低':'本局金额持平'):c.verdict==='loss'?'这波亏了，熊二笑了！':c.verdict==='win'?'漂亮！这局你赚了':'这一局，稳稳收下';
    $('resultTaunt').textContent=verdict(g);$('resultCompare').innerHTML=comparisonHTML(g);pendingResult=false;scrollSettlement();d.showModal();
  }
  function choose(action){if(locked||latest?.phase!=='final'||!playable())return;locked=true;$('keepFinal').disabled=$('swapFinal').disabled=true;api.decision(action);}
  function render(g){
    if(!api)return;latest=g;const final=g.phase==='final',ended=g.phase==='ended'&&g.comparison;
    const numeric=g.mode==='money'||g.mode==='drink',note=g.mode==='money'?'按金额比较 · 娱乐模拟':g.mode==='drink'?'按小口数比较，少口更有利 · 自愿参与，可随时跳过':'按默认礼物参考值比较 · 娱乐模拟';
    if($('settlementHeading'))$('settlementHeading').textContent=g.mode==='money'?'这一局，金额如何？':g.mode==='drink'?'本局轻饮结果':'这一局，到底赚没赚？';
    if($('settlementUnit'))$('settlementUnit').textContent=note;
    if($('resultUnit'))$('resultUnit').textContent=note;
    $('finalShowdown').hidden=!final;$('settlement').hidden=!ended;
    if(final){
      const other=g.boxes.findIndex((_,i)=>i!==g.selected&&!g.opened.includes(i));
      $('keepNumber').textContent=String(g.selected+1).padStart(2,'0');$('swapNumber').textContent=String(other+1).padStart(2,'0');
      if(playable())locked=false;
      $('keepFinal').disabled=$('swapFinal').disabled=!playable()||locked;
      $('duelHint').textContent=g.mode==='drink'?(playable()?'保留或换箱，也可以随时选择跳过、不喝。':'等待主播选择，也可以自愿跳过。'):playable()?'守住第一眼的直觉，还是换个命运？点选后立即开箱。':'等待主播决定：保留原箱，还是换成另一箱。';
      if(previous?.phase!=='final'){$('finalShowdown').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});moment('最后两箱 · 命运对决','保留，还是换箱？只此一次选择');}
    }
    if(ended){
      $('settlementCompare').innerHTML=comparisonHTML(g);$('settlementVerdict').textContent=verdict(g);
      const key=[g.gameId||'',g.round,g.selected,g.result.name,g.comparison.alternative.name,g.comparison.verdict].join(':');
      if(key!==shown){shown=key;pendingResult=true;pendingSettlementScroll=true;showResult();}
      scrollSettlement();
    }else{shown='';pendingResult=false;pendingSettlementScroll=false;if($('resultDialog').open)$('resultDialog').close();}
    if(!numeric&&previous&&g.round>previous.round&&g.opened.length>previous.opened.length){const index=g.opened[g.opened.length-1],gift=DreamEngine.GIFTS[g.boxes[index]];if(gift&&gift.score>=10001)moment(gift.name+' 出局！',gift.name==='嘉年华'?'终极大奖与这局告别了':'奖池变了，下一口价更关键');}
    if(g.phase==='select'){locked=false;clearTimeout(momentTimer);$('momentBanner').hidden=true;try{$('momentBanner').hidePopover?.();}catch{}}
    previous={phase:g.phase,round:g.round,opened:[...g.opened]};
  }
  window.Showtime={init(options){api=options;
    document.querySelector('.game-layout').insertAdjacentHTML('beforebegin',`<section id="finalShowdown" class="showtime-final" hidden aria-label="最后双箱对决"><h2>最后两箱 · 命运对决</h2><p id="duelHint"></p><div class="duel-boxes"><button id="keepFinal" class="duel-box" type="button"><span id="keepNumber" class="duel-number"></span><span class="duel-star">✦</span><strong>保留原箱</strong><small>相信直觉 · 立即开箱</small></button><button id="swapFinal" class="duel-box" type="button"><span id="swapNumber" class="duel-number"></span><span class="duel-star">✦</span><strong>换成另一箱</strong><small>换个命运 · 立即开箱</small></button></div></section>`);
    document.querySelector('.decision').insertAdjacentHTML('beforebegin',`<section id="settlement" class="showtime-settlement" hidden><div class="settlement-heading"><h2 id="settlementHeading">这一局，到底赚没赚？</h2><span id="settlementUnit">按默认礼物参考值比较</span></div><div id="settlementCompare"></div><p id="settlementVerdict" class="settlement-verdict"></p><button id="viewResult" class="secondary" type="button">再看熊二结算</button></section>`);
    document.body.insertAdjacentHTML('beforeend',`<dialog id="resultDialog" class="showtime-result" aria-labelledby="resultTitle"><button id="closeResult" class="showtime-close" aria-label="关闭结算弹窗" type="button">×</button><img class="showtime-bear" src="assets/bear-negotiator.png" alt="熊二的表情"><h2 id="resultTitle"></h2><p id="resultTaunt"></p><div id="resultCompare"></div><p id="resultUnit" class="comparison-note">按默认礼物参考值比较 · 娱乐模拟</p><button id="confirmResult" class="enamel" type="button">知道啦，收下本局结果</button></dialog><div id="momentBanner" class="moment-banner" role="status" popover="manual" hidden></div>`);
    $('keepFinal').onclick=()=>choose('reveal');$('swapFinal').onclick=()=>choose('swap');
    $('closeResult').onclick=$('confirmResult').onclick=()=>$('resultDialog').close();$('viewResult').onclick=showResult;
    document.addEventListener?.('close',e=>{queueMicrotask(()=>{if(e.target===$('resultDialog')&&latest?.phase==='ended'&&latest.comparison)pendingSettlementScroll=true;if(pendingResult)showResult();scrollSettlement();});},true);
  },render};
})();
