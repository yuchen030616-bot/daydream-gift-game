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
  function publicState(game){const gift=g=>g&&({name:g.name,icon:g.icon,...(g.issuer?{issuer:g.issuer}:{}),...(g.items?{items:g.items.map(i=>({name:i.name,icon:i.icon,count:i.count}))}:{})});return{boxes:game.boxes.map((g,i)=>game.opened.includes(i)?g:null),opened:[...game.opened],selected:game.selected,phase:game.phase,round:game.round,offer:gift(game.offer),result:gift(game.result),original:gift(game.original)};}
  const api={Cipher,identity,sign,verify,mac,checkMac,publicState,normalize,valid,topic:async code=>'daydream/v1/'+b64(await crypto.subtle.digest('SHA-256',enc.encode('topic:'+normalize(code)))),format:s=>normalize(s).match(/.{1,4}/g)?.join('-')||'',id:()=>b64(crypto.getRandomValues(new Uint8Array(12)))};
  if(typeof module!=='undefined')module.exports=api;else root.RoomCore=api;
})(typeof window!=='undefined'?window:null);
