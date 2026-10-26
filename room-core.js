(function(root){
  'use strict';
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const enc=new TextEncoder(),dec=new TextDecoder();
  const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const normalize=s=>String(s||'').toUpperCase().replace(/[\s-]/g,'');
  const valid=s=>/^[A-HJ-NP-Z2-9]{12}$/.test(normalize(s));
  async function fingerprint(pub){const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(pub)));let out='',bits=0,value=0;for(const n of hash){value=(value<<8)|n;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];if(out.length===12)return out}}}
  class Cipher{
    constructor(code){this.code=normalize(code);if(!valid(this.code))throw Error('请输入完整的12位房间码');}
    async init(){const hash=await crypto.subtle.digest('SHA-256',enc.encode('daydream-room-v1:'+this.code));this.key=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);return this;}
    async seal(data){const iv=crypto.getRandomValues(new Uint8Array(12));const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},this.key,enc.encode(JSON.stringify(data)));return JSON.stringify({iv:b64(iv),body:b64(body)});}
    async open(raw){if(raw.length>50000)throw Error('message too large');const p=JSON.parse(raw);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv)},this.key,bytes(p.body))));}
  }
  async function identity(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const pub=b64(await crypto.subtle.exportKey('raw',pair.publicKey));return{code:await fingerprint(pub),pub,privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),token:b64(crypto.getRandomValues(new Uint8Array(24)))};}
  async function sign(data,jwk){const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const text=JSON.stringify(data);return{data:text,sig:b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(text)))};}
  async function verify(packet,pub,code){if(await fingerprint(pub)!==normalize(code))return null;const key=await crypto.subtle.importKey('raw',bytes(pub),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(packet.sig),enc.encode(packet.data)))return null;return JSON.parse(packet.data);}
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
  const api={Cipher,identity,sign,verify,mac,checkMac,publicState,normalize,valid,topic:async code=>'daydream/v1/'+b64(await crypto.subtle.digest('SHA-256',enc.encode('topic:'+normalize(code)))),format:s=>normalize(s).match(/.{1,4}/g)?.join('-')||'',id:()=>b64(crypto.getRandomValues(new Uint8Array(12))),nonce:()=>b64(crypto.getRandomValues(new Uint8Array(16)))};
  if(typeof module!=='undefined')module.exports=api;else root.RoomCore=api;
})(typeof window!=='undefined'?window:null);
