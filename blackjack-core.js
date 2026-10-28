/* Simplified blackjack, entertainment points only. No stakes or payment operations. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlackjackCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const RANKS=Object.freeze(['A','2','3','4','5','6','7','8','9','10','J','Q','K']),SUITS=Object.freeze(['♠','♥','♦','♣']);
 const copy=value=>JSON.parse(JSON.stringify(value));
 const record=r=>Object.fromEntries(['round','winner','reason','playerDelta','dealerDelta','playerTotal','dealerTotal','playerNatural','dealerNatural'].map(key=>[key,r[key]]));
 function card(id){if(!Number.isInteger(id)||id<0||id>=52)throw RangeError('无效纸牌');return{id,rank:RANKS[id%13],suit:SUITS[Math.floor(id/13)]};}
 function rankOf(value){if(Number.isInteger(value))return card(value).rank;const rank=typeof value==='string'?value:value?.rank;if(!RANKS.includes(rank))throw RangeError('无效牌面');return rank;}
 function score(cards){if(!Array.isArray(cards))throw TypeError('手牌须为数组');let total=0,aces=0;for(const value of cards){const rank=rankOf(value);if(rank==='A'){total+=1;aces++;}else total+=['J','Q','K'].includes(rank)?10:Number(rank);}const soft=aces>0&&total+10<=21;if(soft)total+=10;return{total,soft,natural:cards.length===2&&total===21,bust:total>21};}
 function compare(player,dealer){const p=score(player),d=score(dealer);let winner,reason;
  if(p.bust){winner='dealer';reason='player_bust';}
  else if(p.natural&&d.natural){winner='push';reason='both_blackjack';}
  else if(p.natural){winner='player';reason='player_blackjack';}
  else if(d.natural){winner='dealer';reason='dealer_blackjack';}
  else if(d.bust){winner='player';reason='dealer_bust';}
  else if(p.total===d.total){winner='push';reason='equal_total';}
  else{winner=p.total>d.total?'player':'dealer';reason='higher_total';}
  const playerDelta=winner==='push'?0:winner==='player'?(p.natural?3:2):-(d.natural?3:2);
  return{winner,reason,playerDelta,dealerDelta:playerDelta===0?0:-playerDelta,playerTotal:p.total,dealerTotal:d.total,playerNatural:p.natural,dealerNatural:d.natural};
 }
 function randomIndex(size,rng,cryptoSource){if(rng){const value=rng();if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>=1)throw RangeError('随机数须在[0,1)内');return Math.floor(value*size);}const source=cryptoSource||(typeof crypto!=='undefined'?crypto:null);if(!source?.getRandomValues)throw Error('浏览器不支持安全随机数');const limit=0x100000000-(0x100000000%size),buffer=new Uint32Array(1);do{source.getRandomValues(buffer);}while(buffer[0]>=limit);return buffer[0]%size;}
 function shuffleDeck(options={}){if(options.rng!==undefined&&typeof options.rng!=='function')throw TypeError('随机源须为函数');const deck=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=randomIndex(i+1,options.rng,options.crypto);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
 class Engine{
  constructor(options={}){if(!options||typeof options!=='object'||Array.isArray(options))throw TypeError('无效游戏设置');const rounds=options.rounds??99;if(!Number.isInteger(rounds)||rounds<1||rounds>99)throw RangeError('连续局数须为1至99');if(options.rng!==undefined&&typeof options.rng!=='function')throw TypeError('随机源须为函数');this._rng=options.rng;this._crypto=options.crypto;this.rounds=rounds;this.round=0;this.phase='idle';this.deck=[];this.player=[];this.dealer=[];this.result=null;this.ledger={player:0,dealer:0};this.history=[];}
  startRound(){if(!['idle','ended'].includes(this.phase))throw Error('请先完成当前局');if(this.round>=this.rounds)throw Error('本次连续对战已结束');const deck=shuffleDeck({rng:this._rng,crypto:this._crypto});this.deck=deck;this.player=[];this.dealer=[];this.result=null;this.round++;this.player.push(this._draw());this.dealer.push(this._draw());this.player.push(this._draw());this.dealer.push(this._draw());this.phase='player';if(score(this.player).natural||score(this.dealer).natural)this._settle();return publicState(this);}
  _draw(){if(!this.deck.length)throw Error('牌堆已空');return this.deck.pop();}
  hit(){if(this.phase!=='player')throw Error('当前不能要牌');this.player.push(this._draw());const value=score(this.player);if(value.bust)this._settle();else if(value.total===21)this.phase='dealer';return publicState(this);}
  stand(){if(this.phase!=='player')throw Error('当前不能停牌');this.phase='dealer';return publicState(this);}
  dealerStep(){if(this.phase!=='dealer')throw Error('当前不能执行庄家规则');const current=score(this.dealer);if(current.total<=16)this.dealer.push(this._draw());const value=score(this.dealer);if(value.bust||value.total>=17)this._settle();return publicState(this);}
  finishDealer(){if(this.phase!=='dealer')throw Error('当前不是庄家回合');while(this.phase==='dealer')this.dealerStep();return publicState(this);}
  _settle(){if(this.phase==='ended')throw Error('本局已结算');const result={round:this.round,...compare(this.player,this.dealer)};this.result=result;this.phase='ended';this.ledger.player+=result.playerDelta;this.ledger.dealer+=result.dealerDelta;this.history.push({...result});}
  snapshot(){return{version:1,rounds:this.rounds,round:this.round,phase:this.phase,deck:[...this.deck],player:[...this.player],dealer:[...this.dealer],result:this.result&&{...this.result},ledger:{...this.ledger},history:this.history.map(r=>({...r}))};}
  static restore(raw,options={}){
   if(!raw||raw.version!==1||!['idle','player','dealer','ended'].includes(raw.phase)||!Number.isInteger(raw.round)||raw.round<0||!Number.isInteger(raw.rounds)||raw.rounds<1||raw.rounds>99||raw.round>raw.rounds||!Array.isArray(raw.player)||!Array.isArray(raw.dealer)||!Array.isArray(raw.deck)||!Array.isArray(raw.history))throw Error('无效21点存档');
   const all=[...raw.deck,...raw.player,...raw.dealer];if(all.some(id=>!Number.isInteger(id)||id<0||id>51)||new Set(all).size!==all.length||(raw.round===0?all.length!==0:all.length!==52))throw Error('存档纸牌重复或缺失');
   if(raw.phase==='idle'&&(raw.round!==0||raw.history.length!==0)||raw.phase!=='idle'&&(raw.round<1||raw.player.length<2||raw.dealer.length<2))throw Error('存档回合无效');
   if(raw.history.length!==(raw.phase==='ended'?raw.round:Math.max(0,raw.round-1)))throw Error('存档计分局次无效');
   let player=0,dealer=0;const history=raw.history.map((r,i)=>{if(!r||r.round!==i+1||!['player','dealer','push'].includes(r.winner)||!['player_bust','dealer_bust','player_blackjack','dealer_blackjack','both_blackjack','higher_total','equal_total'].includes(r.reason)||typeof r.playerNatural!=='boolean'||typeof r.dealerNatural!=='boolean'||![r.playerTotal,r.dealerTotal].every(v=>Number.isInteger(v)&&v>=4&&v<=31)||r.playerNatural&&r.playerTotal!==21||r.dealerNatural&&r.dealerTotal!==21||r.dealerDelta!==-r.playerDelta||r.playerDelta!==(r.winner==='push'?0:r.winner==='player'?(r.playerNatural?3:2):-(r.dealerNatural?3:2)))throw Error('存档积分无效');player+=r.playerDelta;dealer+=r.dealerDelta;return record(r);});
   if(!raw.ledger||raw.ledger.player!==player||raw.ledger.dealer!==dealer)throw Error('存档积分不守恒');
   if(raw.phase==='player'&&(score(raw.player).total>=21||raw.dealer.length!==2||score(raw.dealer).natural)||raw.phase==='dealer'&&(score(raw.player).bust||score(raw.player).natural||score(raw.dealer).natural))throw Error('存档行动阶段无效');
   if(raw.phase==='ended'){const expected={round:raw.round,...compare(raw.player,raw.dealer)};if(!raw.result||Object.keys(expected).some(k=>expected[k]!==raw.result[k]||expected[k]!==history.at(-1)?.[k]))throw Error('存档结算与手牌不匹配');}
   else if(raw.result!==null)throw Error('未结算存档含结果');
   const game=new Engine({...options,rounds:raw.rounds});Object.assign(game,{round:raw.round,phase:raw.phase,deck:[...raw.deck],player:[...raw.player],dealer:[...raw.dealer],result:raw.result&&record(raw.result),ledger:{player,dealer},history});return game;
  }
 }
 function publicState(game,role='solo'){const revealed=game.phase==='dealer'||game.phase==='ended',ended=game.phase==='ended',player=score(game.player),dealer=revealed?score(game.dealer):null;return{phase:game.phase,round:game.round,rounds:game.rounds,finished:ended&&game.round>=game.rounds,player:game.player.map(card),dealer:game.dealer.map((id,i)=>revealed||i===0?card(id):{hidden:true}),playerTotal:player.total,playerSoft:player.soft,dealerTotal:dealer?.total??null,dealerSoft:dealer?.soft??null,canStart:['solo','host','dealer'].includes(role)&&['idle','ended'].includes(game.phase)&&game.round<game.rounds,canHit:['solo','player'].includes(role)&&game.phase==='player',canStand:['solo','player'].includes(role)&&game.phase==='player',canDealerStep:['solo','dealer','host'].includes(role)&&game.phase==='dealer',result:ended?record(game.result):null,ledger:{player:game.ledger.player,dealer:game.ledger.dealer},history:game.history.map(record),rules:{dealerStandsSoft17:true,split:false,insurance:false,double:false,entertainmentOnly:true}};}
 return{Engine,score,compare,card,shuffleDeck,publicState,RANKS,SUITS};
});
