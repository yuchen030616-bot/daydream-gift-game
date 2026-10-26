(function(root){
 'use strict';
 const MAX=1000000,STATUSES=['active','awaiting_banker','completed','ended'];
 const copy=value=>JSON.parse(JSON.stringify(value));
 function cents(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>MAX||Math.abs(value*100-Math.round(value*100))>1e-6)throw Error('金额须为0至1000000元，最多两位小数');return Math.round(value*100);}
 function config(value){if(!value||!Number.isInteger(value.rounds)||value.rounds<1||value.rounds>99)throw Error('连续局数须为1至99的整数');return{rounds:value.rounds,entryFee:cents(value.entryFee??0)/100};}
 function participant(value){if(!value||typeof value.peer!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.peer))throw Error('参与者身份无效');const name=value.name??'匿名';if(typeof name!=='string'||!name.trim()||Array.from(name).length>16||/[\u0000-\u001f\u007f-\u009f]/.test(name))throw Error('参与者昵称无效');return{peer:value.peer,name};}
 function gameId(value){if(typeof value!=='string'||!value||value.length>160)throw Error('本局身份无效');return value;}
 function totals(records){
  const map=new Map();
  const account=p=>{if(!map.has(p.peer))map.set(p.peer,{peer:p.peer,name:p.name,net:0,ticketsPaid:0,prizesReceived:0,ticketsReceived:0,prizesPaid:0,asPlayer:0,asBanker:0});const a=map.get(p.peer);a.name=p.name;return a;};
  for(const record of records){const player=account(record.player),banker=account(record.banker),ticket=cents(record.ticket),prize=cents(record.prize);player.net+=prize-ticket;banker.net+=ticket-prize;player.ticketsPaid+=ticket;player.prizesReceived+=prize;player.asPlayer++;banker.ticketsReceived+=ticket;banker.prizesPaid+=prize;banker.asBanker++;}
  return [...map.values()].map(a=>({...a,...Object.fromEntries(['net','ticketsPaid','prizesReceived','ticketsReceived','prizesPaid'].map(key=>[key,a[key]/100]))}));
 }
 function sanitize(state){
  if(state==null)return null;const cfg=config(state.config);if(typeof state.id!=='string'||!state.id||state.id.length>160||!STATUSES.includes(state.status)||!Number.isInteger(state.round)||state.round<0||state.round>cfg.rounds||!Array.isArray(state.records)||state.records.length>cfg.rounds)throw Error('计分对战状态无效');
  const seen=new Set(),records=state.records.map((record,index)=>{const id=gameId(record.gameId),player=participant(record.player),banker=participant(record.banker);if(seen.has(id)||record.round!==index+1||player.peer===banker.peer)throw Error('计分记录重复或身份无效');seen.add(id);const ticket=cents(record.ticket),prize=cents(record.prize);if(ticket!==cents(cfg.entryFee))throw Error('本次对战门票不可变更');return{round:index+1,gameId:id,player,banker,playerName:player.name,bankerName:banker.name,ticket:ticket/100,prize:prize/100,net:(prize-ticket)/100,playerNet:(prize-ticket)/100,bankerNet:(ticket-prize)/100};});
  if(state.status==='active'&&records.length!==state.round-1||state.status==='awaiting_banker'&&records.length!==state.round||state.status==='completed'&&(records.length!==cfg.rounds||state.round!==cfg.rounds)||state.status==='ended'&&!(records.length===state.round||records.length===state.round-1))throw Error('计分局次不一致');
  const banker=state.banker==null?null:participant(state.banker);if(state.status==='active'&&!banker)throw Error('请先确认本局庄家');
  return{id:state.id,status:state.status,round:state.round,config:cfg,banker,records,balances:totals(records),createdAt:Number.isFinite(state.createdAt)?state.createdAt:0};
 }
 function create(value,existing=null){if(existing&&!['completed','ended'].includes(sanitize(existing).status))throw Error('本次计分对战尚未结束，门票与局数不可变更');const cfg=config(value),id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return{id,status:'awaiting_banker',round:0,config:cfg,banker:null,records:[],balances:[],createdAt:Date.now()};}
 function nextRound(state,banker){const s=sanitize(state);if(!s||s.status!=='awaiting_banker'||s.round>=s.config.rounds)throw Error('当前不能开始下一局');return{...s,status:'active',round:s.round+1,banker:participant(banker)};}
 function recordSettlement(state,currentGame,participants){
  const s=sanitize(state);if(!s)throw Error('尚未创建计分对战');const id=gameId(currentGame?.gameId);if(s.records.some(record=>record.gameId===id))return s;
  if(s.status!=='active'||currentGame?.mode!=='money'||currentGame.phase!=='ended'||currentGame.result?.kind!=='money')throw Error('仅普通金额版已结束的本局可以计分');
  const player=participant(participants?.player),banker=participant(participants?.banker);if(player.peer===banker.peer||banker.peer!==s.banker.peer)throw Error('庄家与玩家须为不同席位，且庄家须与本局确认一致');
  const ticket=cents(s.config.entryFee),prize=cents(currentGame.result.value),record={round:s.round,gameId:id,player,banker,playerName:player.name,bankerName:banker.name,ticket:ticket/100,prize:prize/100,net:(prize-ticket)/100,playerNet:(prize-ticket)/100,bankerNet:(ticket-prize)/100};
  const records=[...s.records,record];return{...s,status:s.round===s.config.rounds?'completed':'awaiting_banker',records,balances:totals(records)};
 }
 function end(state){const s=sanitize(state);if(!s)return null;return s.status==='completed'||s.status==='ended'?s:{...s,status:'ended'};}
 const api={create,nextRound,recordSettlement,end,publicState:sanitize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SeriesCore=api;
})(typeof window!=='undefined'?window:null);
