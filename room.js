/* Shared game rooms. Only the room owner's signed public state is broadcast.
   Public MQTT relays provide a best-effort transport; no hidden gifts or keys are sent. */
(function(){
  'use strict';
  const C=RoomCore,$=id=>document.getElementById(id);
  const relays=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt'];
  const store={get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}};
  const room={role:'solo',code:'',clients:[],peers:new Map(),rev:0,lastAt:0,lastHost:0,playerId:null,playerSeen:0,pending:null,acks:[],seen:new Set(),id:C.id(),ready:false,working:false,closed:false};
  let adapter,timer,receiveChain=Promise.resolve(),sendChain=Promise.resolve(),heartbeatAt=0,owner=null,cipher,lastBroadcastAt=0,renderKey='';
  const storageKey=code=>'daydream.owner.'+code;
  const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim():'';
  const validName=value=>{const name=cleanName(value);return name&&Array.from(name).length<=16?name:'';};
  room.name=validName(store.get('daydream.nickname'))||'';
  room.members=[];
  let nameDialog,nameInput,nameError,nameResolve;
  function nameUI(){
    if(!document.createElement)return;
    const panel=$('roomPanel');
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
  function linked(role){const u=new URL('index.html',location.href);u.search='?v=20261023-car1500';u.hash=new URLSearchParams({room:room.code,...(role==='player'?{play:owner.token}:{view:'1'})}).toString();return u.href;}
  function canPlay(){return room.role==='solo'||room.role==='player'&&room.ready&&Date.now()-room.lastHost<24000&&room.playerId===room.id&&!room.pending;}
  function update(){
    document.body.dataset.roomRole=room.role;
    const active=room.role!=='solo',host=room.role==='host';
    if($('roomMyName'))$('roomMyName').textContent='我的昵称：'+(room.name||'尚未填写');
    if($('roomMembers')){const members=host?roster():room.members;$('roomMembers').hidden=!active;$('roomMembers').textContent=members.length?members.map(p=>(p.role==='host'?'房主':p.role==='player'?'主播':'围观者')+'：'+(validName(p.name)||'匿名')).join('\n'):'成员名单等待房主同步…';}
    $('createRoom').hidden=active;$('soloMode').hidden=active;$('joinArea').hidden=active;
    $('leaveRoom').hidden=!active;$('reconnectRoom').hidden=!active;
    $('roomLinkArea').hidden=!host;$('watchLinkArea').hidden=!host;
    $('roomCode').textContent=active?C.format(room.code):'';
    const online=room.clients.some(c=>c.connected),fresh=Date.now()-room.lastHost<24000;
    $('roomStatus').textContent=!active?'单人模式':host?(online?'房主 · 等待 / 同步中':'房主 · 正在连接'):!online?'网络连接中…':!fresh?'等待房主上线…':room.role==='player'?(room.playerId===room.id?'主播 · 实时同步':room.playerId?'操作席已被使用':'正在加入操作席…'):'围观 · 实时同步';
    $('roomCount').textContent=!active?'':host||room.ready&&fresh?'在线 '+(room.count||1)+' 人（含房主）':'在线人数待同步';
    $('roomIntro').textContent=!active?'创建房间，把主播操作链接发给主播；其他人输入房间码即可同步围观。':host?'你正在房主观看席。把下方主播链接发给一位主播，房间码可以发给多人围观。':room.role==='player'?'这是主播操作席。你的选箱、开箱和决定会同步给房主及所有围观者。':'你正在围观，开箱、熊二报价和最终结果会实时同步。';
    if(host){$('roomLink').value=linked('player');$('watchLink').value=linked('watch');}
    if(active&&Date.now()-room.started>25000&&(!online||!host&&!fresh))note('暂未连上房间。请确认房主保持页面打开，再点“重新连接”；公共联机通道受网络影响，当前进度不会显示为已同步。');
    const nextRenderKey=room.role+':'+canPlay();if(nextRenderKey!==renderKey){renderKey=nextRenderKey;adapter?.render();}
  }
  function save(){if(room.role!=='host')return;owner.saved=adapter.save();owner.rev=room.rev;owner.expires=Date.now()+86400000;if(!store.set(storageKey(room.code),owner))note('当前浏览器无法保存房间，关闭房主页面后无法恢复本局。');}
  function publish(packet,retain=false){sendChain=sendChain.then(async()=>{if(room.closed)return;const raw=await cipher.seal(packet);for(const client of room.clients)if(client.connected)client.publish(room.topic,raw,{qos:0,retain});}).catch(()=>note('本次同步未发出，正在重试连接。'));return sendChain;}
  function broadcast(){if(room.role!=='host'||room.closed)return;const now=Date.now();for(const[id,p]of room.peers)if(now-p.at>24000)room.peers.delete(id);if(room.playerId&&now-room.playerSeen>24000)room.playerId=null;room.count=1+room.peers.size;room.lastHost=now;
    lastBroadcastAt=Math.max(now,lastBroadcastAt+1);const data={code:room.code,at:lastBroadcastAt,rev:room.rev,state:adapter.publicState(),playerId:room.playerId,count:room.count,acks:room.acks,members:roster()};
    return C.sign(data,owner.privateKey).then(signed=>publish({type:'state',pub:owner.pub,...signed},true));
  }
  async function hello(){if(room.role==='solo'||!cipher)return;if(room.role==='host')return broadcast();const data={type:'presence',id:room.id,at:Date.now(),role:room.role,name:room.name||'匿名'};return publish({data,auth:room.token?await C.mac(data,room.token):null});}
  async function receive(raw){
    const p=await cipher.open(raw),now=Date.now();
    if(p.type==='state'){
      if(room.role==='host')return;
      const d=await C.verify(p,p.pub,room.code);if(!d||d.code!==room.code||Math.abs(now-d.at)>24000||!Number.isInteger(d.rev)||d.rev<room.rev||d.at<=room.lastAt)return;
      const changed=!room.ready||room.rev!==d.rev;room.rev=d.rev;room.lastAt=d.at;room.lastHost=now;room.playerId=d.playerId;room.count=d.count;room.ready=true;
      room.members=Array.isArray(d.members)?d.members.slice(0,200).map(p=>({name:validName(p?.name)||'匿名',role:p?.role==='host'?'host':p?.role==='player'?'player':'watch'})):[{name:'匿名',role:'host'}];
      if(room.pending&&d.acks?.includes(room.pending.data.id)){room.pending=null;note('已同步。');}
      if(changed)adapter.loadPublic(d.state);update();return;
    }
    if(room.role!=='host'||!p.data||Math.abs(now-p.data.at)>24000)return;
    const d=p.data;if(typeof d.id!=='string'||d.id.length>40)return;
    if(d.type==='presence'){
      // An unauthenticated spectator cannot rename the active streamer's identity.
      if(d.id===room.playerId&&!await C.checkMac(d,p.auth,owner.token))return;
      const previous=room.peers.get(d.id),name=validName(d.name)||'匿名';room.peers.set(d.id,{at:now,name});
      if(d.role==='player'&&await C.checkMac(d,p.auth,owner.token)&&(!room.playerId||room.playerId===d.id||now-room.playerSeen>24000)){room.playerId=d.id;room.playerSeen=now;}
      // Reply immediately on first arrival; heartbeat handles established peers.
      if(!room.knownPeers?.has(d.id)||previous?.name!==name){room.knownPeers??=new Set();room.knownPeers.add(d.id);await broadcast();update();}
      return;
    }
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
      const client=mqtt.connect(url,{clientId:'dream_'+C.id(),clean:true,connectTimeout:10000,reconnectPeriod:4000,keepalive:25,resubscribe:true});room.clients.push(client);
      client.on('connect',()=>client.subscribe(room.topic,{qos:0},e=>{if(!e){hello();update();}}));
      client.on('message',(_,raw)=>{receiveChain=receiveChain.then(()=>receive(raw.toString())).catch(()=>{});});
      client.on('error',()=>{});client.on('offline',update);client.on('close',update);
    }
  }
  function tick(){
    const now=Date.now();
    if(room.role==='host'){
      const lease=store.get('daydream.lease.'+room.code);
      if(lease&&lease.id!==room.id&&now-lease.at<15000){note('这个房间已在另一个房主页面打开，请关闭重复页面后重连。');room.closed=true;room.clients.forEach(c=>c.end(true));clearInterval(timer);return;}
      store.set('daydream.lease.'+room.code,{id:room.id,at:now});
    }
    if(now-heartbeatAt>7000){heartbeatAt=now;hello();}
    if(room.pending&&now-room.pending.sent>10000){room.pending=null;note('未收到房主确认，请等待连接恢复后重试；不会在离线时自动开箱。');}
    update();
  }
  async function start(code,token,forceWatch=false){
    code=C.normalize(code);if(!C.valid(code))throw Error('房间码为12位字母和数字，可包含分隔横线');
    if(!await ensureName()){note('填写昵称后才能进入房间。');return;}
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
  }
  async function enter(code,token){if(!await ensureName()){note('填写昵称后才能进入房间。');return;}const u=new URL(location.href);u.hash=new URLSearchParams({room:C.normalize(code),...(token?{play:token}:{view:'1'})});location.href=u.href;location.reload();}
  async function create(){
    if(!await ensureName()){note('填写昵称后才能创建房间。');return;}
    $('createRoom').disabled=true;try{if(!crypto.subtle)throw Error('当前浏览器不支持安全联机，请更新微信或浏览器');owner=await C.identity();owner.expires=Date.now()+86400000;adapter.reset();owner.saved=adapter.save();owner.rev=0;if(!store.set(storageKey(owner.code),owner))throw Error('请允许此网页保存本地数据后再创建房间');history.replaceState(null,'','#'+new URLSearchParams({room:owner.code}));await start(owner.code);}catch(e){note(e.message);room.role='solo';update();}finally{$('createRoom').disabled=false;}
  }
  async function copy(input){input.select();try{await navigator.clipboard.writeText(input.value);note('已复制，可以粘贴发送。');}catch{try{if(!document.execCommand('copy'))throw Error();note('已复制，可以粘贴发送。');}catch{note('请长按上面的链接，选择复制。');}}}
  window.DreamRoom={
    get role(){return room.role},canPlay,
    request(action,index){if(room.role==='solo')return false;if(room.role==='host'){if(action==='reset'){adapter.reset();room.rev++;save();broadcast();}return true;}if(!canPlay())return true;
      const data={type:'action',id:C.id(),peer:room.id,at:Date.now(),rev:room.rev,action,index};room.pending={data,sent:Date.now()};update();C.mac(data,room.token).then(auth=>publish({data,auth}));note('操作已发送，等待房主确认…');return true;},
    changed(){if(room.role==='host'){room.rev++;save();broadcast();}},
    init(a){adapter=a;
      nameUI();
      $('createRoom').onclick=create;$('soloMode').onclick=()=>{$('roomPanel').hidden=true;};
      $('joinRoom').onclick=()=>{const code=$('joinCode').value;if(!C.valid(code)){note('请输入完整的12位房间码，例如 XXXX-XXXX-XXXX。');return;}enter(code);};
      $('joinCode').onkeydown=e=>{if(e.key==='Enter')$('joinRoom').click()};
      $('copyPlayer').onclick=()=>copy($('roomLink'));$('copyWatch').onclick=()=>copy($('watchLink'));
      $('leaveRoom').onclick=()=>{if(confirm('离开房间？房主离开后，其他人将暂停同步。')){if(room.role==='host')store.set('daydream.lease.'+room.code,null);location.href=location.pathname+'?v=20261023-car1500';}};
      $('reconnectRoom').onclick=()=>location.reload();
      window.addEventListener('pagehide',()=>{if(room.role==='host')store.set('daydream.lease.'+room.code,null);room.clients.forEach(c=>c.end(true));});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)hello();});
      const params=new URLSearchParams(location.hash.slice(1));if(params.get('room'))start(params.get('room'),params.get('play'),params.get('view')==='1').catch(e=>{room.role='watch';update();note(e.message);});else update();
    }
  };
})();
