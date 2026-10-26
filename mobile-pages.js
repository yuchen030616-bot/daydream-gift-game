/* Local phone navigation. It never changes room state or grants game authority. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),names={game:'游戏',room:'邀请房间',deal:'本轮报价',result:'本局结算',collection:'梦想礼物册',record:'追梦记录',settings:'设置',banter:'互动放话'};
 let api,current,page='room',lastGame='',lastPhase='',lastMode='',lastEvent='',lastRole='',lastShuffleActive=false,ready=false,media,moved=[],lobbyFirst=true;
 const enabled=()=>ready&&!!media?.matches;
 const role=()=>window.DreamRoom?.role||'solo';
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function remainingViews(){
  if(!current)return;
  const pool=current.gifts||current.pool||(typeof DreamEngine!=='undefined'?DreamEngine.GIFTS:[]);
  const opened=new Set((current.opened||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<9));
  // Read gift indices only for already-public opened boxes, never for unopened ones.
  const removed=new Set([...opened].map(box=>current.boxes?.[box]).filter(index=>Number.isInteger(index)&&index>=0&&index<pool.length));
  const left=pool.filter((_,index)=>!removed.has(index)),counts=new Map();
  for(const gift of left){const label=String(gift.name??'待同步');counts.set(label,(counts.get(label)||0)+1);}
  const numbers=Array.from({length:9},(_,i)=>i).filter(i=>!opened.has(i));
  const numeric=current.mode==='money'||current.mode==='drink';
  for(const prefix of ['mobileRemainingGame','mobileRemainingDeal','mobileRemainingQuote']){
   const node=$(prefix);if(!node)continue;
   $(prefix+'Title').textContent=(numeric?'剩余数值':'剩余礼物')+' '+numbers.length+' / 9';
   $(prefix+'Boxes').textContent='未开箱号：'+numbers.map(i=>String(i+1).padStart(2,'0')).join('、')+(Number.isInteger(current.selected)&&!opened.has(current.selected)?' · 保留 '+String(current.selected+1).padStart(2,'0')+' 号':'');
   const html=[...counts].map(([label,count])=>'<span class="mobile-remaining-item">'+safe(label)+(count>1?' <b>× '+count+'</b>':'')+'</span>').join('');if($(prefix+'Items').innerHTML!==html)$(prefix+'Items').innerHTML=html;
   node.hidden=current.phase==='ended';
  }
 }
 function groups(){
  const map={room:['#roomPanel'],game:['.stage','#finalShowdown'],deal:['.decision','#ownerDesk'],result:['#settlement'],collection:['.prize-panel'],record:['.right-column'],settings:['#modeSetup','#mobileUtility'],banter:['#theatreControls']};
  for(const [view,selectors]of Object.entries(map))for(const selector of selectors){const node=document.querySelector(selector);if(!node)continue;const views=selector==='.prize-panel'?['game','collection']:[view];node.dataset.mobileViews=views.join(' ');node.classList.toggle('mobile-page-off',enabled()&&!views.includes(page));}
  document.querySelector('.heading')?.classList.toggle('mobile-page-off',enabled());
 }
 function move(node,parent){if(!node||!parent)return;moved.push({node,parent:node.parentNode,next:node.nextSibling});parent.appendChild(node);}
 function layout(){
  document.body.classList.toggle('mobile-paged',enabled());
  if(enabled()&&!moved.length){const utility=$('mobileUtility');for(const node of [document.querySelector('.tools'),$('reset'),document.querySelector('.footer'),document.querySelector('.admin-foot')])move(node,utility);}
  if(!enabled()&&moved.length){for(const x of moved.slice().reverse()){if(x.next?.parentNode===x.parent)x.parent.insertBefore(x.node,x.next);else x.parent.appendChild(x.node);}moved=[];if($('mobileMenuDialog').open)$('mobileMenuDialog').close();}
  groups();remainingViews();
 }
 function refresh(full=true){
  if(!ready)return;document.body.dataset.mobilePage=page;$('mobilePageTitle').textContent=names[page];
  const busy=current?.stageEvent?.kind==='shuffle'&&current.stageEvent.active;
  for(const id of ['mobileTabRoom','mobileTabMy','mobileTabSettings'])$(id).disabled=!!busy;
  $('mobileTabGame').setAttribute('aria-current',['game','deal','result'].includes(page)?'page':'false');$('mobileTabRoom').setAttribute('aria-current',page==='room'?'page':'false');$('mobileTabSettings').setAttribute('aria-current',page==='settings'?'page':'false');
  $('mobileMenuName').textContent=($('roomMyName')?.textContent||'你的梦想空间').replace(/^我的昵称：/,'');
  for(const button of document.querySelectorAll('#mobileMenuDialog [data-mobile-page]')){button.disabled=button.dataset.mobilePage==='result'&&current?.phase!=='ended';button.setAttribute('aria-current',button.dataset.mobilePage===page?'page':'false');}
  for(const [target,source]of [['mobileMenuCounter','reconsiderQuote'],['mobileMenuReshuffle','askReshuffle'],['mobileMenuStart','openNumericStart']]){const original=source==='openNumericStart'&&(!$(source)||$(source).hidden)?$('readyPlayer'):$(source);$(target).hidden=!original||original.hidden;$(target).disabled=!original||original.disabled;$(target).textContent=original?.textContent||'';}
  const selected=current?.selected;$('mobileRoundInfo').textContent=selected==null?'先留下你的一只梦想箱':`保留 ${String(selected+1).padStart(2,'0')} 号 · 已开 ${current.round||0} / 7 箱`;
  const observer=role()==='watch';$('mobileRoleHint').hidden=!observer;$('mobileRoleHint').textContent='当前为围观席 · 空闲时点击申请上场；本局进行中请等待结束。';
  if(observer&&current?.phase==='ended')$('mobileRoleHint').textContent='本局已结束。可在结算页申请下一局开箱，房主同意后自动切换席位。';
  $('mobileMenuNextPlayer').hidden=role()==='solo'||current?.phase!=='ended';$('mobileSettingsNextPlayer').hidden=role()==='solo';
  $('mobileModeHint').textContent=['host','solo'].includes(role())?'切换主播版、普通版或喝酒版':'当前为'+(role()==='player'?(['money','drink'].includes(current?.mode)?'玩家':'主播')+'操作席':'围观席')+'，游戏模式由房主更换。';
  const numeric=current?.mode==='money'||current?.mode==='drink';$('mobileSetupSummary').textContent=numeric?(role()==='host'?'玩家点击开始后先提交九项数值，你可修改并最终确认；确认后双方直接洗牌。':'点击开始后，在弹窗选好九项数值；房主确认后直接洗牌进入游戏。'):'主播版使用九款梦想礼物，开箱、报价与结算都会自动切换。';$('mobileSettingsStart').hidden=!numeric||!$('openNumericStart')||$('openNumericStart').hidden;$('mobileSettingsStart').disabled=$('openNumericStart')?.disabled??true;
  $('mobileQuickQuote').textContent=['pricing','offer'].includes(current?.phase)?'查看本轮报价':'等待下一口价';
  $('mobileQuickQuote').disabled=!['pricing','offer'].includes(current?.phase);const more=$('mobileQuoteMore');more.hidden=!['player','solo'].includes(role())||current?.phase!=='offer';const gate=$('mobileStartGate'),start=$('openNumericStart')&&!$('openNumericStart').hidden?$('openNumericStart'):$('readyPlayer');gate.hidden=!start||start.hidden;gate.disabled=!start||start.disabled;gate.textContent=start?.textContent||'';
  if(full){groups();remainingViews();}
 }
 function set(view){if(!names[view])return false;page=view;refresh();return true;}
 function focus(view){if(!enabled())return false;if(view==='result'&&current?.phase!=='ended')return false;if(lobbyFirst&&['game','deal','result'].includes(view))return true;set(view);if($('mobileMenuDialog').open)$('mobileMenuDialog').close();return true;}
 function go(view){
  if(!ready||!names[view]||current?.stageEvent?.kind==='shuffle'&&current.stageEvent.active||view==='result'&&current?.phase!=='ended')return false;
  if(['game','deal','result'].includes(view))lobbyFirst=false;set(view);window.QuotePopup?.pause();if($('mobileMenuDialog').open)$('mobileMenuDialog').close();
  if(view==='room')$('roomPanel').hidden=false;
  if(view==='deal'&&!$('viewQuote').hidden)$('viewQuote').click();
  if(view==='result')$('viewResult')?.click();
  if(enabled()&&view==='game'&&current){window.PlayerStart?.render(current);window.NumericStart?.render(current);}
  if(!enabled()){
   if(view==='settings'&&window.GameModes?.openSwitcher){window.GameModes.openSwitcher();return true;}
   const target={room:'#roomPanel',game:current?.phase==='final'?'#finalShowdown':'.stage',deal:'.decision',result:'#settlement',collection:'.prize-panel',record:'.right-column',settings:current?.mode!=='gift'?'#modeSetup':'.tools',banter:'#theatreControls'}[view];
   document.querySelector(target)?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  return true;
 }
 function menu(){
  if(!ready||current?.stageEvent?.kind==='shuffle'&&current.stageEvent.active)return;
  window.QuotePopup?.pause();if(document.querySelector('dialog[open]:not(#mobileMenuDialog)'))return;refresh();$('mobileMenuDialog').showModal();$('mobileCloseMenu').focus();
 }
 function render(game){
  if(!ready||!game)return;current=game;const newGame=game.gameId!==lastGame,changed=game.phase!==lastPhase,newMode=(game.mode||'gift')!==lastMode,promoted=['host','watch'].includes(lastRole)&&role()==='player',becameHost=['watch','player'].includes(lastRole)&&role()==='host';
  if(enabled()){
   const event=game.stageEvent,shuffle=event?.kind==='shuffle'&&event.active&&event.id!==lastEvent,shuffleEnded=lastShuffleActive&&!(event?.kind==='shuffle'&&event.active);
   let target=null;
   if(shuffle||promoted){lobbyFirst=false;target='game';}
   else if(becameHost){lobbyFirst=false;target=game.phase==='ended'?'result':['pricing','offer'].includes(game.phase)?'deal':'game';}
   else if(shuffleEnded)target=['pricing','offer'].includes(game.phase)?'deal':game.phase==='ended'?'result':'game';
   else if(lobbyFirst)target='room';
   else if(newGame||changed){if(game.phase==='ended')target='result';else if(['pricing','offer'].includes(game.phase))target='deal';else if(newMode&&lastMode&&(game.mode||'gift')!=='gift'&&game.phase==='select')target='game';else if(!lastGame&&role()==='solo')target='room';else if(!(page==='settings'&&game.phase==='select'&&!newMode))target='game';}
   if(target){set(target);if($('mobileMenuDialog').open)$('mobileMenuDialog').close();}
   if(shuffle)lastEvent=event.id;
  }
  lastShuffleActive=game.stageEvent?.kind==='shuffle'&&game.stageEvent.active===true;lastGame=game.gameId;lastPhase=game.phase;lastMode=game.mode||'gift';lastRole=role();refresh();
 }
 window.MobilePages={enabled,focus,go,render,refreshControls:()=>refresh(false),get page(){return page},init(options){
  if(ready)return;api=options;media=matchMedia('(max-width:768px)');
  const summary=prefix=>`<section id="${prefix}" class="mobile-only mobile-remaining" aria-label="剩余礼物与未开箱号"><strong id="${prefix}Title"></strong><p id="${prefix}Boxes"></p><div id="${prefix}Items" class="mobile-remaining-items"></div></section>`;
  document.querySelector('.box-tray').insertAdjacentHTML('beforebegin',summary('mobileRemainingGame'));
  document.querySelector('.decision').insertAdjacentHTML('afterbegin',summary('mobileRemainingDeal'));
  const quotePublic=$('quotePublic');if(quotePublic)quotePublic.insertAdjacentHTML('beforebegin',summary('mobileRemainingQuote'));
  document.querySelector('.brand').insertAdjacentHTML('afterend','<strong id="mobilePageTitle" class="mobile-only">游戏</strong>');
  document.querySelector('.app').insertAdjacentHTML('beforeend','<section id="mobileUtility" class="panel mobile-only"><h2>游戏设置</h2><p>工具、玩法与本机管理</p><p id="mobileSetupSummary"></p><button id="mobileSettingsStart" class="secondary" type="button" hidden>设置本局数值</button></section>');
  $('mobileUtility').insertAdjacentHTML('afterbegin','<button id="mobileModeSwitch" class="secondary" type="button">更换游戏模式</button><p id="mobileModeHint"></p>');
  $('mobileUtility').insertAdjacentHTML('beforeend','<button id="mobileSettingsNextPlayer" class="secondary" type="button" hidden>下一位开箱玩家 · 席位管理</button>');
  $('joinArea').insertAdjacentHTML('afterend','<div id="roomModeFlow" class="mobile-only"><button id="roomModeSwitch" class="secondary" type="button">选择游戏模式</button><button id="roomEnterGame" class="enamel" type="button">进入游戏 →</button></div>');
  $('roomModeSwitch').onclick=()=>window.GameModes?.openSwitcher();
  $('roomEnterGame').onclick=()=>go(current?.phase==='ended'?'result':['pricing','offer'].includes(current?.phase)?'deal':'game');
  document.querySelector('.box-tray').insertAdjacentHTML('beforebegin','<p id="mobileRoundInfo" class="mobile-only"></p><button id="mobileStartGate" class="mobile-only enamel" type="button" hidden></button>');
  $('mobileStartGate').insertAdjacentHTML('beforebegin','<p id="mobileRoleHint" class="mobile-only" hidden></p>');
  document.querySelector('.stage').insertAdjacentHTML('beforeend','<div id="mobileGameActions" class="mobile-only"><button id="mobileQuickQuote" class="secondary" type="button">查看本轮报价</button><button id="mobileQuickMenu" class="secondary" type="button">我的目录</button></div>');
  document.querySelector('.quote-popup-actions').insertAdjacentHTML('afterend','<button id="mobileQuoteMore" class="mobile-only secondary" type="button">更多谈判 · 再谈谈 / 洗牌</button>');
  $('settlement').insertAdjacentHTML('afterbegin','<img class="mobile-result-bear mobile-only" src="assets/bear-negotiator.png" alt="熊二陪你看结算">');
  $('settlement').insertAdjacentHTML('beforeend','<div id="mobileResultActions" class="mobile-only"><button id="mobileResultMenu" class="secondary" type="button">我的 · 更多玩法</button></div>');
  document.body.insertAdjacentHTML('beforeend','<nav id="mobileBottomNav" class="mobile-only" aria-label="手机底部导航"><button id="mobileTabGame" type="button"><span aria-hidden="true">▦</span>游戏</button><button id="mobileTabRoom" type="button"><span aria-hidden="true">⌂</span>房间</button><button id="mobileTabMy" type="button" aria-haspopup="dialog" aria-controls="mobileMenuDialog"><span aria-hidden="true">♙</span>我的</button><button id="mobileTabSettings" type="button"><span aria-hidden="true">⚙</span>设置</button></nav><dialog id="mobileMenuDialog" class="mobile-menu-dialog" aria-labelledby="mobileMenuTitle"><button id="mobileCloseMenu" class="mobile-menu-close" type="button" aria-label="关闭我的目录">×</button><span class="eyebrow">MY DREAM SPACE</span><h2 id="mobileMenuTitle">我的梦想目录</h2><p id="mobileMenuName"></p><div class="mobile-menu-grid"><button type="button" data-mobile-page="deal">本轮报价<span>接受或继续</span></button><button type="button" data-mobile-page="result">本局结算<span>结束自动直达</span></button><button type="button" data-mobile-page="collection">梦想礼物册<span>看看还有哪些</span></button><button type="button" data-mobile-page="record">追梦记录<span>我的保留箱</span></button><button type="button" data-mobile-page="banter">互动放话<span>跟熊二过过招</span></button><button type="button" data-mobile-page="settings">游戏设置<span>数值与工具</span></button></div><div class="mobile-menu-requests"><button id="mobileMenuStart" type="button" hidden></button><button id="mobileMenuCounter" type="button" hidden></button><button id="mobileMenuReshuffle" type="button" hidden></button></div></dialog>');
  $('mobileQuoteMore').onclick=menu;
  $('mobileMenuReshuffle').parentNode.insertAdjacentHTML('beforeend','<button id="mobileMenuNextPlayer" type="button" hidden>下一位开箱 · 申请与审核</button>');
  $('mobileMenuNextPlayer').onclick=()=>{$('mobileMenuDialog').close();window.SeatSwitch?.open();};
  $('mobileMenuNextPlayer').parentNode.insertAdjacentHTML('beforeend','<button id="mobileMenuSeries" type="button">计分对战 · 连续场次与门票</button>');
  $('mobileMenuSeries').onclick=()=>{$('mobileMenuDialog').close();window.SeriesBoard?.open();};
  $('mobileSettingsNextPlayer').onclick=()=>window.SeatSwitch?.open();
  $('mobileTabGame').onclick=()=>go(current?.phase==='ended'?'result':['pricing','offer'].includes(current?.phase)?'deal':'game');$('mobileTabRoom').onclick=()=>go('room');$('mobileTabMy').onclick=$('mobileQuickMenu').onclick=$('mobileResultMenu').onclick=menu;$('mobileTabSettings').onclick=()=>go('settings');$('mobileQuickQuote').onclick=()=>go('deal');
  $('mobileCloseMenu').onclick=()=>$('mobileMenuDialog').close();$('mobileMenuDialog').oncancel=e=>{e.preventDefault();$('mobileMenuDialog').close();};
  for(const b of document.querySelectorAll('#mobileMenuDialog [data-mobile-page]'))b.onclick=()=>go(b.dataset.mobilePage);
  for(const [target,source]of [['mobileMenuCounter','reconsiderQuote'],['mobileMenuReshuffle','askReshuffle'],['mobileMenuStart','openNumericStart']])$(target).onclick=()=>{const button=source==='openNumericStart'&&(!$(source)||$(source).hidden)?$('readyPlayer'):$(source);if(!button||button.hidden||button.disabled)return;$('mobileMenuDialog').close();button.click();};
  $('mobileSettingsStart').onclick=()=>{const original=$('openNumericStart');if(original&&!original.hidden&&!original.disabled)original.click();};
  $('mobileModeSwitch').onclick=()=>window.GameModes?.openSwitcher();
  $('mobileStartGate').onclick=()=>{const original=$('openNumericStart')&&!$('openNumericStart').hidden?$('openNumericStart'):$('readyPlayer');if(original&&!original.hidden&&!original.disabled)original.click();};
  $('soloMode').addEventListener('click',()=>go('game'));
  $('mobileUtility').addEventListener('click',e=>{if(e.target.closest?.('#reset,#rules,#adminEntry'))window.QuotePopup?.pause();});
  ready=true;layout();media.addEventListener?.('change',()=>{layout();if(api.getGame())render(api.getGame());});
 }};
})();
