/* Shared game rooms. Only the room owner's signed public state is broadcast.
   Public MQTT relays provide a best-effort transport; no hidden gifts or keys are sent. */
(function(){
  'use strict';
  const C=RoomCore,$=id=>document.getElementById(id);
  const relays=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt','wss://public.cloud.shiftr.io'];
  const store={get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}};
  const room={role:'solo',code:'',clients:[],peers:new Map(),rev:0,lastAt:0,lastHost:0,playerId:null,playerSeen:0,pending:null,acks:[],seen:new Set(),id:C.id(),ready:false,working:false,closed:false};
  let adapter,timer,receiveChain=Promise.resolve(),sendChain=Promise.resolve(),heartbeatAt=0,owner=null,cipher,lastBroadcastAt=0,renderKey='';
  const storageKey=code=>'daydream.owner.'+code;
  let guestIdentity=null,guestIdentityPersistent=true;const memoryIdentities=new Map();
  room.nextPlayers=[];room.operatorGrant=null;
  Object.assign(room,{bankerGrant:null,bankerRequests:[],bankerAcks:[],quotePending:null,bankerRequestAt:new Map()});
  const publicBankerRequests=()=>room.bankerRequests.map(({id,peer,name,status})=>({id,peer,name,status}));
  const publicBankerGrant=()=>{const g=owner?.bankerGrant;return g?{peer:g.peer,pub:g.pub,keyCode:g.keyCode,epoch:g.epoch,name:validName(g.name)||'匿名'}:null;};
  const bankerIdentity=()=>!!guestIdentity&&room.bankerGrant?.peer===room.id&&room.bankerGrant.pub===guestIdentity.pub&&room.bankerGrant.keyCode===guestIdentity.code;
  const canQuote=()=>!room.closed&&(room.role==='host'?!owner?.bankerGrant&&online():room.role!=='solo'&&bankerIdentity()&&room.ready&&hostFresh()&&online()&&validNonce(room.syncProof)&&!room.quotePending);
  const canRequestBanker=()=>!['solo','host'].includes(room.role)&&!!guestIdentity&&room.ready&&hostFresh()&&online()&&!bankerIdentity()&&!room.bankerRequests.some(r=>r.peer===room.id&&['sending','pending'].includes(r.status));
  const currentBanker=()=>{const grant=room.role==='host'?owner?.bankerGrant:room.bankerGrant;return grant?{peer:grant.peer,name:validName(grant.name)||'匿名',host:false}:{peer:room.code,name:room.role==='host'?room.name:room.members.find(p=>p.role==='host')?.name||'房主',host:true};};
  const seriesState=()=>{try{return window.SeriesCore?.publicState(room.role==='host'?owner?.series:room.series)||null;}catch{return null;}};
  const bankerChangeAllowed=peer=>{const s=seriesState();return !s||s.status!=='active'||s.banker?.peer===peer;};
  function syncSeriesState(){
    if(room.role!=='host'||!owner?.series||!window.SeriesCore)return false;
    const state=seriesState(),game=adapter.save()?.game;
    if(state?.status!=='active'||!game||game.mode!=='money')return false;let changed=false;
    // First numeric confirmation legitimately creates a fresh Engine before play.
    if(!owner.seriesPool&&game.started===true&&game.phase==='select'&&game.selected===null&&game.round===0&&game.config?.mode==='money'&&Array.isArray(game.config.values)&&game.config.values.length===9){owner.seriesPool=JSON.parse(JSON.stringify(game.config));owner.seriesGameId=game.gameId;owner.seatLockGameId=game.gameId;changed=true;}
    if(game.gameId!==owner.seriesGameId)return changed;
    if(game.phase!=='ended'||room.playerId!==owner.seriesPlayer?.peer)return changed;
    try{const player=room.peers.get(room.playerId);owner.series=window.SeriesCore.recordSettlement(owner.series,game,{player:{peer:room.playerId,name:player?.name||owner.seriesPlayer.name},banker:currentBanker()});changed=changed||owner.series.status!==state.status||owner.series.records.length!==state.records.length;}catch{note('本轮计分身份未能核对，请由房主检查本轮玩家与庄家。');}return changed;
  }
  async function createSeries(config){
    if(room.role!=='host'||room.closed||room.working||!online()||(gameState().mode||'gift')!=='money'||!seatWindow(gameState())||!window.SeriesCore||!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['rounds','entryFee'].includes(k)))return false;
    let series;try{series=window.SeriesCore.create(config,owner.series);}catch{return false;}
    owner.series=series;owner.seriesPool=null;owner.seriesGameId=null;owner.seriesPlayer=null;room.rev++;save();await broadcast();update();adapter.render();return true;
  }
  async function confirmSeriesNext(peerId){
    const series=seriesState(),player=room.peers.get(room.playerId);
    if(room.role!=='host'||room.closed||room.working||!online()||series?.status!=='awaiting_banker'||!player||Date.now()-player.at>24000||typeof adapter.prepareSeriesRound!=='function')return false;
    const isHost=peerId===room.code||peerId===room.id,target=isHost?null:room.peers.get(peerId);
    if(!isHost&&(peerId===room.playerId||!target?.pub||target.keyCode!==peerId||Date.now()-target.at>24000))return false;
    const banker={peer:isHost?room.code:peerId,name:isHost?room.name:target.name};let next;try{next=window.SeriesCore.nextRound(owner.series,banker);}catch{return false;}
    room.working=true;
    try{
      await adapter.prepareSeriesRound(owner.seriesPool?JSON.parse(JSON.stringify(owner.seriesPool)):null);
      owner.series=next;owner.seriesGameId=gameState().gameId;owner.seriesPlayer={peer:room.playerId,name:player.name};owner.seatLockGameId=gameState().gameId;
      owner.bankerGrant=isHost?null:{peer:peerId,pub:target.pub,keyCode:target.keyCode,epoch:C.nonce(),name:target.name};owner.bankerSeen=[];room.bankerGrant=owner.bankerGrant&&{...owner.bankerGrant};room.rev++;save();await broadcast();update();adapter.render();return true;
    }catch{return false;}finally{room.working=false;}
  }
  async function endSeries(){
    if(room.role!=='host'||room.closed||room.working||!online()||!owner?.series||!window.SeriesCore)return false;
    try{owner.series=window.SeriesCore.end(owner.series);}catch{return false;}owner.seriesPool=null;owner.seriesGameId=null;owner.seriesPlayer=null;room.rev++;save();await broadcast();update();adapter.render();return true;
  }
  function quotePayload(payload){const state=gameState();
    if((state.mode||'gift')==='gift'){
      if(!Array.isArray(payload)||payload.length<1||payload.length>9)throw Error('无效礼物报价');const seen=new Set();
      return payload.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==2||!Number.isInteger(item.gift)||item.gift<0||item.gift>8||seen.has(item.gift)||!Number.isInteger(item.count)||item.count<1||item.count>99999999)throw Error('无效礼物报价');seen.add(item.gift);return{gift:item.gift,count:item.count};});
    }
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.value!=='number'||!Number.isFinite(payload.value)||payload.value<0||payload.value>state.config.max||payload.value>(state.mode==='money'?1000000:5)||state.mode==='drink'&&!Number.isInteger(payload.value))throw Error('无效数值报价');return{value:payload.value};
  }
  async function requestBanker(){
    if(room.role==='host')return reclaimBanker();if(!canRequestBanker())return false;
    const data={type:'bankerRequest',id:C.id(),peer:room.id,at:hostNow(),rev:room.rev,nonce:C.nonce(),sync:room.syncNonce,proof:room.syncProof};
    room.bankerRequests.push({id:data.id,peer:room.id,name:room.name,status:'sending'});adapter.render();
    try{await publish(await guestPacket(data));note('庄家申请已发送，等待房主同意。');return true;}catch{room.bankerRequests=room.bankerRequests.filter(r=>r.id!==data.id);adapter.render();return false;}
  }
  async function decideBanker(id,approved){
    if(room.role!=='host'||room.closed||room.working||typeof approved!=='boolean'||!online())return false;
    const request=room.bankerRequests.find(r=>r.id===id&&r.status==='pending'),peer=request&&room.peers.get(request.peer);
    if(!request||approved&&(!peer||Date.now()-peer.at>24000||peer.pub!==request.pub||peer.keyCode!==request.keyCode))return false;
    if(approved&&!bankerChangeAllowed(request.peer)){note('本局庄家已确认，请结算后更换。');return false;}
    if(approved){owner.bankerGrant={peer:request.peer,pub:request.pub,keyCode:request.keyCode,epoch:C.nonce(),name:peer.name};owner.bankerSeen=[];room.bankerGrant={...owner.bankerGrant};for(const r of room.bankerRequests)if(r.status==='pending')r.status=r===request?'approved':'declined';}
    else request.status='declined';
    room.rev++;save();await broadcast();update();adapter.render();return true;
  }
  async function reclaimBanker(){
    if(room.role!=='host'||room.closed||room.working||!online())return false;if(!bankerChangeAllowed(room.code)){note('本局庄家已确认，请结算后更换。');return false;}
    owner.bankerGrant=null;owner.bankerSeen=[];room.bankerGrant=null;for(const r of room.bankerRequests)if(['pending','approved'].includes(r.status))r.status='declined';room.rev++;save();await broadcast();update();adapter.render();return true;
  }
  async function assignBanker(peerId){
    if(room.role!=='host'||room.closed||room.working||!online()||!bankerChangeAllowed(peerId===room.id?room.code:peerId))return false;
    if(peerId===room.id||peerId===room.code)return reclaimBanker();if(peerId===room.playerId)return false;
    const peer=room.peers.get(peerId);if(!peer?.pub||peer.keyCode!==peerId||Date.now()-peer.at>24000)return false;
    const request={id:C.id(),peer:peerId,name:peer.name,status:'pending',pub:peer.pub,keyCode:peer.keyCode};room.bankerRequests.push(request);room.bankerRequests=room.bankerRequests.slice(-64);return decideBanker(request.id,true);
  }
  async function submitQuote(payload){
    if(!canQuote()||gameState().phase!=='pricing'||gameState().reshuffleRequest?.status==='pending')return false;
    let clean;try{clean=quotePayload(payload);}catch{return false;}
    if(room.role==='host'){if(room.working||typeof adapter.quote!=='function')return false;room.working=true;try{await adapter.quote(clean);room.rev++;save();await broadcast();update();return true;}catch{return false;}finally{room.working=false;}}
    const data={type:'bankerAction',id:C.id(),peer:room.id,at:hostNow(),rev:room.rev,gameId:gameState().gameId,grant:room.bankerGrant.epoch,sync:room.syncNonce,proof:room.syncProof,payload:clean};room.quotePending={data,sent:Date.now()};update();adapter.render();
    try{await publish(await guestPacket(data));note('报价已发送，等待房间确认。');return true;}catch{room.quotePending=null;update();adapter.render();return false;}
  }
  const publicRequests=()=>room.nextPlayers.filter(r=>r.gameId===gameState().gameId).map(({id,peer,name,status,gameId})=>({id,peer,name,status,gameId}));
  const gameState=()=>adapter?.publicState?.()||{};
  const seatWindow=state=>state.phase==='ended'||state.phase==='select'&&state.started===false&&state.selected===null;
  const seatAvailable=()=>{const state=gameState();return seatWindow(state)&&(state.phase==='ended'||owner?.seatLockGameId!==state.gameId);};
  room.joinIntent=null;
  const online=()=>room.clients.some(c=>c.connected&&c.roomSubscribed);
  const canRequestNextPlayer=()=>room.role==='watch'&&room.ready&&hostFresh()&&online()&&!!guestIdentity&&room.seatAvailable===true&&seatWindow(gameState())&&!room.nextPlayers.some(r=>r.peer===room.id&&r.gameId===gameState().gameId);
  async function guestPacket(data){const signedData={...data,room:room.code};return {type:'guest',pub:guestIdentity.pub,keyCode:guestIdentity.code,...await C.sign(signedData,guestIdentity.privateKey),...(room.token&&!room.operatorGrant?{auth:await C.mac(signedData,room.token)}:{})};}
  async function requestNextPlayer(){
    if(!canRequestNextPlayer())return false;
    const state=gameState(),data={type:'nextPlayer',id:C.id(),peer:room.id,at:hostNow(),rev:room.rev,gameId:state.gameId,nonce:C.nonce(),sync:room.syncNonce,proof:room.syncProof,name:room.name};
    // Reserve locally before asynchronous signing to stop duplicate button presses.
    room.nextPlayers.push({id:data.id,peer:room.id,name:room.name,status:'sending',gameId:state.gameId});adapter.render();
    try{await publish(await guestPacket(data));note('正在上场，等待房间同步…');return true;}catch{room.nextPlayers=room.nextPlayers.filter(r=>r.id!==data.id);adapter.render();return false;}
  }
  async function decideNextPlayer(id,approve){
    if(room.role!=='host'||room.closed||room.working||typeof approve!=='boolean'||!seatAvailable())return false;
    const request=room.nextPlayers.find(r=>r.id===id&&r.status==='pending'&&r.gameId===gameState().gameId);
    if(!request)return false;
    if(approve&&(!room.peers.has(request.peer)||Date.now()-room.peers.get(request.peer).at>24000))return false;
    room.working=true;
    try{
      if(approve){adapter.reset();owner.operatorGrant={peer:request.peer,pub:request.pub,keyCode:request.keyCode,epoch:C.nonce()};owner.seatLockGameId=gameState().gameId;room.operatorGrant={...owner.operatorGrant};room.playerId=request.peer;room.playerSeen=Date.now();room.pending=null;room.seen.clear();for(const r of room.nextPlayers)if(r.status==='pending')r.status=r===request?'approved':'declined';}
      else request.status='declined';
      room.rev++;save();await broadcast();update();adapter.render();return true;
    }finally{room.working=false;}
  }
  async function invitePlayer(peerId){
    if(room.role!=='host'||room.closed||room.working||!online()||!seatAvailable()||peerId===room.playerId)return false;
    const peer=room.peers.get(peerId);if(!peer?.pub||peer.keyCode!==peerId||Date.now()-peer.at>24000)return false;
    const request={id:C.id(),peer:peerId,name:peer.name,status:'pending',gameId:gameState().gameId,pub:peer.pub,keyCode:peer.keyCode};
    room.nextPlayers.push(request);return decideNextPlayer(request.id,true);
  }
  let lobbyHandle=null,lobbyKey='';
  function closeLobby(){lobbyHandle?.close();lobbyHandle=null;lobbyKey='';}
  function updateLobby(){if(!lobbyHandle||room.closed)return;const state=gameState(),key=JSON.stringify([room.alias,room.name,room.count,state.mode,state.phase]);if(key!==lobbyKey){lobbyKey=key;Promise.resolve(lobbyHandle.update()).catch(()=>{});}}
  function startLobby(){closeLobby();if(room.role!=='host'||!window.RoomLobby?.advertise)return;try{lobbyHandle=window.RoomLobby.advertise({code:room.code,pub:owner.pub,privateKey:owner.privateKey},()=>{const state=gameState();return {alias:room.alias||null,hostName:room.name,count:room.count||1,mode:state.mode||'gift',phase:state.phase};});}catch{}}
  const monotonic=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const validNonce=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{22}$/.test(value);
  Object.assign(room,{hostOffset:0,clockSynced:false,syncNonce:'',syncIssued:0,syncProof:'',challenges:new Map(),receivedStates:0,applyErrors:0});
  const hostNow=()=>room.clockSynced?room.hostEpoch+(monotonic()-room.hostEpochMono):Date.now();
  const hostFresh=()=>room.lastHost>0&&monotonic()-room.lastHostMono<24000;
  function ensureSync(){if(!room.syncNonce||!room.clockSynced&&monotonic()-room.syncIssued>10000){room.syncNonce=C.nonce();room.syncIssued=monotonic();room.syncProof='';}}
  const isAlias=value=>typeof value==='string'&&/^[0-9]{4}$/.test(value);
  let directoryHandle=null,directoryEpoch=0,directoryRetry=null,directoryAttempt=0,directoryWorking=false,directoryError='',joining=false,startTicket=0;
  function closeDirectory(){closeLobby();directoryEpoch++;clearTimeout(directoryRetry);directoryRetry=null;directoryHandle?.close();directoryHandle=null;directoryWorking=false;directoryAttempt=0;directoryError='';}
  function claimAlias(){
    if(room.role!=='host'||room.closed||directoryWorking)return;
    clearTimeout(directoryRetry);directoryRetry=null;const epoch=++directoryEpoch,claimOwner=owner,code=room.code;let announced=false;
    const retry=missing=>{if(epoch!==directoryEpoch||room.closed||room.role!=='host')return;directoryWorking=false;directoryError=missing?'房间码组件未加载，请刷新网页更新；游戏与已有链接不受影响。':'房间码通道暂不可用，正在自动重试；游戏与已有链接不受影响。';const delay=Math.min(30000,2000*2**Math.min(directoryAttempt++,4));directoryRetry=setTimeout(()=>{directoryRetry=null;if(epoch===directoryEpoch)claimAlias();},delay);update();note(directoryError);};
    if(typeof window.RoomDirectory?.claim!=='function'){retry(true);return;}
    directoryWorking=true;directoryError='';update();
    Promise.resolve().then(()=>window.RoomDirectory.claim({code,pub:claimOwner.pub,privateKey:claimOwner.privateKey,...(isAlias(claimOwner.alias)?{alias:claimOwner.alias}:{})},alias=>{
      if(epoch!==directoryEpoch||room.closed||room.role!=='host'||room.code!==code||!isAlias(alias))return;
      announced=true;room.alias=alias;claimOwner.alias=alias;save();update();broadcast();
    })).then(handle=>{if(epoch!==directoryEpoch||room.closed){handle.close();return;}if(!announced){handle.close();throw Error('房间码未确认');}const previous=directoryHandle;directoryHandle=handle;if(previous!==handle)previous?.close();directoryWorking=false;directoryAttempt=0;directoryError='';update();}).catch(()=>retry(false));
  }
  async function resolveAlias(alias){
    if(!isAlias(alias))throw Error('请输入4位数字房间码，例如 1234。');
    if(!window.RoomDirectory)throw Error('房间码服务尚未加载，请刷新页面后重试。');
    const found=await window.RoomDirectory.resolve(alias);
    if(!found||!C.valid(found.code)||found.alias!==alias)throw Error('未找到这个房间，请确认房主保持页面打开并核对4位房间码。');
    return found.code;
  }
  const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim():'';
  const validName=value=>{const name=cleanName(value);return name&&Array.from(name).length<=16?name:'';};
  room.name=validName(store.get('daydream.nickname'))||'';
  room.members=[];
  let nameDialog,nameInput,nameError,nameResolve;
  function diagnostics(){
    return ['版本：20261027-live','角色：'+room.role,'房间信息：'+(!!room.code),'操作链接：'+(!!room.token),
      '安全加密：'+(!!globalThis.crypto?.subtle),'WebSocket：'+(typeof WebSocket!=='undefined'),
      '房间码目录：'+(room.role!=='host'?'由房主维护':directoryWorking?'正在连接或生成':directoryError?'暂不可用，自动重试中':isAlias(room.alias)?'已生成':'等待生成'),
      ...relays.map((url,i)=>{const c=room.clients[i];return (url.includes('shiftr.io')?'兼容线路（443）':'线路'+(i+1))+'：'+(!c?'未启用':c.roomSubscribed?'已连接，可收发':c.connected?(c.roomError?'已连接，订阅重试中':'已连接，等待订阅'):c.roomError?'连接失败，正在重试':'正在连接');}),
      '房主同步：'+(room.role==='host'?'本机房主':room.lastHost?'最近 '+Math.max(0,Math.round((monotonic()-room.lastHostMono)/1000))+' 秒前':'尚未收到'),
      '收到房主状态：'+room.receivedStates+' 次',
      ...(room.clockSynced?['自动校时：完成（设备相差约 '+Math.round(room.hostOffset/1000)+' 秒）']:[]),
      ...(room.applyErrors?['状态加载失败：'+room.applyErrors+' 次，正在重试']:[]),
      ...(room.expiredStates?['收到超时状态：'+room.expiredStates+' 次'+(room.clockSynced?'，已启用自动校时':'，正在与房主握手校时')]:[])].join('\n');
  }
  function nameUI(){
    if(!document.createElement)return;
    const panel=$('roomPanel');
    const detail=document.createElement('details');detail.className='room-diagnostics';
    const summary=document.createElement('summary');summary.textContent='连接检测 · 进不去时点这里';
    const text=document.createElement('pre');text.id='roomDiagnosticText';
    const copy=document.createElement('button');copy.type='button';copy.textContent='复制检测结果';copy.onclick=async()=>{try{await navigator.clipboard.writeText(diagnostics());note('检测结果已复制，可发给房主排查。');}catch{note('请复制或截图上面的连接检测信息。');}};
    detail.append(summary,text,copy);panel.append(detail);
    const refresh=document.createElement('button');refresh.id='refreshRoomCode';refresh.type='button';refresh.className='room-code-refresh';refresh.hidden=true;refresh.onclick=()=>{if(room.role==='host')claimAlias();};
    const aliasStatus=document.createElement('p');aliasStatus.id='roomAliasStatus';aliasStatus.className='room-alias-status';aliasStatus.setAttribute('role','status');aliasStatus.setAttribute('aria-live','polite');panel.append(refresh,aliasStatus);
    const identity=document.createElement('div');identity.className='room-identity';
    const me=document.createElement('span');me.id='roomMyName';
    const rename=document.createElement('button');rename.type='button';rename.textContent='修改昵称';rename.onclick=async()=>{if(await ensureName(true)){update();if(room.role!=='solo')hello();}};
    identity.append(me,rename);if(panel.insertBefore)panel.insertBefore(identity,$('roomIntro'));else panel.append(identity);
    const members=document.createElement('p');members.id='roomMembers';members.className='room-members';members.setAttribute('aria-live','polite');if(panel.insertBefore)panel.insertBefore(members,$('roomIntro'));else panel.append(members);
    nameDialog=document.createElement('dialog');nameDialog.id='roomNameDialog';nameDialog.className='room-name-dialog';nameDialog.setAttribute('aria-labelledby','roomNameTitle');
    const form=document.createElement('form');form.method='dialog';
    const title=document.createElement('h2');title.id='roomNameTitle';title.textContent='先取一个房间昵称';
    const help=document.createElement('p');help.textContent='用你的主播名或昵称，方便房主和观众认出你。无需注册。';
    const label=document.createElement('label');label.textContent='我的昵称（1–16 个字符）';
    nameInput=document.createElement('input');nameInput.type='text';nameInput.autocomplete='nickname';nameInput.required=true;nameInput.setAttribute('enterkeyhint','done');label.append(nameInput);
    nameError=document.createElement('p');nameError.className='room-name-error';nameError.setAttribute('role','alert');
    const actions=document.createElement('div');actions.className='room-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='暂不进入';cancel.onclick=()=>nameDialog.close('cancel');
    const submit=document.createElement('button');submit.type='submit';submit.textContent='确认昵称';actions.append(cancel,submit);
    form.append(title,help,label,nameError,actions);nameDialog.append(form);document.body.append(nameDialog);
    form.onsubmit=e=>{e.preventDefault();const name=validName(nameInput.value);if(!name){nameError.textContent='请输入 1–16 个字符的昵称，不能只有空格。';nameInput.focus();return;}room.name=name;store.set('daydream.nickname',name);nameDialog.close('saved');};
    nameDialog.addEventListener('close',()=>{const resolve=nameResolve;nameResolve=null;resolve?.(nameDialog.returnValue==='saved');});
  }
  async function ensureName(force=false){
    if(!force&&validName(room.name))return true;
    // Headless protocol harnesses have no DOM; browser entry always uses the dialog.
    if(!document.createElement){room.name='匿名';return true;}
    if(!nameDialog)nameUI();
    if(nameDialog.open)return false;
    nameInput.value=room.name;nameError.textContent='';nameDialog.returnValue='';
    const result=new Promise(resolve=>{nameResolve=resolve;});nameDialog.showModal();nameInput.focus();return result;
  }
  function roster(){return [{name:room.name||'匿名',role:'host'},...Array.from(room.peers,([id,p])=>({id,name:p.name||'匿名',role:id===room.playerId?'player':'watch',invitable:!!p.pub&&p.keyCode===id&&Date.now()-p.at<24000&&id!==room.playerId}))];}
  function note(s){$('roomNotice').textContent=s;}
  function linked(role){const u=new URL(role==='player'?'player.html':'watch.html',location.href);u.search='';u.hash=new URLSearchParams({room:room.code,...(isAlias(room.alias)?{code:room.alias}:{}),...(role==='player'?owner.operatorGrant?{request:'1'}:{play:owner.token}:{view:'1'})}).toString();return u.href;}
  function canPlay(){return room.role==='solo'||room.role==='player'&&room.ready&&hostFresh()&&room.playerId===room.id&&!room.pending;}
  function update(){
    document.body.dataset.roomRole=room.role;
    const active=room.role!=='solo',host=room.role==='host',actor=(gameState()?.mode||'gift')==='gift'?'主播':'玩家';
    if($('roomDiagnosticText'))$('roomDiagnosticText').textContent=diagnostics();
    if($('roomMyName'))$('roomMyName').textContent='我的昵称：'+(room.name||'尚未填写');
    if($('roomMembers')){const members=host?roster():room.members;$('roomMembers').hidden=!active;$('roomMembers').textContent=members.length?members.map(p=>(p.role==='host'?'房主':p.role==='player'?actor:'围观者')+'：'+(validName(p.name)||'匿名')).join('\n'):'成员名单等待房主同步…';}
    $('createRoom').hidden=active;$('soloMode').hidden=active;$('joinArea').hidden=active;
    $('leaveRoom').hidden=!active;$('reconnectRoom').hidden=!active;
    $('roomLinkArea').hidden=!host;$('watchLinkArea').hidden=!host;
    $('roomCode').textContent=active?(isAlias(room.alias)?room.alias:host?directoryError?'暂未生成':'生成中…':'等待4位房间码…'):'';
    if($('refreshRoomCode')){$('refreshRoomCode').hidden=!host;$('refreshRoomCode').disabled=directoryWorking;$('refreshRoomCode').textContent=directoryWorking?(isAlias(room.alias)?'正在刷新房间码…':'正在生成房间码…'):isAlias(room.alias)?'刷新房间码':'重试生成房间码';}
    if($('roomAliasStatus')){$('roomAliasStatus').hidden=!host;$('roomAliasStatus').textContent=!host?'':directoryError||(directoryWorking?(isAlias(room.alias)?'正在检查房间码通道，现有房间码仍保留。':'正在连接房间码通道，请稍候…'):isAlias(room.alias)?'房间码已就绪。刷新只检查房间码，不重开本局。':'等待生成房间码。');}
    const online=room.clients.some(c=>c.connected&&c.roomSubscribed),fresh=hostFresh();
    $('roomStatus').textContent=!active?'单人模式':host?(online?'房主 · 等待 / 同步中':'房主 · 正在连接'):!online?'网络连接中…':!fresh?'等待房主上线…':room.role==='player'?(room.playerId===room.id?actor+' · 实时同步':room.playerId?'操作席已被使用':'正在加入操作席…'):'围观 · 实时同步';
    $('roomCount').textContent=!active?'':host||room.ready&&fresh?'在线 '+(room.count||1)+' 人（含房主）':'在线人数待同步';
    $('roomIntro').textContent=!active?'创建房间，把主播操作链接发给主播；其他人输入4位数字房间码即可同步围观。':host?'你正在房主观看席。把下方主播链接发给一位主播，4位数字房间码可以发给多人围观。':room.role==='player'?'这是主播操作席。你的选箱、开箱和决定会同步给房主及所有围观者。':'你正在围观，开箱、熊二报价和最终结果会实时同步。';
    $('roomIntro').textContent=$('roomIntro').textContent.replaceAll('主播',actor);
    if(host){$('roomLink').value=linked('player');$('watchLink').value=linked('watch');}
    if(active&&Date.now()-room.started>25000&&(!online||!host&&!fresh))note('暂未连上房间。请确认房主保持页面打开，再点“重新连接”；公共联机通道受网络影响，当前进度不会显示为已同步。');
    const nextRenderKey=room.role+':'+canPlay()+':'+canQuote()+':'+(host?JSON.stringify(roster()):'');if(nextRenderKey!==renderKey){renderKey=nextRenderKey;adapter?.render();}
  }
  function save(){if(room.role!=='host')return;owner.bankerRequests=room.bankerRequests.map(r=>({...r}));owner.saved=adapter.save();owner.rev=room.rev;owner.expires=Date.now()+86400000;if(!store.set(storageKey(room.code),owner))note('当前浏览器无法保存房间，关闭房主页面后无法恢复本局。');}
  function publish(packet,retain=false){sendChain=sendChain.then(async()=>{if(room.closed)return;const raw=await cipher.seal(packet);for(const client of room.clients)if(client.connected)client.publish(room.topic,raw,{qos:0,retain});}).catch(()=>note('本次同步未发出，正在重试连接。'));return sendChain;}
  function broadcast(){if(room.role!=='host'||room.closed)return;const now=Date.now();for(const[id,p]of room.peers)if(now-p.at>24000)room.peers.delete(id);if(room.playerId&&now-room.playerSeen>24000)room.playerId=null;room.count=1+room.peers.size;room.lastHost=now;
    for(const[id,c]of room.challenges)if(monotonic()-c.issued>30000)room.challenges.delete(id);
    const syncReplies=Array.from(room.challenges,([peer,c])=>({peer,nonce:c.nonce,challenge:c.challenge}));
    updateLobby();lastBroadcastAt=Math.max(now,lastBroadcastAt+1);const data={code:room.code,alias:isAlias(room.alias)?room.alias:null,at:lastBroadcastAt,rev:room.rev,state:adapter.publicState(),playerId:room.playerId,count:room.count,acks:room.acks,members:roster(),syncReplies,operatorGrant:owner.operatorGrant||null,seatAvailable:seatAvailable(),nextPlayers:publicRequests(),bankerGrant:publicBankerGrant(),bankerRequests:publicBankerRequests(),bankerAcks:room.bankerAcks,series:seriesState(),seriesConfigured:!!owner.seriesPool};
    return C.sign(data,owner.privateKey).then(signed=>publish({type:'state',pub:owner.pub,...signed},true));
  }
  async function hello(){if(room.role==='solo'||!cipher)return;if(room.role==='host')return broadcast();ensureSync();const data={type:'presence',id:room.id,at:hostNow(),role:room.role,name:room.name||'匿名',sync:room.syncNonce,...(room.syncProof?{proof:room.syncProof}:{}),...(guestIdentity&&room.operatorGrant?{grant:room.operatorGrant.epoch}:{})};return publish(guestIdentity?await guestPacket(data):{data,auth:room.token?await C.mac(data,room.token):null});}
  async function receive(raw){
    let p=await cipher.open(raw);const now=Date.now();let principal=null;
    if(p.type==='guest'){
      try{if(typeof p.pub!=='string'||p.pub.length>150||!C.valid(p.keyCode))return;const d=await C.verify(p,p.pub,p.keyCode);if(!d||d.room!==room.code||!['presence','nextPlayer','action','bankerRequest','bankerAction'].includes(d.type)||(d.type==='presence'?d.id:d.peer)!==p.keyCode)return;principal={pub:p.pub,keyCode:p.keyCode};p={data:d,auth:p.auth};}catch{return;}
    }
    if(p.type==='state'){
      if(room.role==='host')return;
      const d=await C.verify(p,p.pub,room.code);if(!d||d.code!==room.code)return;
      if(!Number.isFinite(d.at)||!Number.isInteger(d.rev)||d.rev<room.rev||d.at<=room.lastAt)return;
      room.receivedStates++;
      const reply=Array.isArray(d.syncReplies)&&d.syncReplies.slice(0,100).find(c=>c.peer===room.id&&c.nonce===room.syncNonce&&validNonce(c.challenge));
      if(!room.clockSynced&&reply&&room.syncNonce&&monotonic()-room.syncIssued<=10000){room.hostOffset=d.at-now;room.hostEpoch=d.at;room.hostEpochMono=monotonic();room.clockSynced=true;}
      if(Math.abs(hostNow()-d.at)>24000){room.expiredStates=(room.expiredStates||0)+1;if(room.clockSynced){room.clockSynced=false;room.syncNonce='';}hello();update();return;}
      const changed=!room.ready||room.rev!==d.rev;
      // Retry this revision after a rendering error; never mark unapplied state ready.
      if(changed){try{adapter.loadPublic(d.state);}catch{room.applyErrors++;update();return;}}
      room.rev=d.rev;room.lastAt=d.at;room.lastHost=now;room.lastHostMono=monotonic();room.playerId=d.playerId;room.count=d.count;room.ready=true;
      room.series=d.series||null;room.seriesConfigured=d.seriesConfigured===true;
      const previousRole=room.role;room.operatorGrant=d.operatorGrant||null;room.seatAvailable=d.seatAvailable===true;
      const previousBanker=room.bankerGrant?.epoch;room.bankerGrant=d.bankerGrant||null;
      room.bankerRequests=Array.isArray(d.bankerRequests)?d.bankerRequests.slice(0,64).filter(r=>r&&typeof r.id==='string'&&typeof r.peer==='string'&&['pending','approved','declined'].includes(r.status)).map(r=>({id:r.id,peer:r.peer,status:r.status,name:validName(r.name)||'匿名'})):[];
      if(previousBanker!==room.bankerGrant?.epoch){room.quotePending=null;if(bankerIdentity())note('房主已同意，你现在负责报价；房间管理仍由房主负责。');}
      if(room.quotePending){const ack=Array.isArray(d.bankerAcks)&&d.bankerAcks.find(a=>a.id===room.quotePending.data.id);if(ack){room.quotePending=null;note(ack.accepted?'报价已同步。':'这份报价未被采用，请等待最新局面后重试。');}}
      let identityChanged=false;
      if(room.operatorGrant){room.role=guestIdentity&&room.operatorGrant.peer===guestIdentity.code&&room.operatorGrant.pub===guestIdentity.pub?'player':'watch';if(guestIdentity&&room.id!==guestIdentity.code){room.id=guestIdentity.code;room.syncNonce='';room.syncProof='';room.clockSynced=false;room.pending=null;identityChanged=true;}}
      if(room.joinIntent==='player'&&room.role==='watch')note('点击“申请上场”即可成为玩家；进行中的对局需等本局结束。');
      room.nextPlayers=Array.isArray(d.nextPlayers)?d.nextPlayers.slice(0,100).filter(r=>r&&typeof r.id==='string'&&typeof r.peer==='string'&&typeof r.gameId==='string'&&['pending','approved','declined'].includes(r.status)).map(r=>({id:r.id,peer:r.peer,gameId:r.gameId,name:validName(r.name)||'匿名',status:r.status})):[];
      if(isAlias(d.alias))room.alias=d.alias;
      room.members=Array.isArray(d.members)?d.members.slice(0,200).map(p=>({name:validName(p?.name)||'匿名',role:p?.role==='host'?'host':p?.role==='player'?'player':'watch'})):[{name:'匿名',role:'host'}];
      if(room.pending&&d.acks?.includes(room.pending.data.id)){if(['poolProposal','applyConfig'].includes(room.pending.data.action)&&d.state.started===false&&d.state.poolProposal?.status!=='pending')window.NumericStart?.failed?.('这次提交未被采用，草稿已保留，请重新提交给房主。');room.pending=null;note('已同步。');}
      const proofChanged=reply&&room.syncProof!==reply.challenge;if(proofChanged)room.syncProof=reply.challenge;
      if(previousRole!=='player'&&room.role==='player')note('上场成功，你现在是开箱玩家'+(guestIdentityPersistent?'':'。当前浏览器不能保存标签页身份，刷新后需重新申请。'));
      update();adapter.render();if(proofChanged||identityChanged)hello();return;
    }
    if(room.role!=='host'||!p.data)return;
    const d=p.data;if(typeof d.id!=='string'||d.id.length>40)return;
    const fresh=Number.isFinite(d.at)&&Math.abs(now-d.at)<=24000;
    if(d.type==='presence'){
      if(/^[A-HJ-NP-Z2-9]{12}$/.test(d.id)&&!principal)return;
      const sync=validNonce(d.sync);if(d.sync!==undefined&&!sync)return;if(!fresh&&!sync)return;
      const grant=owner.operatorGrant;
      const playerAuth=d.role==='player'&&(grant?!!principal&&principal.pub===grant.pub&&principal.keyCode===grant.keyCode&&d.id===grant.peer&&d.grant===grant.epoch:await C.checkMac(d,p.auth,owner.token));
      // Revoked legacy links may request clock synchronization, never a seat.
      if(d.role==='player'&&!playerAuth){if(owner.operatorGrant&&sync){const old=room.challenges.get(d.id);if(!old||old.nonce!==d.sync||monotonic()-old.issued>30000){if(room.challenges.size>=100)room.challenges.delete(room.challenges.keys().next().value);room.challenges.set(d.id,{nonce:d.sync,challenge:C.nonce(),issued:monotonic(),confirmed:false});await broadcast();}}return;}
      // An unauthenticated spectator cannot rename the active streamer's identity.
      const grantIdentity=grant&&principal&&principal.pub===grant.pub&&principal.keyCode===grant.keyCode&&d.id===grant.peer;
      if(d.id===room.playerId&&!playerAuth&&!grantIdentity)return;
      let challenge=room.challenges.get(d.id),newChallenge=false;
      if(sync&&(!challenge||challenge.nonce!==d.sync||monotonic()-challenge.issued>30000)){
        if(challenge&&monotonic()-challenge.issued<1000)return;
        if(room.challenges.size>=100)room.challenges.delete(room.challenges.keys().next().value);
        challenge={nonce:d.sync,challenge:C.nonce(),issued:monotonic(),confirmed:false};room.challenges.set(d.id,challenge);newChallenge=true;
      }
      const proof=sync&&challenge?.nonce===d.sync&&monotonic()-challenge.issued<=30000&&(challenge.confirmed||d.proof===challenge.challenge);
      // A time-skewed initial packet may request an echo, but cannot renew a seat.
      if(!fresh||sync&&!proof){if(newChallenge)await broadcast();return;}
      if(sync)challenge.confirmed=true;
      const previous=room.peers.get(d.id),name=validName(d.name)||'匿名';room.peers.set(d.id,{at:now,name,...(principal?{pub:principal.pub,keyCode:principal.keyCode}:{})});
      if(playerAuth&&(!room.playerId||room.playerId===d.id||now-room.playerSeen>24000)){room.playerId=d.id;room.playerSeen=now;}
      // Reply immediately on first arrival; heartbeat handles established peers.
      if(!room.knownPeers?.has(d.id)||previous?.name!==name){room.knownPeers??=new Set();room.knownPeers.add(d.id);await broadcast();update();}
      return;
    }
    if(!fresh)return;
    if(d.type==='bankerRequest'||d.type==='bankerAction'){
      const peer=room.peers.get(d.peer),challenge=room.challenges.get(d.peer),proof=challenge?.confirmed&&challenge.nonce===d.sync&&challenge.challenge===d.proof&&monotonic()-challenge.issued<=30000;
      if(!principal||!/^[A-Za-z0-9_-]{16}$/.test(d.id)||!peer||peer.pub!==principal.pub||peer.keyCode!==principal.keyCode||now-peer.at>24000||!proof)return;
      if(d.type==='bankerRequest'){
        if(room.working||d.rev!==room.rev||!validNonce(d.nonce)||room.bankerRequests.some(r=>r.id===d.id)||room.bankerRequests.some(r=>r.peer===d.peer&&r.status==='pending')||owner.bankerGrant?.peer===d.peer||room.bankerRequestAt.has(d.peer)&&now-room.bankerRequestAt.get(d.peer)<10000||room.bankerRequests.filter(r=>r.status==='pending').length>=64)return;
        room.bankerRequests=room.bankerRequests.filter(r=>r.status==='pending'||r.peer!==d.peer).slice(-63);
        room.bankerRequestAt.set(d.peer,now);room.bankerRequests.push({id:d.id,peer:d.peer,name:peer.name,status:'pending',pub:principal.pub,keyCode:principal.keyCode});save();await broadcast();update();adapter.render();return;
      }
      const grant=owner.bankerGrant;
      if(!grant||principal.pub!==grant.pub||principal.keyCode!==grant.keyCode||d.peer!==grant.peer||d.grant!==grant.epoch)return;
      const ack=async accepted=>{room.bankerAcks.push({id:d.id,accepted});room.bankerAcks=room.bankerAcks.slice(-16);await broadcast();update();};
      owner.bankerSeen??=[];if(owner.bankerSeen.includes(d.id)){await ack(false);return;}
      owner.bankerSeen.push(d.id);owner.bankerSeen=owner.bankerSeen.slice(-256);
      let clean;try{if(Object.keys(d).sort().join(',')!=='at,gameId,grant,id,payload,peer,proof,rev,room,sync,type'||d.rev!==room.rev||d.gameId!==gameState().gameId||room.working||gameState().phase!=='pricing'||gameState().reshuffleRequest?.status==='pending'||typeof adapter.quote!=='function')throw Error('报价已失效');clean=quotePayload(d.payload);}catch{save();await ack(false);return;}
      room.working=true;let accepted=false;
      try{await adapter.quote(clean);room.rev++;accepted=true;}catch{}finally{room.working=false;save();await ack(accepted);adapter.render();}return;
    }
    if(d.type==='nextPlayer'){
      const state=gameState(),peer=room.peers.get(d.peer),challenge=room.challenges.get(d.peer);
      if(room.working||!principal||!/^[A-Za-z0-9_-]{16}$/.test(d.id)||room.nextPlayers.some(r=>r.id===d.id)||!seatAvailable()||state.gameId!==d.gameId||d.rev!==room.rev||!validNonce(d.nonce)||!peer||peer.pub!==principal.pub||peer.keyCode!==principal.keyCode||now-peer.at>24000||!challenge?.confirmed||challenge.nonce!==d.sync||challenge.challenge!==d.proof||room.nextPlayers.some(r=>r.peer===d.peer&&r.gameId===d.gameId)||d.peer===room.playerId)return;
      room.nextPlayers=room.nextPlayers.filter(r=>r.gameId===state.gameId);if(room.nextPlayers.length>=100)return;
      room.nextPlayers.push({id:d.id,peer:d.peer,gameId:d.gameId,name:peer.name,status:'pending',pub:principal.pub,keyCode:principal.keyCode});await decideNextPlayer(d.id,true);return;
    }
    const grant=owner.operatorGrant;
    const actionAuth=grant?!!principal&&principal.pub===grant.pub&&principal.keyCode===grant.keyCode&&d.peer===grant.peer&&d.grant===grant.epoch:await C.checkMac(d,p.auth,owner.token);
    if(d.type!=='action'||!actionAuth)return;
    if(room.seen.has(d.id)){await broadcast();return;}
    room.seen.add(d.id);if(room.seen.size>256)room.seen.delete(room.seen.values().next().value);
    if(d.peer!==room.playerId||now-room.playerSeen>24000||d.rev!==room.rev||room.working){room.acks.push(d.id);room.acks=room.acks.slice(-16);await broadcast();return;}
    room.working=true;
    try{await adapter.act(d.action,d.index);}catch{note('主播的这次操作已过期，已同步当前进度。');}
    finally{room.working=false;room.acks.push(d.id);room.acks=room.acks.slice(-16);room.rev++;const seriesChanged=syncSeriesState();save();await broadcast();update();if(seriesChanged)adapter.render();}
  }
  function connect(){
    for(const url of relays){
      const client=mqtt.connect(url,{clientId:'dream_'+C.id(),...(url.includes('shiftr.io')?{username:'public',password:'public'}:{}),clean:true,connectTimeout:10000,reconnectPeriod:4000,keepalive:25,resubscribe:true});client.roomSubscribed=false;room.clients.push(client);
      function subscribe(){
        clearTimeout(client.roomRetry);if(room.closed||!client.connected)return;
        client.subscribe(room.topic,{qos:0},(e,granted)=>{client.roomSubscribed=!e&&(!granted||granted.every(g=>g.qos<128));if(client.roomSubscribed){client.roomError=false;hello();}else{client.roomError=true;note('一条联机线路未能加入房间，正在尝试其他线路。');client.roomRetry=setTimeout(subscribe,4000);}update();});
      }
      client.on('connect',subscribe);
      client.on('message',(_,raw)=>{receiveChain=receiveChain.then(()=>receive(raw.toString())).catch(()=>{});});
      client.on('error',()=>{client.roomError=true;update();});client.on('offline',()=>{client.roomSubscribed=false;clearTimeout(client.roomRetry);update();});client.on('close',()=>{client.roomSubscribed=false;clearTimeout(client.roomRetry);update();});
    }
  }
  function tick(){
    const now=Date.now();
    if(room.role==='host'){
      const lease=store.get('daydream.lease.'+room.code);
      if(lease&&lease.id!==room.id&&now-lease.at<15000){note('这个房间已在另一个房主页面打开，请关闭重复页面后重连。');room.closed=true;closeDirectory();room.clients.forEach(c=>c.end(true));clearInterval(timer);return;}
      store.set('daydream.lease.'+room.code,{id:room.id,at:now});
    }
    if(now-heartbeatAt>7000){heartbeatAt=now;hello();}
    if(room.pending&&now-room.pending.sent>10000){if(['poolProposal','applyConfig'].includes(room.pending.data.action))window.NumericStart?.failed?.('未收到房主确认，草稿已保留；连接恢复后请重试。');room.pending=null;note('未收到房主确认，请等待连接恢复后重试；不会在离线时自动开箱。');}
    if(room.quotePending&&now-room.quotePending.sent>10000){room.quotePending=null;note('未收到房主确认，请等待连接恢复后重新报价。');adapter?.render();}
    update();
  }
  async function start(code,token,forceWatch=false){
    const ticket=++startTicket;
    code=String(code||'').trim();if(!isAlias(code)&&!C.valid(code))throw Error('房间链接无效，请输入4位数字房间码加入。');
    if(!await ensureName()){note('填写昵称后才能进入房间。');return;}
    if(ticket!==startTicket)return;
    if(isAlias(code)){note('正在查找房间…');code=await resolveAlias(code);}
    if(ticket!==startTicket)return;
    code=C.normalize(code);
    closeDirectory();room.alias='';
    const saved=store.get(storageKey(code));owner=!token&&!forceWatch&&saved&&saved.expires>Date.now()?saved:null;
    guestIdentity=null;room.nextPlayers=[];room.operatorGrant=owner?.operatorGrant||null;
    room.bankerGrant=owner?.bankerGrant||null;room.bankerRequests=Array.isArray(owner?.bankerRequests)?owner.bankerRequests.slice(-64).map(r=>({...r})):[];room.bankerAcks=[];room.quotePending=null;room.bankerRequestAt.clear();
    room.role=owner?'host':token?'player':'watch';room.code=code;room.token=token;room.started=Date.now();
    if(room.role!=='host'){
      const key='daydream.guestIdentity.'+code;let stored=null;guestIdentityPersistent=true;
      try{stored=JSON.parse(sessionStorage.getItem(key));}catch{guestIdentityPersistent=false;}
      if(!stored)stored=memoryIdentities.get(code)||null;
      try{const probe={room:code,check:C.nonce()};if(!stored||!C.valid(stored.code)||!await C.verify(await C.sign(probe,stored.privateKey),stored.pub,stored.code))stored=null;}catch{stored=null;}
      guestIdentity=stored||await C.identity();memoryIdentities.set(code,guestIdentity);
      try{sessionStorage.setItem(key,JSON.stringify(guestIdentity));}catch{guestIdentityPersistent=false;}
      room.id=guestIdentity.code;
    }
    if(room.role!=='host'&&!guestIdentity){try{const key='daydream.peer.'+code+'.'+room.role;room.id=sessionStorage.getItem(key)||room.id;sessionStorage.setItem(key,room.id);}catch{}}
    cipher=await new C.Cipher(code).init();room.topic=await C.topic(code);room.closed=false;
    if(owner){
      const lease=store.get('daydream.lease.'+code);if(lease&&lease.id!==room.id&&Date.now()-lease.at<15000)throw Error('房间已在另一个房主页面打开，请先关闭那个页面，再重新连接');
      room.rev=owner.rev||0;const migrated=adapter.restore(owner.saved);if(migrated){room.rev++;save();}room.ready=true;
    }else adapter.loadPublic({boxes:Array(9).fill(null),opened:[],selected:null,phase:'select',round:0,offer:null,result:null});
    update();connect();tick();timer=setInterval(tick,2000);
    note(room.role==='host'?'房主需保持此页在前台打开。多人联机为试用通道，页面会明确显示掉线状态；未打开的礼物不会发给主播或围观者。':'房间码可多人围观；主播操作权仅由操作链接提供。请保持页面前台打开，等待房主同步。');
    if(guestIdentity&&!guestIdentityPersistent)note('当前浏览器不能保存标签页身份；本页可申请开箱，刷新后需重新申请，请保持本页打开。');
    if(room.role==='host'&&!room.closed){startLobby();claimAlias();}
  }
  async function enter(code,token){if(!await ensureName()){note('填写昵称后才能进入房间。');return;}const u=new URL(location.href);u.hash=new URLSearchParams({room:C.normalize(code),...(token?{play:token}:{view:'1'})});location.href=u.href;location.reload();}
  async function create(){
    if(!await ensureName()){note('填写昵称后才能创建房间。');return;}
    startTicket++;
    $('createRoom').disabled=true;try{if(!crypto.subtle)throw Error('当前浏览器不支持安全联机，请更新微信或浏览器');owner=await C.identity();owner.expires=Date.now()+86400000;adapter.reset();adapter.prepareRoom?.();owner.saved=adapter.save();owner.rev=0;if(!store.set(storageKey(owner.code),owner))throw Error('请允许此网页保存本地数据后再创建房间');history.replaceState(null,'','#'+new URLSearchParams({room:owner.code}));await start(owner.code);}catch(e){closeDirectory();room.closed=true;room.clients.forEach(c=>c.end(true));room.clients=[];clearInterval(timer);note(e.message);room.role='solo';update();}finally{$('createRoom').disabled=false;}
  }
  async function copy(input){const player=input===$('roomLink'),label=player?'开箱邀请':'围观邀请';if(room.role!=='host')return;if(!input.value||$('roomLink').value===$('watchLink').value){note('邀请链接尚未正确生成，请重试生成房间码后再复制。');return;}input.focus?.();input.select();input.setSelectionRange?.(0,input.value.length);try{await navigator.clipboard.writeText(input.value);note('已复制'+label+'，可以粘贴发送。');}catch{try{if(!document.execCommand('copy'))throw Error();note('已复制'+label+'，可以粘贴发送。');}catch{note('请长按上面的'+label+'链接，选择复制。');}}}
  window.DreamRoom={
    get role(){return room.role},get connected(){return room.role==='solo'||room.clients.some(c=>c.connected&&c.roomSubscribed)&&(room.role==='host'||room.ready&&hostFresh());},canPlay,
    createSeries,confirmSeriesNext,endSeries,get series(){return seriesState();},get seriesConfigured(){return room.role==='host'?!!owner?.seriesPool:room.seriesConfigured===true;},
    requestBanker,decideBanker,reclaimBanker,assignBanker,submitQuote,get canQuote(){return canQuote();},get canRequestBanker(){return canRequestBanker();},get bankerRequests(){return publicBankerRequests();},get currentBanker(){return currentBanker();},get bankerRequestStatus(){return [...room.bankerRequests].reverse().find(r=>r.peer===room.id)?.status||null;},get seriesMembers(){return room.role==='host'?[{id:room.code,peer:room.code,name:room.name,role:'host'},...Array.from(room.peers,([id,p])=>({id,name:p.name,role:id===room.playerId?'player':'watch',at:p.at,pub:!!p.pub})).filter(p=>p.pub&&Date.now()-p.at<24000).map(({id,name,role})=>({id,peer:id,name,role}))]:[];},get pendingBox(){const d=room.pending?.data;return d?.action==='box'&&Number.isInteger(d.index)&&d.index>=0&&d.index<9?d.index:null;},
    requestNextPlayer,decideNextPlayer,invitePlayer,get canInvitePlayer(){return room.role==='host'&&!room.closed&&!room.working&&online()&&seatAvailable();},get members(){return room.role==='host'?roster():room.members.map(p=>({...p}));},get nextPlayers(){return publicRequests();},get canRequestNextPlayer(){return canRequestNextPlayer();},get nextPlayerStatus(){return room.nextPlayers.find(r=>r.peer===room.id&&r.gameId===gameState().gameId)?.status||null;},
    get joinIntent(){return room.joinIntent;},get playerInvitation(){return room.role==='host'?linked('player'):null;},
    request(action,index){if(room.role==='solo')return false;if(room.role==='host'){if(action==='reset'){if(room.working||seriesState()?.status==='active'){note('本轮计分对战进行中，请先结算或结束计分对战。');return true;}adapter.reset();room.rev++;save();broadcast();}return true;}if(!canPlay())return true;
      const data={type:'action',id:C.id(),peer:room.id,at:hostNow(),rev:room.rev,action,index,...(guestIdentity&&room.operatorGrant?{grant:room.operatorGrant.epoch}:{})};room.pending={data,sent:Date.now()};update();(guestIdentity?guestPacket(data):C.mac(data,room.token).then(auth=>({data,auth}))).then(publish);note('操作已发送，等待房主确认…');return true;},
    changed(){if(room.role==='host'){room.rev++;const seriesChanged=syncSeriesState();save();broadcast();if(seriesChanged)adapter.render();}},
    init(a){adapter=a;
      nameUI();
      $('createRoom').onclick=create;$('soloMode').onclick=()=>{$('roomPanel').hidden=true;};
      $('joinRoom').onclick=async()=>{if(joining)return;const alias=$('joinCode').value.trim();if(!isAlias(alias)){note('请输入4位数字房间码，例如 1234。');return;}if(!await ensureName()){note('填写昵称后才能进入房间。');return;}if(joining)return;const ticket=++startTicket;joining=true;$('joinRoom').disabled=true;$('createRoom').disabled=true;try{note('正在查找房间…');const code=await resolveAlias(alias);if(ticket===startTicket)await enter(code);}catch(e){if(ticket===startTicket)note(e.message||'查找房间失败，请稍后再试。');}finally{joining=false;$('joinRoom').disabled=false;$('createRoom').disabled=false;}};
      $('joinCode').onkeydown=e=>{if(e.key==='Enter')$('joinRoom').click()};
      $('copyPlayer').onclick=()=>copy($('roomLink'));$('copyWatch').onclick=()=>copy($('watchLink'));
      $('leaveRoom').onclick=()=>{if(confirm('离开房间？房主离开后，其他人将暂停同步。')){closeDirectory();if(room.role==='host')store.set('daydream.lease.'+room.code,null);location.href=new URL('index.html',location.href).href;}};
      $('reconnectRoom').onclick=()=>location.reload();
      window.addEventListener('pagehide',()=>{startTicket++;closeDirectory();if(room.role==='host')store.set('daydream.lease.'+room.code,null);room.clients.forEach(c=>c.end(true));});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)hello();});
      const params=new URLSearchParams(new URL(location.href).search);for(const[k,v]of new URLSearchParams(location.hash.slice(1)))params.set(k,v);
      const intent=params.get('intent')||(params.has('play')||params.has('request')?'player':params.get('view')==='1'?'watch':null);
      room.joinIntent=intent;
      if(intent&&!['player','watch'].includes(intent)){update();note('邀请身份标识无效，请向房主重新索取开箱邀请或围观邀请。');return;}
      const watch=intent==='watch'||params.get('view')==='1',token=watch?null:params.get('play');
      if(intent==='player'&&(!params.get('room')||token&&!/^[A-Za-z0-9_-]{32}$/.test(token)||!token&&params.get('request')!=='1')){update();note('开箱邀请缺少有效操作权限，请让房主重新复制完整开箱邀请；只有房间码会进入围观，不能直接开箱。');return;}
      if(params.get('room'))start(params.get('room'),token,watch||params.get('request')==='1').catch(e=>{room.role='watch';update();note(e.message);});else update();
    }
  };
})();
