/* Presentation only: card truth, turns and permissions belong to the controller. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const suits={S:'♠',H:'♥',D:'♦',C:'♣','♠':'♠','♥':'♥','♦':'♦','♣':'♣',spades:'♠',hearts:'♥',diamonds:'♦',clubs:'♣'};
  let controller,view=null,busy=false,error='',localPanel='',previousScreen='',resultSeen='',dismissedResult='',initialized=false,inspectedSeat='',focusRound='',lastActive='';
  const handKeys=new Map();
  const roleLabel=role=>({host:'房主 · 庄家',player:'对战玩家',watch:'围观席',solo:'单人练习'})[role]||'准备入场';
  const reasons={player_bust:'玩家超过21点，庄家拿下本局。',dealer_bust:'庄家超过21点，玩家拿下本局。',player_blackjack:'玩家起手天然21点，漂亮地拿下本局。',dealer_blackjack:'庄家起手天然21点，拿下本局。',both_blackjack:'双方都是天然21点，这局握手言和。',higher_total:'点数更接近21的一方，拿下本局。',equal_total:'双方点数相同，这局不分高下。'};
  const nameOf=(side,fallback)=>typeof side?.name==='string'&&side.name.trim()?side.name:fallback;
  const isHost=()=>view?.role==='host'||view?.role==='solo';
  const isPlayer=()=>view?.role==='player'||view?.role==='solo';
  const online=()=>view?.mode!=='online'||view?.connected!==false;
  const actionable=()=>!busy&&online();
  const permitted=(key,fallback)=>typeof view?.game?.[key]==='boolean'?view.game[key]:fallback;
  const safeNumber=value=>Number.isFinite(Number(value))?Number(value):0;
  const signed=value=>{const n=safeNumber(value);return(n>0?'+':'')+n;};
  const seatIds=['s1','s2','s3','s4'];
  const seatNumber=id=>String(id||'s1').replace(/^s/,'');
  function playersOf(game=view?.game||{}){return Array.isArray(game.players)?game.players:game.player?[{id:'s1',...game.player,owned:isPlayer(),active:game.phase==='player',netScore:game.scores?.player||0}]:[];}
  function seatsOf(){return seatIds.map(id=>{const seat=(view?.seats||[]).find(s=>s.id===id),hand=playersOf().find(p=>p.id===id);return seat||{id,name:hand?.name||'',owned:!!hand?.owned,occupied:!!hand,online:true,canClaim:false,canRelease:false};});}
  function activeId(game=view?.game||{}){return game.activeSeat||playersOf(game).find(p=>p.active)?.id||(game.phase==='player'?playersOf(game)[0]?.id:null);}
  function inspectedHand(game=view?.game||{}){const slot=seatsOf().find(s=>s.id===inspectedSeat);return playersOf(game).find(p=>p.id===inspectedSeat)||{id:inspectedSeat||'s1',name:slot?.name||'等待入座',cards:[],score:null,owned:!!slot?.owned};}
  function syncInspection(game){const round=[view.roomId||view.roomCode||view.mode,game.round].join(':'),active=activeId(game),hands=playersOf(game);if(round!==focusRound){focusRound=round;inspectedSeat=active||hands[0]?.id||seatsOf().find(s=>s.occupied)?.id||'s1';lastActive=active;}else if(active&&active!==lastActive){inspectedSeat=active;lastActive=active;}if(!seatIds.includes(inspectedSeat))inspectedSeat='s1';}
  function selectSeat(id){if(!seatIds.includes(id))return;inspectedSeat=id;render();}
  function text(id,value){const node=$(id);if(node&&node.textContent!==String(value??''))node.textContent=String(value??'');}
  function show(id,visible){if($(id))$(id).hidden=!visible;}
  function enable(id,enabled){if($(id))$(id).disabled=!enabled;}
  function label(id,value){const n=$(id);if(!n)return;n.classList.toggle('is-error',!!error);text(id,value);}
  function setError(message){error=message||'这次操作未能完成，请稍后重试。';render();}
  async function invoke(method,...args){
    if(!controller||busy)return false;busy=true;error='';render();
    try{if(typeof controller[method]!=='function')throw Error('功能正在准备，请稍候重试。');const ok=await controller[method](...args);if(ok===false)throw Error(view?.status||'当前无法完成，请等待房间同步后重试。');return true;}
    catch(e){error=e?.message||'操作未成功，请稍后重试。';if(method==='copyInvite'&&$('bjInviteLinks'))$('bjInviteLinks').open=true;return false;}
    finally{busy=false;render();}
  }
  async function entry(method){
    if(!controller||busy)return;const name=$('bjName').value.trim();
    if(!name){setError('先填一个昵称，大家才好认出你。');$('bjName').focus();return;}
    if(name.length>16){setError('昵称最多16个字符。');return;}
    const code=$('bjJoinCode').value.trim();if(method==='joinRoom'&&!/^\d{4}$/.test(code)){setError('请输入完整的4位数字房间码。');$('bjJoinCode').focus();return;}
    busy=true;error='';render();
    try{if(await controller.setName(name)===false)throw Error(view?.status||'昵称未能保存，请重试。');if(method&&typeof controller[method]==='function'){const ok=await controller[method](...(method==='joinRoom'?[code]:[]));if(ok===false)throw Error(view?.status||'当前无法进入，请等待连接恢复后重试。');}}
    catch(e){error=e?.message||'未能进入牌桌，请重试。';}
    finally{busy=false;render();}
  }
  function handValue(hand){if(hand?.score===null||hand?.score===undefined)return'暗';const score=safeNumber(hand.score);return String(score);}
  function cards(target,cards){
    const area=$(target),list=Array.isArray(cards)?cards:[],key=JSON.stringify(list);if(handKeys.get(target)===key)return;handKeys.set(target,key);area.replaceChildren();
    if(!list.length){for(let n=0;n<2;n++){const empty=document.createElement('span');empty.className='bj-card-placeholder';empty.setAttribute('aria-hidden','true');empty.textContent='✦';area.append(empty);}return;}
    list.forEach((card,index)=>{
      const node=document.createElement('article');node.className='bj-card';node.style.animationDelay=Math.min(index,3)*25+'ms';
      if(!card||card.hidden){node.classList.add('is-hidden');node.setAttribute('aria-label','庄家暗牌');const back=document.createElement('span');back.className='bj-card-back';back.setAttribute('aria-hidden','true');back.textContent='✦';node.append(back);}
      else{const suit=suits[card.suit]||'♠',rank=String(card.rank??card.value??'?').slice(0,3);if(suit==='♥'||suit==='♦')node.classList.add('is-red');node.setAttribute('aria-label',suit+' '+rank);for(const bottom of [false,true]){const corner=document.createElement('span');corner.className='bj-card-corner'+(bottom?' is-bottom':'');corner.setAttribute('aria-hidden','true');corner.append(document.createTextNode(rank));const small=document.createElement('small');small.textContent=suit;corner.append(small);node.append(corner);}const pip=document.createElement('span');pip.className='bj-card-pip';pip.setAttribute('aria-hidden','true');pip.textContent=suit;node.append(pip);}
      area.append(node);
    });
  }
  function score(id,hand){const node=$(id);node.replaceChildren(document.createTextNode(handValue(hand)));const unit=document.createElement('small');unit.textContent=hand?.score===null?'牌':'点';node.append(unit);node.classList.toggle('is-bust',!!hand?.bust);node.classList.toggle('is-natural',!!hand?.natural);}
  function renderMembers(){
    const list=Array.isArray(view.members)?view.members:[],target=$('bjMembers'),key=JSON.stringify(list);text('bjMemberCount',list.length+' 人');
    if(target.dataset.key===key)return;target.dataset.key=key;target.replaceChildren();
    if(!list.length){const empty=document.createElement('p');empty.className='bj-empty-members';empty.textContent='朋友入座后，会出现在这里。';target.append(empty);return;}
    list.forEach(member=>{const row=document.createElement('div');row.className='bj-member';const name=document.createElement('span');name.className='bj-member-name';const symbol=document.createElement('span');symbol.className='bj-member-symbol';symbol.setAttribute('aria-hidden','true');symbol.textContent=member.role==='host'?'♠':member.role==='player'?'♥':'✦';name.append(symbol,document.createTextNode(member.name||'朋友'));const role=document.createElement('span');role.className='bj-member-role';role.textContent=roleLabel(member.role);row.append(name,role);target.append(row);});
  }
  function renderRoomSeats(){
    const seats=seatsOf(),grid=$('bjSeatGrid'),key=JSON.stringify([seats,busy,online(),view.role,view.game?.phase]);text('bjSeatCount',seats.filter(s=>s.occupied).length+' / 4 席');
    text('bjSeatHelp',view.game?.phase==='player'||view.game?.phase==='dealer'?'本局已锁定 · 结算后可调整席位':view.role==='host'?'你固定担任庄家；朋友可各领一席，也可一人兼多席。':'点空位入座 · 一人可兼多席');
    if(grid.dataset.key===key)return;grid.dataset.key=key;grid.replaceChildren();
    seats.forEach(seat=>{const card=document.createElement('article');card.className='bj-room-seat'+(seat.owned?' is-owned':'')+(!seat.occupied?' is-empty':'');const head=document.createElement('div');head.className='bj-room-seat-head';const number=document.createElement('b');number.textContent='第'+seatNumber(seat.id)+'席';const badge=document.createElement('span');badge.textContent=seat.owned?'我的席位':seat.occupied?(seat.online===false?'暂时离线':'已入座'):'空席';head.append(number,badge);const name=document.createElement('strong');name.className='bj-room-seat-name';name.textContent=seat.occupied?seat.name||'牌友':'等你入座';card.append(head,name);
      if(seat.canClaim||seat.canRelease){const action=document.createElement('button');action.type='button';action.textContent=seat.canRelease?(view.role==='host'&&!seat.owned?'释放离线席':'退出本席'):seats.some(s=>s.owned)?'再领这一席 ＋':'入座这一席 ＋';action.disabled=!actionable();action.onclick=()=>invoke(seat.canRelease?'releaseSeat':'claimSeat',seat.id);card.append(action);}else{const state=document.createElement('small');state.textContent=seat.occupied?(seat.owned?'本局锁定 · 下一局可调整':'每手独立计分'):view.role==='host'?'由朋友认领':'等待下一局开放';card.append(state);}grid.append(card);
    });
  }
  function renderSeatTabs(game){
    const tabs=$('bjSeatTabs'),players=playersOf(game),active=activeId(game),seats=seatsOf(),key=JSON.stringify([players.map(p=>({id:p.id,name:p.name,score:p.score,bust:p.bust,natural:p.natural,done:p.done,owned:p.owned,netScore:p.netScore})),active,inspectedSeat,seats.map(s=>({id:s.id,occupied:s.occupied,name:s.name,owned:s.owned})),game.scores?.bySeat]);if(tabs.dataset.key===key)return;tabs.dataset.key=key;tabs.replaceChildren();
    seats.forEach(seat=>{const hand=players.find(p=>p.id===seat.id),occupied=!!hand||seat.occupied,button=document.createElement('button');button.type='button';button.className='bj-seat-tab'+(seat.id===active?' is-active-turn':'')+(seat.id===inspectedSeat?' is-inspected':'')+(hand?.owned||seat.owned?' is-owned':'');button.setAttribute('role','tab');button.setAttribute('aria-selected',String(seat.id===inspectedSeat));button.disabled=!occupied;const label=document.createElement('span');label.className='bj-seat-tab-label';label.textContent=seatNumber(seat.id)+'席'+(hand?.owned||seat.owned?' · 我':'');const total=document.createElement('strong');total.textContent=!occupied?'—':hand?.bust?'爆牌':hand?.score===null||hand?.score===undefined?'待发':String(hand.score);const name=document.createElement('span');name.className='bj-seat-tab-name';name.textContent=hand?.name||seat.name||'空席';const state=document.createElement('small'),points=safeNumber(hand?.netScore??game.scores?.bySeat?.[seat.id]);state.textContent=!occupied?'可到房间入座':seat.id===active?'行动中':hand?.natural?'天然21':hand?.done?'已停牌 · '+signed(points):signed(points)+' 分';button.setAttribute('aria-label','第'+seatNumber(seat.id)+'席，'+name.textContent+'，'+total.textContent+'，'+state.textContent);button.append(label,total,name,state);button.onclick=()=>selectSeat(seat.id);tabs.append(button);});
  }
  function turnCopy(game){
    if(!online())return'连接恢复后，继续这一局';
    if(game.phase==='idle')return'准备好了，就让牌说话';
    if(game.phase==='ended')return'本局已结束，牌桌记得每一次选择';
    if(game.phase==='dealer')return view.role==='solo'?'熊二回合 · 正在按规则补牌':isHost()?'庄家回合 · 按规则完成补牌':'庄家回合 · 等待揭晓';
    const active=playersOf(game).find(p=>p.id===activeId(game));return active?.owned?'轮到你：第'+seatNumber(active.id)+'席 · 要牌还是停牌？':'第'+seatNumber(activeId(game))+'席回合 · 等待对方决定';
  }
  function renderActions(game){
    const phase=game.phase||'idle',active=playersOf(game).find(p=>p.id===activeId(game)),ownTurn=phase==='player'&&!!active?.owned,playerTurn=ownTurn&&inspectedSeat===active.id,dealerTurn=phase==='dealer'&&isHost();
    show('bjReturnActive',ownTurn&&!playerTurn);enable('bjReturnActive',!busy);text('bjReturnActive','轮到你：回第'+seatNumber(active?.id)+'席操作 →');
    show('bjHit',playerTurn);show('bjStand',playerTurn);enable('bjHit',playerTurn&&actionable()&&permitted('canHit',true));enable('bjStand',playerTurn&&actionable()&&permitted('canStand',true));
    show('bjDealerStep',dealerTurn&&view.role!=='solo');enable('bjDealerStep',dealerTurn&&actionable()&&permitted('canDealerStep',true));text('bjDealerStep',safeNumber(game.dealer?.score)>=17?'停牌 · 完成庄家回合 →':'按规则补牌 →');$('bjDealerStep').classList.add('is-full');
    const idle=phase==='idle'&&isHost();show('bjGameStart',idle);enable('bjGameStart',idle&&actionable()&&permitted('canStart',view.mode!=='online'||(view.members||[]).some(m=>m.role==='player')));$('bjGameStart').classList.add('is-full');
    show('bjNext',phase==='ended'&&isHost());enable('bjNext',phase==='ended'&&isHost()&&actionable()&&permitted('canNext',true));show('bjViewResult',phase==='ended');enable('bjViewResult',true);
    let hint=!online()?'当前连接中断，恢复后即可继续。':busy?'正在同步你的操作…':playerTurn?'轮到你：第'+seatNumber(active.id)+'席 · 只操作这一手。':ownTurn?'正在查看第'+seatNumber(inspectedSeat)+'席，点上方返回你的行动席。':dealerTurn?'16点及以下补牌，17点及以上停牌。':phase==='dealer'?'等待庄家按规则完成本局。':phase==='idle'?view.role==='watch'?'先在房间选空席，或留在这里围观。':isHost()?'朋友入座后，由你发牌开始。':'等待房主发牌，即可开始对战。':phase==='ended'?isHost()?'可以继续发牌，或到房间调整下局席位。':'等待房主发牌；也可到房间调整下局席位。':view.role==='watch'?'围观中 · 第'+seatNumber(activeId(game))+'席正在决定。':'等待第'+seatNumber(activeId(game))+'席玩家决定。';
    if(view.role==='solo'&&phase==='idle')hint='熊二已经准备好了，发牌吧。';if(view.role==='solo'&&phase==='dealer')hint='熊二正在按规则补牌，稍候揭晓。';text('bjActionHint',hint);
  }
  function resultKey(){return view?.game?.phase==='ended'?JSON.stringify([view.game.round,view.game.result]):'';}
  function fillResult(){
    const game=view.game||{},result=game.result||{},hands=Array.isArray(result.hands)?result.hands:null;let won=null;$('bjResultDialog').classList.toggle('is-multi',!!hands);
    text('bjResultRound','ROUND '+String(game.round||1).padStart(2,'0')+' · FINISHED');text('bjResultDealerName',nameOf(game.dealer,'庄家'));text('bjResultDealerScore',game.dealer?.bust?'爆牌':handValue(game.dealer)+'点');text('bjResultDealerDelta',signed(result.dealerDelta)+' 分');$('bjResultDealerDelta').classList.toggle('is-positive',result.dealerDelta>0);
    if(hands){
      const owned=new Set(playersOf(game).filter(p=>p.owned).map(p=>p.id)),ownHands=hands.filter(h=>owned.has(h.id)),playerDelta=hands.reduce((sum,h)=>sum+safeNumber(h.playerDelta),0),ownDelta=ownHands.reduce((sum,h)=>sum+safeNumber(h.playerDelta),0),mine=view.role==='host'?safeNumber(result.dealerDelta):ownDelta,participated=view.role==='host'||ownHands.length>0;
      won=participated?(mine===0?null:mine>0):null;text('bjResultTitle',!participated?'本局结果已揭晓。':mine===0?'这一轮，不赚不赔。':mine>0?'这一轮，拿下'+mine+'分！':'下一轮，再较量。');text('bjResultReason','每个玩家席独立与庄家比较，本局共结算'+hands.length+'手。');text('bjResultPlayerName',ownHands.length?'我的本局合计':'玩家本局合计');text('bjResultPlayerScore',signed(ownHands.length?ownDelta:playerDelta));text('bjResultPlayerDelta',(ownHands.length?'兼任 '+ownHands.length+' 席':'共 '+hands.length+' 手')+' · 娱乐积分');$('bjResultPlayerDelta').classList.toggle('is-positive',(ownHands.length?ownDelta:playerDelta)>0);
      const list=$('bjResultHands'),key=JSON.stringify(hands);show('bjResultHands',true);if(list.dataset.key!==key){list.dataset.key=key;list.replaceChildren();hands.forEach(hand=>{const row=document.createElement('article');row.className='bj-result-seat';const name=document.createElement('div');const strong=document.createElement('strong');strong.textContent='第'+seatNumber(hand.id)+'席 · '+(hand.name||'玩家');const detail=document.createElement('small');detail.textContent=(hand.playerTotal>21?'爆牌':hand.playerTotal+'点')+' / 庄家'+(hand.dealerTotal>21?'爆牌':hand.dealerTotal+'点');name.append(strong,detail);const outcome=document.createElement('span');outcome.className='bj-result-seat-outcome '+(hand.winner==='player'?'is-win':hand.winner==='dealer'?'is-loss':'is-push');outcome.textContent=hand.winner==='player'?'赢':hand.winner==='dealer'?'输':'平';const delta=document.createElement('b');delta.className=hand.playerDelta>0?'is-positive':'';delta.textContent=signed(hand.playerDelta)+'分';row.append(name,outcome,delta);list.append(row);});}
    }else{
      const winner=result.winner,localPlayer=view.role!=='host';won=winner==='push'?null:localPlayer?winner==='player':winner==='dealer';text('bjResultTitle',winner==='push'?'不分高下。':view.role==='watch'?(winner==='player'?'玩家拿下这一局。':'庄家拿下这一局。'):won?'这一局，漂亮！':'下一局，再较量。');text('bjResultReason',reasons[result.reason]||result.reason||'本局积分已记入牌桌。');text('bjResultPlayerName',nameOf(game.player,'玩家'));text('bjResultPlayerScore',game.player?.bust?'爆牌':handValue(game.player)+'点');text('bjResultPlayerDelta',signed(result.playerDelta)+' 分');$('bjResultPlayerDelta').classList.toggle('is-positive',result.playerDelta>0);show('bjResultHands',false);
    }
    $('bjResultDialog').dataset.outcome=won===null?'push':won?'win':'loss';
    show('bjResultNext',isHost());enable('bjResultNext',isHost()&&actionable()&&permitted('canNext',true));show('bjResultWait',!isHost());
  }
  function openResult(force=false){const key=resultKey();if(!key)return;fillResult();if(!force&&dismissedResult===key)return;if($('bjRulesDialog').open)return;if(!$('bjResultDialog').open){$('bjResultDialog').showModal();$('bjCloseResult').focus();}resultSeen=key;}
  function closeResult(){dismissedResult=resultKey();if($('bjResultDialog').open)$('bjResultDialog').close();}
  function render(){
    if(!view)return;
    const incoming=view.screen||'entry',game=view.game||{phase:'idle',player:{cards:[]},dealer:{cards:[]},scores:{player:0,dealer:0}};
    syncInspection(game);const player=inspectedHand(game),solo=view.mode==='solo';
    if(incoming!==previousScreen){localPanel='';previousScreen=incoming;}
    const screen=localPanel||(incoming==='result'?'game':incoming);
    document.body.dataset.bjScreen=screen;show('bjEntry',screen==='entry');show('bjRoom',screen==='room');show('bjGame',screen==='game');
    const invited=!!view.pendingInvite&&screen==='entry';show('bjInviteNotice',invited);show('bjAcceptInvite',invited);show('bjEntryChoices',!invited);
    for(const id of ['bjCreate','bjSolo','bjJoin','bjAcceptInvite'])enable(id,!busy);
    if(!$('bjName').value&&view.name)$('bjName').value=view.name;
    label('bjEntryStatus',error||view.status||'');label('bjRoomStatus',error||view.status||'');label('bjGameStatus',error||'');
    $('bjRoom').classList.toggle('is-seat-picker',view.role!=='host');text('bjRoomTitle',solo?'选好席位，开一局。':'牌桌准备好了。');show('bjRoomCodeCard',!solo);show('bjShareGrid',view.role==='host');show('bjRoomMembers',!solo);show('bjConnection',!solo);text('bjCode',view.roomCode||'— — — —');text('bjMyName','我的昵称：'+(view.name||'朋友'));text('bjMyRole',roleLabel(view.role));text('bjConnection',view.connected?'已连接':'连接中');$('bjConnection').classList.toggle('is-connected',!!view.connected);
    const host=isHost(),active=game.phase!=='idle',canPrepare=['idle','ended'].includes(game.phase);show('bjCopyPlayer',view.role==='host');show('bjCopyWatch',view.role==='host');enable('bjCopyPlayer',actionable());enable('bjCopyWatch',actionable());show('bjInviteLinks',view.role==='host'&&!!view.invites);for(const[k,id]of [['player','bjPlayerLink'],['watch','bjWatchLink']])if($(id).value!==(view.invites?.[k]||''))$(id).value=view.invites?.[k]||'';show('bjStart',host&&canPrepare);text('bjStart',game.phase==='ended'?'确认席位 · 发下一局 →':'发牌 · 开始第一局 →');enable('bjStart',host&&actionable()&&permitted(game.phase==='ended'?'canNext':'canStart',view.mode!=='online'||(view.members||[]).some(m=>m.role==='player')));show('bjEnterTable',active||!host);show('bjReconnect',view.mode==='online');enable('bjReconnect',!busy);enable('bjLeaveRoom',!busy);renderRoomSeats();renderMembers();
    text('bjRound','ROUND '+String(game.round||1).padStart(2,'0'));text('bjGameRole',roleLabel(view.role));show('bjOpenRoom',view.mode==='online'||solo);text('bjOpenRoom',solo?'席位 ↗':'房间 ↗');text('bjDealerName',nameOf(game.dealer,'熊二'));text('bjPlayerSeatLabel','第'+seatNumber(inspectedSeat)+'席'+(player.owned?' · 我的手牌':' · 查看手牌'));text('bjPlayerName',nameOf(player,view.name||'玩家'));score('bjDealerScore',game.dealer);score('bjPlayerScore',player);cards('bjDealerCards',game.dealer?.cards);cards('bjPlayerCards',player.cards);renderSeatTabs(game);text('bjTurnText',turnCopy(game));
    text('bjDealerNote',game.dealer?.bust?'庄家爆牌':game.dealer?.natural?'天然21点 · Blackjack':game.dealer?.score===null?'暗牌尚未揭晓 · 当前只显示明牌':game.phase==='idle'?'17点及以上停牌，含软17':game.dealer?.soft?'含A的软点数 · A可作1或11':'庄家按固定规则补牌');
    text('bjPlayerNote',player.bust?'超过21点 · 本手爆牌':player.natural?'天然21点 · Blackjack':player.soft?'含A的软点数 · A可作1或11':Array.isArray(player.cards)&&player.cards.length>4?'左右滑动查看全部手牌':player.done?'本手已停牌，等待庄家结算':'靠近21，别越过它');
    const showMine=view.role!=='host'&&Number.isFinite(game.myScore)&&(isPlayer()||game.myScore!==0);text('bjDealerScoreName',nameOf(game.dealer,'庄家')+'累计');text('bjPlayerScoreName',showMine?'我的合计':'玩家合计');text('bjDealerLedger',signed(game.scores?.dealer));text('bjPlayerLedger',signed(showMine?game.myScore:game.scores?.player));renderActions(game);
    if(game.phase!=='ended'&&$('bjResultDialog').open)$('bjResultDialog').close();
    if(game.phase==='ended'&&(screen==='game'||incoming==='result')){fillResult();if(resultKey()!==resultSeen)openResult();}
  }
  function receive(next){view=next||{};render();}
  function showPanel(panel){if(!view||view.screen==='entry')return;localPanel=panel;render();}
  root.BlackjackUI={init(nextController){
    if(initialized)return;initialized=true;controller=nextController;
    try{const saved=localStorage.getItem('daydream.nickname');let value=saved;try{value=JSON.parse(saved);}catch{}$('bjName').value=typeof value==='string'?value:'';}catch{}
    $('bjCreate').onclick=()=>entry('createRoom');$('bjSolo').onclick=()=>entry('solo');$('bjJoin').onclick=()=>entry('joinRoom');$('bjAcceptInvite').onclick=()=>entry(null);$('bjJoinCode').oninput=()=>{$('bjJoinCode').value=$('bjJoinCode').value.replace(/\D/g,'').slice(0,4);};$('bjJoinCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();entry('joinRoom');}};
    for(const[id,method]of [['bjGameStart','start'],['bjDealerStep','dealerStep'],['bjNext','next'],['bjReconnect','reconnect'],['bjLeaveRoom','leave']])$(id).onclick=()=>invoke(method);
    $('bjStart').onclick=()=>invoke(view?.game?.phase==='ended'?'next':'start');$('bjHit').onclick=()=>invoke('hit',inspectedSeat);$('bjStand').onclick=()=>invoke('stand',inspectedSeat);$('bjReturnActive').onclick=()=>selectSeat(activeId());
    $('bjCopyPlayer').onclick=()=>invoke('copyInvite','player');$('bjCopyWatch').onclick=()=>invoke('copyInvite','watch');$('bjEnterTable').onclick=()=>showPanel('game');$('bjOpenRoom').onclick=()=>showPanel('room');
    $('bjRules').onclick=()=>{if($('bjResultDialog').open)closeResult();if(!$('bjRulesDialog').open)$('bjRulesDialog').showModal();$('bjCloseRules').focus();};
    const closeRules=()=>{if($('bjRulesDialog').open)$('bjRulesDialog').close();};$('bjCloseRules').onclick=closeRules;$('bjGotRules').onclick=closeRules;
    $('bjCloseResult').onclick=closeResult;$('bjResultBack').onclick=closeResult;$('bjViewResult').onclick=()=>openResult(true);$('bjResultNext').onclick=async()=>{closeResult();await invoke('next');};
    $('bjResultSeats').onclick=()=>{closeResult();showPanel('room');};
    $('bjResultDialog').oncancel=e=>{e.preventDefault();closeResult();};$('bjRulesDialog').oncancel=e=>{e.preventDefault();closeRules();};
    controller.subscribe(receive);
  },render:receive};
})(typeof window!=='undefined'?window:this);
