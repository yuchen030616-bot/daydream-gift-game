/* Local room shortcuts. Signing/exchange keys never enter public list records. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlackjackRecents=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const LIST_KEY='blackjack.recentRooms.v1',CREDENTIAL_PREFIX='blackjack.resume.',MAX_ROOMS=10,MAX_AGE=30*24*60*60*1000;
 const normalize=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
 const validRoom=value=>/^[A-HJ-NP-Z2-9]{12}$/.test(value);
 const clone=value=>JSON.parse(JSON.stringify(value));
 function create(options={}){
  const storage=options.storage||(typeof localStorage!=='undefined'?localStorage:null),now=options.now||(()=>Date.now());
  const time=()=>{const value=now();return Number.isFinite(value)&&value>=0?Math.floor(value):Date.now();};
  function read(key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
  function write(key,value){try{if(!storage)return false;storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  function sanitize(raw){
   if(!raw||typeof raw!=='object')return null;const roomId=normalize(raw.roomId);if(!validRoom(roomId))return null;
   const code=typeof raw.code==='string'&&/^\d{4}$/.test(raw.code)?raw.code:'';
   const name=typeof raw.name==='string'?Array.from(raw.name.trim().replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'')).slice(0,16).join(''):'';
   const role=['host','player','watch'].includes(raw.role)?raw.role:'watch';
   const lastJoinedAt=Number.isSafeInteger(raw.lastJoinedAt)&&raw.lastJoinedAt>=0?raw.lastJoinedAt:0;
   return{roomId,code,name,role,lastJoinedAt};
  }
  function list(){const source=read(LIST_KEY);if(!Array.isArray(source))return[];const seen=new Set(),out=[];for(const raw of source){const item=sanitize(raw);if(item&&!seen.has(item.roomId)){seen.add(item.roomId);out.push(item);}}return out.sort((a,b)=>b.lastJoinedAt-a.lastJoinedAt).slice(0,MAX_ROOMS);}
  function remember(raw){const item=sanitize({...raw,lastJoinedAt:time()});if(!item)return false;return write(LIST_KEY,[item,...list().filter(x=>x.roomId!==item.roomId)].sort((a,b)=>b.lastJoinedAt-a.lastJoinedAt).slice(0,MAX_ROOMS));}
  function saveCredentials(room,raw){
   const roomId=normalize(room),identity=raw?.identity,exchange=raw?.exchange;
   if(!validRoom(roomId)||!validRoom(identity?.code)||typeof identity.pub!=='string'||identity.pub.length>512||!identity.pub||!identity.privateKey||typeof identity.privateKey!=='object'||Array.isArray(identity.privateKey)||typeof exchange?.pub!=='string'||exchange.pub.length>512||!exchange.pub||!exchange.privateKey||typeof exchange.privateKey!=='object'||Array.isArray(exchange.privateKey))return false;
   const at=time(),record={version:1,roomId,savedAt:at,expiresAt:at+MAX_AGE,identity:{code:identity.code,pub:identity.pub,privateKey:identity.privateKey,...(typeof identity.token==='string'?{token:identity.token}:{})},exchange:{pub:exchange.pub,privateKey:exchange.privateKey}};
   return write(CREDENTIAL_PREFIX+roomId,record);
  }
  function credentials(room){
   const roomId=normalize(room);if(!validRoom(roomId))return null;const raw=read(CREDENTIAL_PREFIX+roomId);
   if(!raw||raw.version!==1||raw.roomId!==roomId||!Number.isSafeInteger(raw.expiresAt)||raw.expiresAt<=time()||!Number.isSafeInteger(raw.savedAt)||raw.savedAt>time()+24*60*60*1000||!validRoom(raw.identity?.code)||typeof raw.identity.pub!=='string'||!raw.identity.privateKey||typeof raw.exchange?.pub!=='string'||!raw.exchange.privateKey)return null;
   // The caller verifies the signature and ECDH keys before restoring authority.
   return clone({identity:raw.identity,exchange:raw.exchange});
  }
  function forget(room){const roomId=normalize(room);if(!validRoom(roomId))return false;return write(LIST_KEY,list().filter(x=>x.roomId!==roomId));}
  return Object.freeze({list,remember,saveCredentials,credentials,forget});
 }
 return Object.freeze({create,LIST_KEY,CREDENTIAL_PREFIX,MAX_ROOMS,MAX_AGE});
});
