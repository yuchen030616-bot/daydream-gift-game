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
  const monotonic=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const validNonce=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{22}$/.test(value);
  Object.assign(room,{hostOffset:0,clockSynced:false,syncNonce:'',syncIssued:0,syncProof:'',challenges:new Map(),receivedStates:0,applyErrors:0});
  const hostNow=()=>room.clockSynced?room.hostEpoch+(monotonic()-room.hostEpochMono):Date.now();
  const hostFresh=()=>room.lastHost>0&&monotonic()-room.lastHostMono<24000;
  function ensureSync(){if(!room.syncNonce||!room.clockSynced&&monotonic()-room.syncIssued>10000){room.syncNonce=C.nonce();room.syncIssued=monotonic();room.syncProof='';}}
  const isAlias=value=>typeof value==='string'&&/^[0-9]{4}$/.test(value);
  let directoryHandle=null,directoryEpoch=0,joining=false,startTicket=0;
  function closeDirectory(){directoryEpoch++;directoryHandle?.close();directoryHandle=null;}
  function claimAlias(){
    if(!window.RoomDirectory||room.role!=='host'||room.closed)return;
    closeDirectory();const epoch=directoryEpoch,claimOwner=owner,code=room.code;
    Promise.resolve().then(()=>window.RoomDirectory.claim({code,pub:claimOwner.pub,privateKey:claimOwner.privateKey,...(isAlias(claimOwner.alias)?{alias:claimOwner.alias}:{})},alias=>{
      if(epoch!==directoryEpoch||room.closed||room.role!=='host'||room.code!==code||!isAlias(alias))return;
      room.alias=alias;claimOwner.alias=alias;save();update();broadcast();
    })).then(handle=>{if(epoch!==directoryEpoch||room.closed)handle.close();else directoryHandle=handle;}).catch(()=>{
      if(epoch===directoryEpoch&&!room.closed){room.alias='';update();note('4位房间码暂未生成，请稍后重新连接；下方主播链接和围观链接仍可使用。');}
    });
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
    return ['版本：20261023-adminlock','角色：'+room.role,'房间信息：'+(!!room.code),'操作链接：'+(!!room.token),
      '安全加密：'+(!!globalThis.crypto?.subtle),'WebSocket：'+(typeof WebSocket!=='undefined'),
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
    const identity=document.createElement('div');identity.className='room-identity';
    const me=document.createElement('span');me.id='roomMyName';
    const rename=document.createElement('button');rename.type='button';rename.textContent='修改昵称';rename.onclick=async()=>{if(await ensureName(true)){update();if(room.role!=='solo')hello();}};
    identity.append(me,rename);panel.append(identity);
    const members=document.createElement('p');members.id='roomMembers';members.className='room-members';members.setAttribute('aria-live','polite');panel.append(members);
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
  function roster(){return [{name:room.name||'匿名',role:'host'},...Array.from(room.peers,([id,p])=>({name:p.name||'匿名',role:id===room.playerId?'player':'watch'}))];}
  function note(s){$('roomNotice').textContent=s;}
  function linked(role){const u=new URL('index.html',location.href);u.search='?v=20261023-adminlock';u.hash=new URLSearchParams({room:room.code,...(isAlias(room.alias)?{code:room.alias}:{}),...(role==='player'?{play:owner.token}:{view:'1'})}).toString();return u.href;}
  function canPlay(){return room.role==='solo'||room.role==='player'&&room.ready&&hostFresh()&&room.playerId===room.id&&!room.pending;}
  function update(){
    document.body.dataset.roomRole=room.role;
    const active=room.role!=='solo',host=room.role==='host';
    if($('roomDiagnosticText'))$('roomDiagnosticText').textContent=diagnostics();
    if($('roomMyName'))$('roomMyName').textContent='我的昵称：'+(room.name||'尚未填写');
    if($('roomMembers')){const members=host?roster():room.members;$('roomMembers').hidden=!active;$('roomMembers').textContent=members.length?members.map(p=>(p.role==='host'?'房主':p.role==='player'?'主播':'围观者')+'：'+(validName(p.name)||'匿名')).join('\n'):'成员名单等待房主同步…';}
    $('createRoom').hidden=active;$('soloMode').hidden=active;$('joinArea').hidden=active;
    $('leaveRoom').hidden=!active;$('reconnectRoom').hidden=!active;
    $('roomLinkArea').hidden=!host;$('watchLinkArea').hidden=!host;
    $('roomCode').textContent=active?(isAlias(room.alias)?room.alias:host?'生成中…':'等待4位房间码…'):'';
    const online=room.clients.some(c=>c.connected&&c.roomSubscribed),fresh=hostFresh();
    $('roomStatus').textContent=!active?'单人模式':host?(online?'房主 · 等待 / 同步中':'房主 · 正在连接'):!online?'网络连接中…':!fresh?'等待房主上线…':room.role==='player'?(room.playerId===room.id?'主播 · 实时同步':room.playerId?'操作席已被使用':'正在加入操作席…'):'围观 · 实时同步';
    $('roomCount').textContent=!active?'':host||room.ready&&fresh?'在线 '+(room.count||1)+' 人（含房主）':'在线人数待同步';
    $('roomIntro').textContent=!active?'创建房间，把主播操作链接发给主播；其他人输入4位数字房间码即可同步围观。':host?'你正在房主观看席。把下方主播链接发给一位主播，4位数字房间码可以发给多人围观。':room.role==='player'?'这是主播操作席。你的选箱、开箱和决定会同步给房主及所有围观者。':'你正在围观，开箱、熊二报价和最终结果会实时同步。';
    if(host){$('roomLink').value=linked('player');$('watchLink').value=linked('watch');}
    if(active&&Date.now()-room.started>25000&&(!online||!host&&!fresh))note('暂未连上房间。请确认房主保持页面打开，再点“重新连接”；公共联机通道受网络影响，当前进度不会显示为已同步。');
    const nextRenderKey=room.role+':'+canPlay();if(nextRenderKey!==renderKey){renderKey=nextRenderKey;adapter?.render();}
  }
  function save(){if(room.role!=='host')return;owner.saved=adapter.save();owner.rev=room.rev;owner.expires=Date.now()+86400000;if(!store.set(storageKey(room.code),owner))note('当前浏览器无法保存房间，关闭房主页面后无法恢复本局。');}
  function publish(packet,retain=false){sendChain=sendChain.then(async()=>{if(room.closed)return;const raw=await cipher.seal(packet);for(const client of room.clients)if(client.connected)client.publish(room.topic,raw,{qos:0,retain});}).catch(()=>note('本次同步未发出，正在重试连接。'));return sendChain;}
  function broadcast(){if(room.role!=='host'||room.closed)return;const now=Date.now();for(const[id,p]of room.peers)if(now-p.at>24000)room.peers.delete(id);if(room.playerId&&now-room.playerSeen>24000)room.playerId=null;room.count=1+room.peers.size;room.lastHost=now;
    for(const[id,c]of room.challenges)if(monotonic()-c.issued>30000)room.challenges.delete(id);
    const syncReplies=Array.from(room.challenges,([peer,c])=>({peer,nonce:c.nonce,challenge:c.challenge}));
    lastBroadcastAt=Math.max(now,lastBroadcastAt+1);const data={code:room.code,alias:isAlias(room.alias)?room.alias:null,at:lastBroadcastAt,rev:room.rev,state:adapter.publicState(),playerId:room.playerId,count:room.count,acks:room.acks,members:roster(),syncReplies};
    return C.sign(data,owner.privateKey).then(signed=>publish({type:'state',pub:owner.pub,...signed},true));
  }
  async function hello(){if(room.role==='solo'||!cipher)return;if(room.role==='host')return broadcast();ensureSync();const data={type:'presence',id:room.id,at:hostNow(),role:room.role,name:room.name||'匿名',sync:room.syncNonce,...(room.syncProof?{proof:room.syncProof}:{})};return publish({data,auth:room.token?await C.mac(data,room.token):null});}
  async function receive(raw){
    const p=await cipher.open(raw),now=Date.now();
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
      if(isAlias(d.alias))room.alias=d.alias;
      room.members=Array.isArray(d.members)?d.members.slice(0,200).map(p=>({name:validName(p?.name)||'匿名',role:p?.role==='host'?'host':p?.role==='player'?'player':'watch'})):[{name:'匿名',role:'host'}];
      if(room.pending&&d.acks?.includes(room.pending.data.id)){room.pending=null;note('已同步。');}
      const proofChanged=reply&&room.syncProof!==reply.challenge;if(proofChanged)room.syncProof=reply.challenge;
      update();if(proofChanged)hello();return;
    }
    if(room.role!=='host'||!p.data)return;
    const d=p.data;if(typeof d.id!=='string'||d.id.length>40)return;
    const fresh=Number.isFinite(d.at)&&Math.abs(now-d.at)<=24000;
    if(d.type==='presence'){
      const sync=validNonce(d.sync);if(d.sync!==undefined&&!sync)return;if(!fresh&&!sync)return;
      const playerAuth=d.role==='player'&&await C.checkMac(d,p.auth,owner.token);
      if(d.role==='player'&&!playerAuth)return;
      // An unauthenticated spectator cannot rename the active streamer's identity.
      if(d.id===room.playerId&&!playerAuth)return;
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
      const previous=room.peers.get(d.id),name=validName(d.name)||'匿名';room.peers.set(d.id,{at:now,name});
      if(playerAuth&&(!room.playerId||room.playerId===d.id||now-room.playerSeen>24000)){room.playerId=d.id;room.playerSeen=now;}
      // Reply immediately on first arrival; heartbeat handles established peers.
      if(!room.knownPeers?.has(d.id)||previous?.name!==name){room.knownPeers??=new Set();room.knownPeers.add(d.id);await broadcast();update();}
      return;
    }
    if(!fresh)return;
    if(d.type!=='action'||!await C.checkMac(d,p.auth,owner.token))return;
    if(room.seen.has(d.id)){await broadcast();return;}
    room.seen.add(d.id);if(room.seen.size>256)room.seen.delete(room.seen.values().next().value);
    if(d.peer!==room.playerId||now-room.playerSeen>24000||d.rev!==room.rev||room.working){room.acks.push(d.id);room.acks=room.acks.slice(-16);await broadcast();return;}
    room.working=true;
    try{await adapter.act(d.action,d.index);}catch{note('主播的这次操作已过期，已同步当前进度。');}
    finally{room.working=false;room.acks.push(d.id);room.acks=room.acks.slice(-16);room.rev++;save();await broadcast();update();}
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
    if(room.pending&&now-room.pending.sent>10000){room.pending=null;note('未收到房主确认，请等待连接恢复后重试；不会在离线时自动开箱。');}
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
    room.role=owner?'host':token?'player':'watch';room.code=code;room.token=token;room.started=Date.now();
    if(room.role!=='host'){try{const key='daydream.peer.'+code+'.'+room.role;room.id=sessionStorage.getItem(key)||room.id;sessionStorage.setItem(key,room.id);}catch{}}
    cipher=await new C.Cipher(code).init();room.topic=await C.topic(code);room.closed=false;
    if(owner){
      const lease=store.get('daydream.lease.'+code);if(lease&&lease.id!==room.id&&Date.now()-lease.at<15000)throw Error('房间已在另一个房主页面打开，请先关闭那个页面，再重新连接');
      room.rev=owner.rev||0;const migrated=adapter.restore(owner.saved);if(migrated){room.rev++;save();}room.ready=true;
    }else adapter.loadPublic({boxes:Array(9).fill(null),opened:[],selected:null,phase:'select',round:0,offer:null,result:null});
    update();connect();tick();timer=setInterval(tick,2000);
    note(room.role==='host'?'房主需保持此页在前台打开。多人联机为试用通道，页面会明确显示掉线状态；未打开的礼物不会发给主播或围观者。':'房间码可多人围观；主播操作权仅由操作链接提供。请保持页面前台打开，等待房主同步。');
    if(room.role==='host'&&!room.closed)claimAlias();
  }
  async function enter(code,token){if(!await ensureName()){note('填写昵称后才能进入房间。');return;}const u=new URL(location.href);u.hash=new URLSearchParams({room:C.normalize(code),...(token?{play:token}:{view:'1'})});location.href=u.href;location.reload();}
  async function create(){
    if(!await ensureName()){note('填写昵称后才能创建房间。');return;}
    startTicket++;
    $('createRoom').disabled=true;try{if(!crypto.subtle)throw Error('当前浏览器不支持安全联机，请更新微信或浏览器');owner=await C.identity();owner.expires=Date.now()+86400000;adapter.reset();adapter.prepareRoom?.();owner.saved=adapter.save();owner.rev=0;if(!store.set(storageKey(owner.code),owner))throw Error('请允许此网页保存本地数据后再创建房间');history.replaceState(null,'','#'+new URLSearchParams({room:owner.code}));await start(owner.code);}catch(e){closeDirectory();room.closed=true;room.clients.forEach(c=>c.end(true));room.clients=[];clearInterval(timer);note(e.message);room.role='solo';update();}finally{$('createRoom').disabled=false;}
  }
  async function copy(input){input.select();try{await navigator.clipboard.writeText(input.value);note('已复制，可以粘贴发送。');}catch{try{if(!document.execCommand('copy'))throw Error();note('已复制，可以粘贴发送。');}catch{note('请长按上面的链接，选择复制。');}}}
  window.DreamRoom={
    get role(){return room.role},canPlay,
    request(action,index){if(room.role==='solo')return false;if(room.role==='host'){if(action==='reset'){adapter.reset();room.rev++;save();broadcast();}return true;}if(!canPlay())return true;
      const data={type:'action',id:C.id(),peer:room.id,at:hostNow(),rev:room.rev,action,index};room.pending={data,sent:Date.now()};update();C.mac(data,room.token).then(auth=>publish({data,auth}));note('操作已发送，等待房主确认…');return true;},
    changed(){if(room.role==='host'){room.rev++;save();broadcast();}},
    init(a){adapter=a;
      nameUI();
      $('createRoom').onclick=create;$('soloMode').onclick=()=>{$('roomPanel').hidden=true;};
      $('joinRoom').onclick=async()=>{if(joining)return;const alias=$('joinCode').value.trim();if(!isAlias(alias)){note('请输入4位数字房间码，例如 1234。');return;}if(!await ensureName()){note('填写昵称后才能进入房间。');return;}if(joining)return;const ticket=++startTicket;joining=true;$('joinRoom').disabled=true;$('createRoom').disabled=true;try{note('正在查找房间…');const code=await resolveAlias(alias);if(ticket===startTicket)await enter(code);}catch(e){if(ticket===startTicket)note(e.message||'查找房间失败，请稍后再试。');}finally{joining=false;$('joinRoom').disabled=false;$('createRoom').disabled=false;}};
      $('joinCode').onkeydown=e=>{if(e.key==='Enter')$('joinRoom').click()};
      $('copyPlayer').onclick=()=>copy($('roomLink'));$('copyWatch').onclick=()=>copy($('watchLink'));
      $('leaveRoom').onclick=()=>{if(confirm('离开房间？房主离开后，其他人将暂停同步。')){closeDirectory();if(room.role==='host')store.set('daydream.lease.'+room.code,null);location.href=location.pathname+'?v=20261023-adminlock';}};
      $('reconnectRoom').onclick=()=>location.reload();
      window.addEventListener('pagehide',()=>{startTicket++;closeDirectory();if(room.role==='host')store.set('daydream.lease.'+room.code,null);room.clients.forEach(c=>c.end(true));});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)hello();});
      const params=new URLSearchParams(location.hash.slice(1));if(params.get('room'))start(params.get('room'),params.get('play'),params.get('view')==='1').catch(e=>{room.role='watch';update();note(e.message);});else update();
    }
  };
})();
