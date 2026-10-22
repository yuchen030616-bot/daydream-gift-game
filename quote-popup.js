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
  function allowed(){return current?.phase==='offer'&&canDecide()&&!deciding;}
  function decide(action){if(!allowed())return;deciding=true;$('popupAccept').disabled=true;$('popupContinue').disabled=true;$('quotePending').textContent='正在同步你的决定…';api.decision(action);}
  function render(game,line=''){
    if(!api)return;current=game;currentLine=line;
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
    $('quoteDialogTitle').textContent=privateMode?'该你给主播报价了':'熊二的本轮报价';
    $('popupAccept').hidden=privateMode||!['solo','player'].includes(role());
    $('popupContinue').hidden=$('popupAccept').hidden;
    $('popupAccept').disabled=!allowed();$('popupContinue').disabled=!allowed();
    $('quotePending').textContent=privateMode?'均价与四档候选仅房主可见，点一档即可发出。':!['solo','player'].includes(role())?'等待主播接受，或继续追梦。':canDecide()?'接受即终止本局；继续则放弃本轮报价。':'等待房主同步，连接恢复后即可决定。';
    if(publicMode){$('quoteBearLine').textContent=line;$('quotePopupGift').innerHTML=api.art(game.offer)+`<strong>${game.offer.name}</strong>`;$('quoteAudience').textContent='第 '+(DreamEngine.QUOTE_ROUNDS.indexOf(game.round)+1)+' 次报价 · 已开 '+game.round+' 箱';}
    if(dismissed||$('modal').open){close();return;}
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
