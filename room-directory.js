/* Four-digit lobby aliases discover full, signed room identities. */
(function(root){
 'use strict';
 const relays=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt','wss://public.cloud.shiftr.io'];
 const isAlias=s=>/^\d{4}$/.test(String(s||''));
 const topic=alias=>'daydream/lobby/v1/'+alias;
 const randomAlias=()=>{let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294960000);return String(n%10000).padStart(4,'0');};
 async function record(raw,alias){
  try{
   if(typeof raw!=='string'||raw.length>4000)return null;
   const p=JSON.parse(raw),d=JSON.parse(p.data),now=Date.now();
   if(d.kind!=='daydream-room-alias-v1'||d.alias!==alias||!isAlias(d.alias)||!RoomCore.valid(d.code)||!Number.isFinite(d.at)||!Number.isFinite(d.expires)||d.at>now+5000||d.expires<=now||d.expires>d.at+30000)return null;
   if(!await RoomCore.verify(p,p.pub,d.code))return null;
   return {alias:d.alias,code:d.code,pub:p.pub,at:d.at,expires:d.expires};
  }catch{return null;}
 }
 function channel(){
  const listeners=new Map(),clients=[],tasks=new Set(),C=RoomCore;let closed=false,readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  function subscribe(client,alias,entry){
   if(entry.pending.has(client))return entry.pending.get(client);
   const names=[topic(alias),topic(alias)+'/ping'];
   const promise=new Promise((yes,no)=>{
    let timer,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);tasks.delete(cancel);if(error){entry.subscribed.delete(client);no(error);}else{entry.subscribed.add(client);yes();}};
    const cancel=()=>finish(Error('房间码订阅已关闭。'));tasks.add(cancel);
    timer=setTimeout(()=>finish(Error('房间码订阅确认超时，请重新连接。')),4000);
    try{client.subscribe(names,{qos:0},(error,granted)=>{
     if(closed||listeners.get(alias)!==entry||!client.connected)return finish(Error('房间码订阅已断开，请重新连接。'));
     if(error||!Array.isArray(granted)||names.some(name=>!granted.some(g=>g.topic===name&&Number.isInteger(g.qos)&&g.qos>=0&&g.qos<128)))return finish(Error('房间码订阅失败，通道拒绝订阅，请重新连接。'));
     finish();
    });}catch{finish(Error('房间码订阅失败，请重新连接。'));}
   });
   entry.pending.set(client,promise);promise.then(()=>entry.pending.delete(client),()=>entry.pending.delete(client));return promise;
  }
  for(const url of relays){
   const client=mqtt.connect(url,{clientId:'dream_lobby_'+C.id(),...(url.includes('shiftr.io')?{username:'public',password:'public'}:{}),clean:true,connectTimeout:8000,reconnectPeriod:4000,keepalive:25});clients.push(client);
   client.on('connect',()=>{if(closed)return;for(const[alias,entry]of listeners)subscribe(client,alias,entry).catch(error=>{entry.error=error;});readyResolve();});
   const disconnected=()=>{for(const entry of listeners.values())entry.subscribed.delete(client);};client.on('offline',disconnected);client.on('close',disconnected);
   client.on('message',(name,raw)=>{if(closed)return;const alias=name.split('/')[3],entry=listeners.get(alias);if(entry)entry.handler(raw.toString(),name.endsWith('/ping'));});client.on('error',()=>{});
  }
  return {ready,listen(alias,handler){
   const entry={handler,subscribed:new Set(),pending:new Map()};listeners.set(alias,entry);
   const online=clients.filter(c=>c.connected);if(!online.length)return Promise.reject(Error('房间码通道已断开，请重新连接。'));
   return new Promise((yes,no)=>{let failed=0;for(const c of online)subscribe(c,alias,entry).then(yes,error=>{if(++failed===online.length)no(error);});});
  },unlisten(alias){listeners.delete(alias);for(const c of clients)if(c.connected)c.unsubscribe([topic(alias),topic(alias)+'/ping']);},send(alias,data,retain=false,ping=false){const entry=listeners.get(alias);for(const c of clients)if(c.connected&&entry?.subscribed.has(c))c.publish(topic(alias)+(ping?'/ping':''),data,{qos:0,retain});},close(){closed=true;for(const cancel of [...tasks])cancel();listeners.clear();clients.forEach(c=>c.end(true));}};
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function connected(ch){let timer;try{await Promise.race([ch.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('房间码通道暂未连接，请稍后重试。')),10000);})]);}finally{clearTimeout(timer);}}
 async function resolve(alias){
  if(!isAlias(alias))throw Error('请输入4位数字房间码');
  const ch=channel();let finish,timer,collect;const records=new Map();
  try{
   await connected(ch);
   const found=new Promise(yes=>{finish=yes;});
   await ch.listen(alias,async(raw,ping)=>{if(ping)return;const d=await record(raw,alias);if(!d)return;records.set(d.code,d);if(!collect)collect=setTimeout(()=>finish([...records.values()].sort((a,b)=>a.code.localeCompare(b.code))[0]),350);});
   const timeout=new Promise((_,no)=>{timer=setTimeout(()=>no(Error('没有找到在线房间，请核对4位数字，并让房主保持页面打开。')),6000);});
   ch.send(alias,'?',false,true);return await Promise.race([found,timeout]);
  }finally{clearTimeout(timer);clearTimeout(collect);ch.close();}
 }
 async function claim(identity,onAlias){
  const ch=channel();let alias='',closed=false,allocating=false,heartbeat,lastPing=0;
  const announce=async()=>{if(closed||!alias||allocating)return;const at=Date.now(),data={kind:'daydream-room-alias-v1',alias,code:identity.code,at,expires:at+30000};const p=await RoomCore.sign(data,identity.privateKey);if(!closed)ch.send(data.alias,JSON.stringify({...p,pub:identity.pub}),true);};
  async function allocate(preferred){
   if(closed||allocating)return;allocating=true;
   try{
    if(alias)ch.unlisten(alias);
    for(let attempt=0;attempt<30&&!closed;attempt++){
     const candidate=attempt===0&&isAlias(preferred)?preferred:randomAlias();let occupied=false;
     await ch.listen(candidate,async(raw,ping)=>{if(ping){if(candidate===alias&&Date.now()-lastPing>500){lastPing=Date.now();announce().catch(()=>{});}return;}const d=await record(raw,candidate);if(!d||d.code===identity.code)return;occupied=true;
      // Simultaneous claims converge; the losing host receives a new alias.
      if(!allocating&&candidate===alias){if(d.code.localeCompare(identity.code)<0)allocate().catch(()=>{closed=true;clearInterval(heartbeat);ch.close();});else announce().catch(()=>{});}
     });
     ch.send(candidate,'?',false,true);await delay(1500);
     if(closed){ch.unlisten(candidate);return;}
     if(occupied){ch.unlisten(candidate);continue;}
     alias=candidate;allocating=false;onAlias(alias);await announce();return;
    }
    if(!closed)throw Error('暂时无法分配房间码，请重新连接。');
   }finally{allocating=false;}
  }
  try{await connected(ch);await allocate(identity.alias);heartbeat=setInterval(()=>announce().catch(()=>{}),7000);}
  catch(e){closed=true;ch.close();throw e;}
  return {close(){closed=true;clearInterval(heartbeat);ch.close();},get alias(){return alias;}};
 }
 const api={isAlias,randomAlias,record,resolve,claim};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RoomDirectory=api;
})(typeof window!=='undefined'?window:null);
