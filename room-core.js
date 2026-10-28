(function(root){
  'use strict';
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const enc=new TextEncoder(),dec=new TextDecoder();
  const b64=b=>{const data=new Uint8Array(b);let text='';for(let i=0;i<data.length;i+=16384)text+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const normalize=s=>String(s||'').toUpperCase().replace(/[\s-]/g,'');
  const valid=s=>/^[A-HJ-NP-Z2-9]{12}$/.test(normalize(s));
  async function fingerprint(pub){const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(pub)));let out='',bits=0,value=0;for(const n of hash){value=(value<<8)|n;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];if(out.length===12)return out}}}
  class Cipher{
    constructor(code){this.code=normalize(code);if(!valid(this.code))throw Error('请输入完整的12位房间码');}
    async init(){const hash=await crypto.subtle.digest('SHA-256',enc.encode('daydream-room-v1:'+this.code));this.key=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);return this;}
    async seal(data){const iv=crypto.getRandomValues(new Uint8Array(12));const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},this.key,enc.encode(JSON.stringify(data)));return JSON.stringify({iv:b64(iv),body:b64(body)});}
    async open(raw){if(raw.length>250000)throw Error('message too large');const p=JSON.parse(raw);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv)},this.key,bytes(p.body))));}
  }
  async function identity(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const pub=b64(await crypto.subtle.exportKey('raw',pair.publicKey));return{code:await fingerprint(pub),pub,privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),token:b64(crypto.getRandomValues(new Uint8Array(24)))};}
  async function sign(data,jwk){const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const text=JSON.stringify(data);return{data:text,sig:b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(text)))};}
  async function verifySigned(packet,pub){if(typeof packet?.data!=='string'||typeof packet.sig!=='string')return null;const key=await crypto.subtle.importKey('raw',bytes(pub),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(packet.sig),enc.encode(packet.data)))return null;return JSON.parse(packet.data);}
  const authorityCache=new Map(),hostKind='daydream-host-handoff-v1';
  const safePeer=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
  const digest=async value=>b64(await crypto.subtle.digest('SHA-256',enc.encode(value)));
  async function authority(packet,code){
    try{
      const rootCode=normalize(code),pub=packet?.pub,chain=packet?.chain??[];
      if(!valid(rootCode)||typeof pub!=='string'||pub.length>150||!Array.isArray(chain)||chain.length>128)return null;
      const serialized=JSON.stringify(chain);if(serialized.length>180000)return null;
      const cacheKey=rootCode+':'+await digest(pub+':'+serialized);
      if(authorityCache.has(cacheKey)){const cached=authorityCache.get(cacheKey);authorityCache.delete(cacheKey);authorityCache.set(cacheKey,cached);return structuredAuthority(await cached);}
      const task=(async()=>{
        const keyCode=await fingerprint(pub);if(!chain.length)return keyCode===rootCode?{pub,keyCode,seq:0,chainId:rootCode,prefixIds:[]}:null;
        let previousPub=null,previousCode=rootCode,seq=0;const prefixIds=[];
        for(const cert of chain){
          if(!cert||Object.keys(cert).sort().join(',')!=='data,keyCode,pub,sig'||typeof cert.pub!=='string'||cert.pub.length>150||cert.keyCode!==previousCode||previousPub&&cert.pub!==previousPub)return null;
          if(await fingerprint(cert.pub)!==previousCode)return null;
          const d=await verifySigned(cert,cert.pub);
          if(!d||Object.keys(d).sort().join(',')!=='actorPeer,at,code,fromKeyCode,fromPub,kind,seq,toKeyCode,toPub,transferId'||d.kind!==hostKind||d.code!==rootCode||d.fromPub!==cert.pub||d.fromKeyCode!==previousCode||d.seq!==seq+1||!Number.isSafeInteger(d.at)||d.at<=0||!safePeer(d.actorPeer)||typeof d.transferId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(d.transferId)||typeof d.toPub!=='string'||d.toPub.length>150||!valid(d.toKeyCode)||await fingerprint(d.toPub)!==d.toKeyCode||d.toPub===cert.pub)return null;
          previousPub=d.toPub;previousCode=d.toKeyCode;seq=d.seq;prefixIds.push(await digest(JSON.stringify([cert.pub,cert.keyCode,cert.data,b64(bytes(cert.sig))])));
        }
        if(previousPub!==pub||previousCode!==keyCode)return null;
        return {pub,keyCode,seq,chainId:prefixIds.at(-1),prefixIds};
      })();
      authorityCache.set(cacheKey,task);while(authorityCache.size>256)authorityCache.delete(authorityCache.keys().next().value);
      return structuredAuthority(await task);
    }catch{return null;}
  }
  function structuredAuthority(value){return value?{...value,prefixIds:[...value.prefixIds]}:null;}
  async function verify(packet,pub,code){try{const auth=await authority({...packet,pub},code);if(!auth)return null;return await verifySigned(packet,pub);}catch{return null;}}
  async function authorizeHost(identity,target,{transferId,seq,actorPeer,at}={}){
    const rootCode=normalize(identity.code),auth=await authority({pub:identity.pub,chain:identity.chain||[]},rootCode),toKeyCode=target.keyCode||target.code;
    if(!auth||auth.seq>=128||seq!==auth.seq+1||await fingerprint(target.pub)!==toKeyCode||!safePeer(actorPeer)||!Number.isSafeInteger(at)||at<=0||typeof transferId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(transferId)||target.pub===identity.pub)throw Error('房主交接授权无效');
    const data={kind:hostKind,code:rootCode,fromPub:identity.pub,fromKeyCode:auth.keyCode,toPub:target.pub,toKeyCode,seq,transferId,actorPeer,at};
    return {pub:identity.pub,keyCode:auth.keyCode,...await sign(data,identity.privateKey)};
  }
  async function exchangeIdentity(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return {pub:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};}
  function contextBytes(context){if(typeof context!=='string'||!context.length||context.length>2048)throw Error('交接上下文无效');return enc.encode(context);}
  async function sealFor(data,recipientExchangePub,context){
    const additionalData=contextBytes(context),text=JSON.stringify(data);if(typeof text!=='string'||text.length>262144)throw Error('交接资料过大');
    const recipient=await crypto.subtle.importKey('raw',bytes(recipientExchangePub),{name:'ECDH',namedCurve:'P-256'},false,[]),pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']),key=await crypto.subtle.deriveKey({name:'ECDH',public:recipient},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
    return {pub:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),iv:b64(iv),body:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,enc.encode(text)))};
  }
  async function openFor(packet,exchangePrivateKey,context){
    const additionalData=contextBytes(context);if(!packet||Object.keys(packet).sort().join(',')!=='body,iv,pub'||typeof packet.pub!=='string'||packet.pub.length>150||typeof packet.body!=='string'||packet.body.length>1500000||typeof packet.iv!=='string'||bytes(packet.iv).length!==12)throw Error('交接密文无效');
    const privateKey=await crypto.subtle.importKey('jwk',exchangePrivateKey,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey']),sender=await crypto.subtle.importKey('raw',bytes(packet.pub),{name:'ECDH',namedCurve:'P-256'},false,[]),key=await crypto.subtle.deriveKey({name:'ECDH',public:sender},privateKey,{name:'AES-GCM',length:256},false,['decrypt']);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(packet.iv),additionalData},key,bytes(packet.body))));
  }
  async function mac(data,token){const key=await crypto.subtle.importKey('raw',bytes(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(JSON.stringify(data))));}
  async function checkMac(data,sig,token){const key=await crypto.subtle.importKey('raw',bytes(token),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,bytes(sig||''),enc.encode(JSON.stringify(data)));}
  function publicState(game){
    const gift=g=>g&&({name:g.name,icon:g.icon,...(g.kind==='money'||g.kind==='drink'?{kind:g.kind,value:g.value}:{}),...(g.issuer?{issuer:g.issuer}:{}),...(g.items?{items:g.items.map(i=>({...gift(i),count:i.count}))}:{})});
    const numeric=game.mode==='money'||game.mode==='drink';
    const poolDraft=game.poolProposal;let poolProposal=null;
    if(numeric&&poolDraft&&poolDraft.gameId===game.gameId&&typeof poolDraft.id==='string'&&['pending','approved','declined'].includes(poolDraft.status)){
      const c=poolDraft.config,limit=game.mode==='money'?1000000:5,validNumber=v=>typeof v==='number'&&Number.isFinite(v)&&(game.mode==='money'?Math.abs(v*100-Math.round(v*100))<1e-6:Number.isInteger(v));
      if(c&&c.mode===game.mode&&validNumber(c.min)&&validNumber(c.max)&&c.min>=0&&c.max<=limit&&c.min<=c.max&&Array.isArray(c.values)&&c.values.length===9&&c.values.every(v=>validNumber(v)&&v>=c.min&&v<=c.max))poolProposal={id:poolDraft.id,gameId:game.gameId,status:poolDraft.status,config:{mode:c.mode,min:c.min,max:c.max,values:[...c.values]}};
    }
    const reshuffle=game.reshuffleRequest,reshuffleRequest=reshuffle&&reshuffle.gameId===game.gameId&&typeof reshuffle.id==='string'&&typeof reshuffle.gameId==='string'&&['pending','approved','declined'].includes(reshuffle.status)?{id:reshuffle.id,gameId:reshuffle.gameId,status:reshuffle.status,phrase:'求求熊二大王了，我是你的兵'}:null;
    const proposal=game.counterProposal,counterProposal=!numeric&&proposal&&['pending','accepted','declined','withdrawn'].includes(proposal.status)?{...(typeof proposal.id==='string'?{id:proposal.id}:{}),...(Number.isInteger(proposal.round)?{round:proposal.round}:{}),...(typeof proposal.gameId==='string'?{gameId:proposal.gameId}:{}),status:proposal.status,...(typeof proposal.name==='string'?{name:proposal.name}:{}),items:Array.isArray(proposal.items)?proposal.items.slice(0,3).filter(item=>item&&Number.isInteger(item.gift)&&item.gift>=0&&item.gift<9&&Number.isInteger(item.count)&&item.count>=1&&item.count<=9999).map(item=>({gift:item.gift,count:item.count})):[]}:null;
    const event=game.stageEvent,stageEvent=event&&['shuffle','banter'].includes(event.kind)?Object.fromEntries(['id','kind','speaker','text','duration','active'].filter(key=>Object.prototype.hasOwnProperty.call(event,key)&&(['id','kind','speaker','text'].includes(key)?typeof event[key]==='string':key==='active'?typeof event[key]==='boolean':typeof event[key]==='number'&&Number.isFinite(event[key]))).map(key=>[key,event[key]])):null;
    return {repriceUsed:game.repriceUsed===true,repricePending:game.repricePending===true,lastRepriceOffer:gift(game.lastRepriceOffer),...(numeric?{mode:game.mode,config:{min:game.config.min,max:game.config.max},pool:game.gifts.map(g=>({name:g.name,icon:g.icon,kind:g.kind,value:g.value}))}:{}),...(stageEvent?{stageEvent}:{}),...(counterProposal?{counterProposal}:{}),...(reshuffleRequest?{reshuffleRequest}:{}),...(poolProposal?{poolProposal}:{}),boxes:game.boxes.map((g,i)=>game.opened.includes(i)?g:null),opened:[...game.opened],gameId:game.gameId,started:game.started!==false,selected:game.selected,initialSelected:game.initialSelected??game.selected,finalChoice:game.finalChoice||null,phase:game.phase,round:game.round,offer:gift(game.offer),result:gift(game.result),original:gift(game.original),...(game.phase==='ended'&&game.comparison?{comparison:{kind:game.comparison.kind,verdict:game.comparison.verdict,alternative:gift(game.comparison.alternative)}}:{})};
  }
  const api={Cipher,identity,sign,verify,authority,authorizeHost,exchangeIdentity,sealFor,openFor,fingerprint,mac,checkMac,publicState,normalize,valid,topic:async code=>'daydream/v1/'+b64(await crypto.subtle.digest('SHA-256',enc.encode('topic:'+normalize(code)))),format:s=>normalize(s).match(/.{1,4}/g)?.join('-')||'',id:()=>b64(crypto.getRandomValues(new Uint8Array(12))),nonce:()=>b64(crypto.getRandomValues(new Uint8Array(16)))};
  if(typeof module!=='undefined')module.exports=api;else root.RoomCore=api;
})(typeof window!=='undefined'?window:null);
