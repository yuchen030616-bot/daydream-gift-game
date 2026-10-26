/* Only game preferences accompany a voluntary host handoff. No login or audit data. */
(function(root){
 'use strict';
 const keys=['daydream.admin.next','daydream.admin.next.money','daydream.admin.next.drink','daydream.owner-prices','daydream.price-update'];
 function preset(value,mode){
  if(value===null)return null;
  if(!mode){if(Number.isInteger(value)&&value>=0&&value<9)return value;throw Error('礼物预设无效');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Number.isInteger(value.index)||value.index<0||value.index>8||typeof value.signature!=='string'||value.signature.length>2048)throw Error('数值预设无效');
  const sig=JSON.parse(value.signature),limit=mode==='money'?1000000:5;
  if(!Array.isArray(sig)||sig.length!==4||sig[0]!==mode||!Number.isFinite(sig[1])||!Number.isFinite(sig[2])||sig[1]<0||sig[2]>limit||sig[1]>sig[2]||!Array.isArray(sig[3])||sig[3].length!==9||!sig[3].every(v=>Number.isFinite(v)&&v>=sig[1]&&v<=sig[2]&&(mode==='money'?Math.abs(v*100-Math.round(v*100))<1e-6:Number.isInteger(v))))throw Error('预设与数值范围无效');
  return {index:value.index,signature:JSON.stringify(sig)};
 }
 function normalize(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('交接设置字段无效');
  const out={};
  for(const key of keys){const v=Object.prototype.hasOwnProperty.call(value,key)?value[key]:null;
   if(key==='daydream.owner-prices'){if(v!==null&&(!Array.isArray(v)||v.length!==9||!v.every(n=>Number.isInteger(n)&&n>=1&&n<=10000000)))throw Error('礼物单价无效');out[key]=v&&[...v];}
   else if(key==='daydream.price-update'){if(v!==null&&v!=='car1500')throw Error('礼物版本无效');out[key]=v;}
   else out[key]=preset(v,key.endsWith('.money')?'money':key.endsWith('.drink')?'drink':null);
  }
  return out;
 }
 function read(storage=root?.localStorage){const out={};for(const key of keys){out[key]=null;try{const raw=storage.getItem(key);if(raw===null)continue;const value=key==='daydream.price-update'?raw:JSON.parse(raw);out[key]=normalize({[key]:value})[key];}catch{}}return out;}
 function apply(value,storage=root?.localStorage){
  const safe=normalize(value),previous=new Map();try{
   for(const key of keys)previous.set(key,storage.getItem(key));
   for(const key of keys){if(safe[key]===null)storage.removeItem(key);else storage.setItem(key,key==='daydream.price-update'?safe[key]:JSON.stringify(safe[key]));}
   root?.OwnerDesk?.reloadPrices?.();return true;
  }catch{for(const[key,raw]of previous)try{raw===null?storage.removeItem(key):storage.setItem(key,raw);}catch{}return false;}
 }
 const api={read,apply,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RoomHandoffSettings=api;
})(typeof window!=='undefined'?window:null);
