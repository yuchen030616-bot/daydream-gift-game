/* Four-digit lobby aliases discover full, signed room identities. */
(function(root){
 'use strict';
 const relays=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt'];
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
  const listeners=new Map(),clients=[],C=RoomCore;let closed=false,readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  for(const url of relays){
   const client=mqtt.connect(url,{clientId:'dream_lobby_'+C.id(),clean:true,connectTimeout:8000,reconnectPeriod:4000,keepalive:25});clients.push(client);
   client.on('connect',()=>{for(const alias of listeners.keys())client.subscribe([topic(alias),topic(alias)+'/ping']);readyResolve();});
   client.on('message',(name,raw)=>{if(closed)return;const alias=name.split('/')[3],handler=listeners.get(alias);if(handler)handler(raw.toString(),name.endsWith('/ping'));});client.on('error',()=>{});
  }
  return {ready,listen(alias,handler){listeners.set(alias,handler);for(const c of clients)if(c.connected)c.subscribe([topic(alias),topic(alias)+'/ping']);},unlisten(alias){listeners.delete(alias);for(const c of clients)if(c.connected)c.unsubscribe([topic(alias),topic(alias)+'/ping']);},send(alias,data,retain=false,ping=false){for(const c of clients)if(c.connected)c.publish(topic(alias)+(ping?'/ping':''),data,{qos:0,retain});},close(){closed=true;listeners.clear();clients.forEach(c=>c.end(true));}};
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function connected(ch){let timer;try{await Promise.race([ch.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('房间码通道暂未连接，请稍后重试。')),10000);})]);}finally{clearTimeout(timer);}}
 async function resolve(alias){
  if(!isAlias(alias))throw Error('请输入4位数字房间码');
  const ch=channel();let finish,timer,collect;const records=new Map();
  try{
   await connected(ch);
   const found=new Promise((yes,no)=>{finish=yes;timer=setTimeout(()=>no(Error('没有找到在线房间，请核对4位数字，并让房主保持页面打开。')),6000);});
   ch.listen(alias,async(raw,ping)=>{if(ping)return;const d=await record(raw,alias);if(!d)return;records.set(d.code,d);if(!collect)collect=setTimeout(()=>finish([...records.values()].sort((a,b)=>a.code.localeCompare(b.code))[0]),350);});
   ch.send(alias,'?',false,true);return await found;
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
     ch.listen(candidate,async(raw,ping)=>{if(ping){if(candidate===alias&&Date.now()-lastPing>500){lastPing=Date.now();announce();}return;}const d=await record(raw,candidate);if(!d||d.code===identity.code)return;occupied=true;
      // Simultaneous claims converge; the losing host receives a new alias.
      if(!allocating&&candidate===alias){if(d.code.localeCompare(identity.code)<0)allocate();else announce();}
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
