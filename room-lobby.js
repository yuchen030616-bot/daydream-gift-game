/* Public, owner-signed presence directory. Transport is public; never pass game snapshots. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./room-core.js'),typeof globalThis!=='undefined'?globalThis:root);
 else root.RoomLobby=factory(root.RoomCore,root);
})(typeof window!=='undefined'?window:globalThis,function(C,env){
 'use strict';
 const PREFIX='daydream/rooms/v1/',FILTER=PREFIX+'+',TTL=30000,HEARTBEAT=7000;
 const RELAYS=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt','wss://public.cloud.shiftr.io'];
 const phases=['select','open','pricing','offer','final','ended'];
 const exactCode=v=>typeof v==='string'&&/^[A-HJ-NP-Z2-9]{12}$/.test(v);
 const alias=v=>v===null||typeof v==='string'&&/^\d{4}$/.test(v);
 const name=v=>typeof v==='string'&&Array.from(v).length>=1&&Array.from(v).length<=16&&!/[\u0000-\u001f\u007f-\u009f<>]/.test(v)&&v.trim()===v;
 function metadata(m){
  if(!m||!alias(m.alias??null)||!name(m.hostName)||!Number.isInteger(m.count)||m.count<1||m.count>10000||!['gift','money','drink'].includes(m.mode)||!phases.includes(m.phase))throw Error('在线房间信息无效');
  return {alias:m.alias??null,hostName:m.hostName,count:m.count,mode:m.mode,phase:m.phase};
 }
 function watchUrl(code,base){if(!exactCode(code))throw Error('房间信息无效');const u=new URL('watch.html',base||env.location?.href||'https://yuchen030616-bot.github.io/daydream-gift-game/');u.search='';u.hash=new URLSearchParams({room:code,view:'1'}).toString();return u.href;}
 async function record(raw,topic,now=Date.now()){
  try{
   if(typeof raw!=='string'||raw.length>250000)return null;
   const p=JSON.parse(raw);if(typeof p.data!=='string'||typeof p.pub!=='string'||p.pub.length>150)return null;
   const d=JSON.parse(p.data),allowed=['kind','code','alias','hostName','count','mode','phase','at','expires','online'];
   if(!d||Object.keys(d).some(k=>!allowed.includes(k))||d.kind!=='daydream-room-presence-v1'||!exactCode(d.code)||topic!==PREFIX+d.code||typeof d.online!=='boolean'||!Number.isSafeInteger(d.at)||!Number.isSafeInteger(d.expires)||d.at>now+5000||d.expires<=now||d.expires<=d.at||d.expires-d.at>TTL)return null;
   const m=metadata(d);if(!await C.verify(p,p.pub,d.code))return null;const authority=await C.authority(p,d.code);if(!authority)return null;
   return {code:d.code,...m,at:d.at,expires:d.expires,online:d.online,chain:p.chain||[],authoritySeq:authority.seq,chainId:authority.chainId,prefixIds:authority.prefixIds};
  }catch{return null;}
 }
 function transport(listen,onMessage,onStatus){
  if(!C||!env.mqtt?.connect)throw Error('在线目录组件未加载，请刷新网页。');
  let closed=false;const clients=[];
  const status=()=>{try{onStatus?.({connected:clients.some(c=>c.connected&&(!listen||c.lobbySubscribed)),routes:clients.map(c=>({connected:!!c.connected,subscribed:!!c.lobbySubscribed}))});}catch{}};
  for(const url of RELAYS){
   const c=env.mqtt.connect(url,{clientId:'dream_rooms_'+C.id(),...(url.includes('shiftr.io')?{username:'public',password:'public'}:{}),clean:true,connectTimeout:8000,reconnectPeriod:4000,keepalive:25});clients.push(c);c.lobbySubscribed=false;
   const subscribe=()=>{
    clearTimeout(c.lobbyRetry);clearTimeout(c.lobbyAck);if(closed||!c.connected)return;
    if(!listen){onMessage?.();status();return;}
    let done=false;const generation=(c.lobbyGeneration||0)+1;c.lobbyGeneration=generation;
    const finish=(error,granted)=>{if(done||closed||generation!==c.lobbyGeneration)return;done=true;clearTimeout(c.lobbyAck);c.lobbySubscribed=!error&&c.connected&&Array.isArray(granted)&&granted.some(g=>g.topic===FILTER&&Number.isInteger(g.qos)&&g.qos>=0&&g.qos<128);if(!c.lobbySubscribed&&c.connected)c.lobbyRetry=setTimeout(subscribe,2000);status();};
    c.lobbyAck=setTimeout(()=>finish(Error('目录订阅超时')),4000);
    try{c.subscribe(FILTER,{qos:0},finish);}catch(e){finish(e);}
   };
   c.on('connect',subscribe);
   const offline=()=>{c.lobbyGeneration=(c.lobbyGeneration||0)+1;c.lobbySubscribed=false;clearTimeout(c.lobbyRetry);clearTimeout(c.lobbyAck);status();};
   c.on('offline',offline);c.on('close',offline);c.on('error',status);
   c.on('message',(topic,raw)=>{if(!closed&&c.lobbySubscribed&&typeof topic==='string'&&topic.startsWith(PREFIX))onMessage(raw.toString(),topic);});
  }
  return {get connected(){return clients.some(c=>c.connected&&(!listen||c.lobbySubscribed));},send(topic,raw){if(closed)return;for(const c of clients)if(c.connected)try{c.publish(topic,raw,{qos:0,retain:true});}catch{}},close(){if(closed)return;closed=true;for(const c of clients){clearTimeout(c.lobbyRetry);clearTimeout(c.lobbyAck);c.end(true);}}};
 }
 function advertise(identity,getMetadata,options={}){
  if(!exactCode(identity?.code)||typeof identity.pub!=='string'||!identity.privateKey||typeof getMetadata!=='function')throw Error('只有房主签名身份可以发布目录');
  // Capture only required local credentials, never serialize the identity object.
  const {code,pub,privateKey}=identity,hostChain=identity.chain||[];let closed=false,lastAt=0,chain=Promise.resolve(),transportHandle;
  const update=()=>{if(closed)return Promise.resolve(false);chain=chain.catch(()=>{}).then(async()=>{
   if(closed)return false;const m=metadata(getMetadata()),at=Math.max(Date.now(),lastAt+1);lastAt=at;
   const signed=await C.sign({kind:'daydream-room-presence-v1',code,...m,at,expires:at+TTL,online:true},privateKey);
   if(closed)return false;transportHandle.send(PREFIX+code,JSON.stringify({...signed,pub,...(hostChain.length?{chain:hostChain}:{})}));return transportHandle.connected;
  });return chain;};
  transportHandle=transport(false,()=>{update().catch(()=>{});},options.onStatus);
  const timer=setInterval(()=>update().catch(()=>{}),HEARTBEAT);update().catch(()=>{});
  return {update,get connected(){return transportHandle.connected;},close(){if(closed)return;closed=true;clearInterval(timer);transportHandle.close();}};
 }
 function subscribe(onChange,options={}){
  if(typeof onChange!=='function')throw Error('在线目录需要更新回调');
  const rooms=new Map(),latest=new Map(),authorityPins=new Map();let closed=false,chain=Promise.resolve(),pending=0;
  const snapshot=()=>[...rooms.values()].sort((a,b)=>b.at-a.at||a.code.localeCompare(b.code)).map(r=>({...r,watchUrl:watchUrl(r.code,options.baseUrl)}));
  const notify=()=>{if(!closed)try{onChange(snapshot());}catch{}};
  const sweep=()=>{let changed=false;const now=Date.now();for(const[code,r]of rooms)if(r.expires<=now){rooms.delete(code);changed=true;}for(const[code,t]of latest)if(t+TTL+5000<now)latest.delete(code);if(changed)notify();};
  const receive=(raw,topic)=>{if(closed||pending>=256)return;pending++;chain=chain.then(async()=>{if(closed)return;const r=await record(raw,topic);if(closed||!r||r.expires<=Date.now())return;const previous=authorityPins.get(r.code);if(previous&&(r.authoritySeq<previous.seq||r.authoritySeq===previous.seq&&r.chainId!==previous.chainId||r.authoritySeq>previous.seq&&previous.seq>0&&!r.prefixIds.includes(previous.chainId)))return;const upgrade=previous&&r.authoritySeq>previous.seq;if(!upgrade&&r.at<=(latest.get(r.code)??-Infinity)||!previous&&authorityPins.size>=2000||latest.size>=2000&&!latest.has(r.code))return;if(r.online&&rooms.size>=1000&&!rooms.has(r.code))return;authorityPins.set(r.code,{seq:r.authoritySeq,chainId:r.chainId});latest.set(r.code,r.at);if(r.online)rooms.set(r.code,r);else rooms.delete(r.code);notify();}).catch(()=>{}).finally(()=>pending--);};
  const handle=transport(true,receive,options.onStatus),timer=setInterval(sweep,1000);notify();
  return {get rooms(){sweep();return snapshot();},get connected(){return handle.connected;},sweep,close(){if(closed)return;closed=true;clearInterval(timer);handle.close();rooms.clear();latest.clear();authorityPins.clear();}};
 }
 return {advertise,subscribe,record,watchUrl,TOPIC:FILTER,TTL,HEARTBEAT};
});
