/* One dialog per pending offer. Private pricing controls stay in the owner's DOM. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let api,current=null,currentLine='',key='',dismissed=false,deciding=false,mode='';
  const role=()=>window.DreamRoom?.role||'solo';
  const canDecide=()=>['solo','player'].includes(role())&&(!window.DreamRoom||DreamRoom.canPlay());
  function restoreDesk(){const desk=$('ownerDesk'),container=$('quotePrivate');if(desk&&desk.parentNode===container)document.querySelector('.game-layout').before(desk);}
  function close(){if($('quoteDialog').open)$('quoteDialog').close();restoreDesk();}
  function dismiss(){dismissed=true;close();}
  function allowed(){return current?.phase==='offer'&&current.counterProposal?.status!=='pending'&&canDecide()&&!deciding;}
  function decide(action){if(!allowed())return;deciding=true;$('popupAccept').disabled=true;$('popupContinue').disabled=true;$('quotePending').textContent='正在同步你的决定…';api.decision(action);}
  function render(game,line=''){
    if(!api)return;current=game;currentLine=line;
    const edition=game.mode||'gift',drink=edition==='drink',money=edition==='money';
    const privateMode=role()==='host'&&game.phase==='pricing'&&!!$('ownerDesk');
    const publicMode=game.phase==='offer'&&!!game.offer;
    if(!privateMode&&!publicMode){key='';mode='';dismissed=false;deciding=false;$('viewQuote').hidden=true;close();return;}
    mode=privateMode?'private':'public';
    const nextKey=mode+':'+game.round+':'+(game.offer?.name||'');
    const changed=nextKey!==key;if(changed){key=nextKey;dismissed=false;deciding=false;}
    if(canDecide())deciding=false;
    $('viewQuote').hidden=false;$('viewQuote').textContent=privateMode?'打开报价台':'查看本轮报价';
    $('quoteDialog').classList.toggle('private-mode',privateMode);
    $('quotePublic').hidden=privateMode;$('quotePrivate').hidden=!privateMode;
    $('quoteDialogTitle').textContent=privateMode?(drink?'请给出一份自愿轻饮提案':money?'该你给玩家报金额了':'该你给主播报价了'):(drink?'熊二的轻饮提案':money?'熊二的本轮金额':'熊二的本轮报价');
    $('popupAccept').textContent=drink?'自愿接受 · 结束本局':money?'接受金额 · 本局成交':'接受报价 · 本局成交';
    $('popupContinue').textContent=drink?'暂不接受 · 继续开箱':money?'拒绝金额 · 继续开箱':'拒绝报价 · 继续追梦';
    $('popupAccept').hidden=privateMode||!['solo','player'].includes(role());
    $('popupContinue').hidden=$('popupAccept').hidden;
    $('popupAccept').disabled=!allowed();$('popupContinue').disabled=!allowed();
    $('quotePending').textContent=privateMode?'均价与四档候选仅房主可见，点一档即可发出。':!['solo','player'].includes(role())?'等待主播接受，或继续追梦。':canDecide()?'接受即终止本局；继续则放弃本轮报价。':'等待房主同步，连接恢复后即可决定。';
    if(drink)$('quotePending').textContent=privateMode?'小口数仅作游戏标记，请尊重玩家意愿；可随时跳过或用水替代。':!['solo','player'].includes(role())?'等待玩家自愿决定；也可跳过或用水替代。':canDecide()?'成年人自愿参与；可随时跳过，或用水等无酒精饮品替代。':'等待房主同步；无需饮用，可随时跳过。';
    else if(money)$('quotePending').textContent=privateMode?'均价与四档候选仅房主可见，金额仅作娱乐模拟。':!['solo','player'].includes(role())?'等待玩家接受金额，或继续开箱。':canDecide()?'接受即结束本局；继续则放弃本轮金额。仅作娱乐模拟。':'等待房主同步，连接恢复后即可决定。';
    if(game.counterProposal?.status==='pending')$('quotePending').textContent=role()==='host'?'玩家提出了组合要求，请查看并决定；原报价暂时保留。':'组合要求正在等待回复，可撤回后继续考虑原报价。';
    else if(game.counterProposal?.status==='accepted')$('quotePending').textContent='组合要求已被接受，这是一份新报价；仍需玩家确认成交。';
    else if(game.counterProposal?.status==='declined'&&game.phase==='offer')$('quotePending').textContent='熊二没有同意这份要求，原报价仍然有效；可接受或继续开箱。';
    if(publicMode){$('quoteBearLine').textContent=drink?'这是一份自愿提案，按自己的意愿选择就好；可以继续开箱，也可以跳过或用水替代。':line;$('quotePopupGift').innerHTML=api.art(game.offer)+`<strong>${game.offer.name}</strong>`;$('quoteAudience').textContent='第 '+(DreamEngine.QUOTE_ROUNDS.indexOf(game.round)+1)+' 次报价 · 已开 '+game.round+' 箱';}
    if(dismissed||$('modal').open||$('adminDialog')?.open||$('counterofferDialog')?.open){close();return;}
    if(privateMode)$('quotePrivate').appendChild($('ownerDesk'));else restoreDesk();
    if(!$('quoteDialog').open)$('quoteDialog').showModal();
    else if(changed)$('closeQuote').focus();
  }
  window.QuotePopup={
    init(options){api=options;
      $('closeQuote').onclick=dismiss;
      $('quoteDialog').oncancel=e=>{e.preventDefault();dismiss();};
      $('quoteDialog').onclose=()=>{if(!$('quoteDialog').open)restoreDesk();};
      $('popupAccept').onclick=()=>decide('accept');$('popupContinue').onclick=()=>decide('continue');
      $('viewQuote').onclick=()=>{dismissed=false;render(current,currentLine);};
    },render,pause:close
  };
})();
