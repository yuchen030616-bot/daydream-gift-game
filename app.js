const $=id=>document.getElementById(id);
const assets=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
let game=new DreamEngine(),busy=false,muted=true,log=[],offerStarted=0,lastShuffleGame='';
const pool=()=>game.gifts||DreamEngine.GIFTS;
const shuffling=()=>game.stageEvent?.kind==='shuffle'&&game.stageEvent.active===true;
const reshuffleWaiting=()=>game.reshuffleRequest?.status==='pending';
const poolWaiting=()=>game.poolProposal?.status==='pending'&&game.poolProposal.gameId===game.gameId;
function normalizeMoneyState(state){
 if(state.mode!=='money')return false;
 const before=JSON.stringify([state.config,state.gifts||state.pool,state.offer,state.result,state.original,state.lastDeclinedOffer,state.comparison]);
 const source=state.gifts||state.pool,next=DreamEngine.makePool({mode:'money',min:Math.round(state.config.min),max:Math.round(state.config.max),values:source.map(g=>Math.round(g.value??g.score))});
 state.config=next.config;state.gifts=next.gifts;
 const roundGift=g=>g?{...g,...DreamEngine.moneyGift(g.value??g.score)}:g;
 for(const key of ['offer','result','original','lastDeclinedOffer'])if(state[key])state[key]=roundGift(state[key]);
 if(state.comparison){state.comparison={...state.comparison,alternative:roundGift(state.comparison.alternative)};if(state.result){const a=state.result.value,b=state.comparison.alternative.value;state.comparison.verdict=a>b?'win':a<b?'loss':'even';}}
 return before!==JSON.stringify([state.config,state.gifts,state.offer,state.result,state.original,state.lastDeclinedOffer,state.comparison]);
}
function art(g,cls='gift-art'){if(g.kind==='money'||g.kind==='drink')return `<span class="${cls} numeric-art kind-${g.kind}"><strong>${Number(g.value)}</strong><small>${g.kind==='money'?'元':'小口'}</small></span>`;const visual=g.items?.[0]||g;const i=DreamEngine.GIFTS.findIndex(x=>x.name===visual.name);return `<img class="${cls}" src="assets/${assets[i]}" alt="${visual.name}">`;}
function tone(win=false){if(muted)return;try{const a=new(window.AudioContext||window.webkitAudioContext)();[0,1,2].forEach((n)=>{const o=a.createOscillator(),v=a.createGain();o.connect(v);v.connect(a.destination);o.frequency.value=(win?523:330)*[1,1.25,1.5][n];v.gain.setValueAtTime(.035,a.currentTime+n*.1);v.gain.exponentialRampToValueAtTime(.001,a.currentTime+n*.1+.35);o.start(a.currentTime+n*.1);o.stop(a.currentTime+n*.1+.4)});setTimeout(()=>a.close(),1000)}catch{}}
function render(){if(game.stageEvent?.kind==='shuffle')lastShuffleGame=game.gameId;window.MobilePages?.render(game);const p=game.phase,playable=!window.DreamRoom||DreamRoom.canPlay();document.body.dataset.phase=p;$('round').textContent=String(game.round).padStart(2,'0');$('progress').value=game.round;
const hints={select:['先选一个，留住你的梦想','点击一个编号箱，作为本局保留箱。'],pricing:['等待房主给你报价','本轮礼物已揭晓，房主正在决定这一口价。'],open:['排除一个箱子，离梦想更近一步','打开其他箱子，看看哪份礼物与本局告别。'],offer:['这份估值，你愿意收下吗？','接受即终止本局；继续则放弃当前估值。'],final:['最后两箱，换还是不换？','保留原箱或换成另一箱，选择后立即揭晓。'],ended:['这一局，梦想已有答案','可以看看原箱，或重新开启一段梦想。']};$('phase').textContent=hints[p][0];$('hint').textContent=p==='open'?`再开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 个箱子，就会收到下一份报价。`:hints[p][1];
$('boxes').innerHTML=game.boxes.map((gi,i)=>{const selected=game.selected===i,initial=i===(game.initialSelected??game.selected),gift=selected&&game.finalChoice?game.result:initial&&game.original?game.original:game.opened.includes(i)?pool()[gi]:null,opened=!!gift;return `<button class="box ${opened?'opened':''} ${selected?'selected':''}" data-box="${i}" ${busy||shuffling()||reshuffleWaiting()||game.started===false||p!=='select'&&(p!=='open'||selected||opened)?'disabled':''} aria-label="${i+1}号箱${opened?'，已开出'+gift.name:selected?'，我的梦想箱':''}"><span class="box-number">${String(i+1).padStart(2,'0')}</span>${opened?art(gift,'box-icon'): '<span class="box-icon">✦</span>'}<span class="box-name">${opened?gift.name:selected?'我的梦想箱':initial?'原保留箱':'未知的心动'}</span></button>`}).join('');
$('prizes').innerHTML=pool().map((g,i)=>{const out=game.opened.some(b=>game.boxes[b]===i);return `<div class="prize ${out?'eliminated':''}"><span class="prize-rank">${String(i+1).padStart(2,'0')}</span><span class="prize-icon">${art(g)}</span><strong class="prize-name">${g.name}</strong><span class="prize-value">${out?'已揭晓':(game.mode==='gift'?i===0:g.value===Math.max(...pool().map(x=>x.value)))?(game.mode==='gift'?'终极大奖':'本局最高'):'待揭晓'}</span></div>`}).join('');
$('myBox').innerHTML=game.selected===null?'<span>等待选择</span>':`<strong>${String(game.selected+1).padStart(2,'0')}</strong><span>号梦想箱 · 为你保留</span>`;
const reward=p==='ended'?game.result:['final','pricing'].includes(p)?null:game.offer;$('offer').innerHTML=reward?`${art(reward)}<strong>${reward.name}</strong>`:`<span class="waiting-star">✧</span><strong>${p==='pricing'?'等待房主报价':p==='open'?'本轮开箱后报价':p==='final'?'保留原箱，还是换箱？':'等待第一份估值'}</strong>`;
const quips=['嘿嘿，俺掐爪一算，给你「{gift}」！签了吧，俺还赶着吃蜂蜜呢。','哎呀，开走的可不退哦～「{gift}」，俺这回可是咬着牙报的！','还惦记嘉年华呐？先瞅瞅俺的「{gift}」，心动就别嘴硬嘛。','俺这算盘都快搓冒烟了！「{gift}」，再多一滴蜂蜜也没有啦。','你瞅俺这真诚的小眼神～「{gift}」，现在收下，俺绝不反悔！','还敢继续？有点东西哦！先给你「{gift}」，要不咱见好就收？','最后这口价「{gift}」！俺把蜂蜜罐都押……咳，差点说漏嘴。'];
const remaining=pool().filter((_,i)=>!game.opened.some(b=>game.boxes[b]===i));const smallest=remaining.reduce((a,b)=>a.score<b.score?a:b);
const riskQuips=[`嘿嘿，万一最后就剩「${smallest.name}」呢？俺这份「{gift}」可是稳稳当当的，要不见好就收？`,`大的你想要，小的你又怕～「{gift}」先落袋，总比最后捧着「${smallest.name}」干瞪眼强吧？`,`别光盯着大奖呀，「${smallest.name}」还在里面等你呢！俺给「{gift}」，这踏实劲儿可得算进去。`];
if($('bearLine'))$('bearLine').textContent=p==='offer'?(game.offer.reason==='低奖风险'?riskQuips[(game.round-1)%riskQuips.length]:quips[(game.round-1)%quips.length]).replace('{gift}',game.offer.name):p==='ended'?`嘿嘿，成交「${game.result.name}」！俺这买卖做得……咳，祝你开心！`:p==='pricing'?'嘿嘿，等俺掰掰爪子，下一口价马上来！':p==='final'?'嘿嘿，最后两箱啦！守住老朋友，还是换个新梦想？选好可就开啦～':p==='open'?`这轮还要开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 箱，开完俺再报！`:'嘿嘿，先挑个箱子吧！俺这算盘，今天可不一定向着你哦。';
$('offerNote').textContent=p==='ended'?'本局最终礼物':p==='offer'?(game.offer.issuer==='host'?'房主已出价 · 是否终止？':'本轮模拟估值 · 是否终止？'):p==='pricing'?'房主确认后，报价会同步给所有人':p==='final'?'最后一次选择：保留原箱或换箱，立即揭晓结果':'按2→2→2→1开箱报价，最后可保留或换箱';
$('accept').hidden=p!=='offer';$('continue').hidden=p!=='offer';$('reveal').hidden=!['final','ended'].includes(p);$('reveal').textContent=p==='final'?'打开我的梦想箱 ✦':'看看原箱藏着什么';$('history').innerHTML=log.length?log.map(x=>`<li>${x}</li>`).join(''):'<li>梦想档案将在开箱后记录</li>';
if(!playable||busy||shuffling()||reshuffleWaiting()||game.counterProposal?.status==='pending'){document.querySelectorAll('[data-box]').forEach(b=>b.disabled=true);['accept','continue','reveal','swap'].forEach(id=>$(id).disabled=true);}else ['accept','continue','reveal','swap'].forEach(id=>$(id).disabled=false);
$('reset').disabled=busy||shuffling()||!!window.DreamRoom&&!['host','solo'].includes(DreamRoom.role);
const shownReserve=game.finalChoice?game.result:game.original;if(shownReserve)$('myBox').innerHTML=`${art(shownReserve)}<strong>${shownReserve.name}</strong><span>${game.selected+1}号梦盒 · ${game.finalChoice==='swap'?'已换箱':game.finalChoice==='keep'?'保留原箱':'原箱已揭晓'}</span>`;
$('swap').hidden=p!=='final';const other=game.boxes.findIndex((_,i)=>i!==game.selected&&!game.opened.includes(i));$('swap').textContent=other>=0?`换成 ${other+1} 号箱 · 立即开箱`:'换成另一箱';if(p==='final'){$('reveal').textContent=`保留 ${game.selected+1} 号箱 · 立即开箱`;$('hint').textContent=`原箱是 ${game.selected+1} 号，另一箱是 ${other+1} 号。选择后立即揭晓，不能再换。`;}
if(game.finalChoice)$('history').innerHTML=`<li><span>最终选择</span><strong>${game.finalChoice==='swap'?`换箱 ${game.initialSelected+1} → ${game.selected+1} 号`:`保留 ${game.selected+1} 号箱`}</strong></li>`+$('history').innerHTML;
if(game.started===false){$('phase').textContent='等待主播开始游戏';$('hint').textContent='主播确认开始后，本局才会开放选箱。';}
if(poolWaiting()){$('phase').textContent='等待房主最终确认';$('hint').textContent='九个数值已提交。房主可修改并确认，之后自动洗牌。';}
if(reshuffleWaiting())$('hint').textContent='洗牌申请正在等待房主审批；当前宝箱、报价和进度暂时保留。';
window.GameModes?.decorate(game);
if($('startSolo')){$('startSolo').hidden=!!window.DreamRoom&&DreamRoom.role!=='solo'||p!=='select'||game.selected!==null||lastShuffleGame===game.gameId||game.mode!=='gift'&&game.started!==false;$('startSolo').disabled=busy||shuffling();$('startSolo').textContent=game.mode==='gift'?'开始 · 打乱宝箱 ✦':'开始 · 先设置本局数值';}
window.OwnerDesk?.render(game);
window.QuotePopup?.render(game,$('bearLine').textContent);
window.CounterOffer?.render(game);
window.ReshufflePrompt?.render(game);
window.Showtime?.render(game);
window.PlayerStart?.render(game);
window.AdminDesk?.render(game);
window.GameModes?.render(game);
window.GameTheatre?.render(game);
if(reshuffleWaiting())for(const id of ['beginPlayer','readyPlayer'])if($(id))$(id).disabled=true;
window.NumericStart?.render(game);window.MobilePages?.render(game);
}
async function choose(i){if(busy||shuffling()||game.started===false)return;try{if(game.phase==='select'){game.select(i);tone();render();return}if(game.phase!=='open')return;busy=true;const b=document.querySelector(`[data-box="${i}"]`);b?.classList.add('revealing');document.querySelectorAll('[data-box]').forEach(x=>x.disabled=true);tone();await new Promise(r=>setTimeout(r,550));game.open(i,!!window.DreamRoom&&DreamRoom.role==='host');const g=pool()[game.boxes[i]];log.unshift(`<span>第 ${game.round} 轮 · ${i+1}号箱</span><strong>${g.name}</strong>`);busy=false;offerStarted=Date.now();render();if(game.phase==='offer')$('accept').focus();else if(game.phase==='final')$('reveal').focus()}catch(e){busy=false;render();throw e;}}
let lastBanterAt=-Infinity;const lastBanterPick={};
const banterLines={
 player:[
  ['熊二，你这报价是算盘坏了，还是良心放假了？','你这蜂蜜罐封得挺严，良心也一块儿封进去了？','这价一出，算盘都想辞职：太丢珠子了！'],
  ['俺来追梦，你拿这点报价打发俺做午休呢？','小算盘先收一收，俺的梦想可不按你的胆量卖。','你先别替俺心疼大奖，心疼心疼你的格局吧。'],
  ['再加点！你这报价，连蜂蜜罐底儿都没刮干净。','报价这么抠，蜂蜜都拿去给算盘上油了？','再往上报报，别让俺以为你在清仓处理良心。'],
  ['俺还没怂呢，你这蜂蜜罐倒先抱出汗了。','别催俺收手，你越心疼，俺越想看看下一箱。','你先笑着，等会儿算盘崩了，可别找俺捡珠子。']
 ],
 host:[
  ['哟，嘴上嫌俺抠，眼睛倒把这报价盘出包浆了。','梦想挺大，胆子正好够给俺看蜂蜜罐，嘿嘿。','这价你不收也行，俺最爱看人替俺省预算。'],
  ['你光盯着最大的，最小的都快叫你名字了。','嘴比大奖还大，手气可别最后只够擦罐底儿。','别急着嫌少，下个小奖说不定就是你的梦中情箱。'],
  ['你继续嘴硬，俺继续省钱，咱俩都有美好的未来。','俺这算盘没坏，是你的梦想还没学会看预算。','你这一犹豫，俺都听见蜂蜜罐在偷笑了。'],
  ['刚才的报价你爱理不理，等会儿可别追着俺跑。','最后这口价，俺递的是台阶，你当成了领奖台？','继续当然行，俺最喜欢看梦想自己给自己打折。']
 ],
 drink:{
  player:[
   ['熊二，你这算盘抠得，杯里的白开水都替你脸红。','你这报价，茶叶看了都想把自己泡淡一点省钱。','杯里装什么随俺，你这良心倒是一直兑着水。'],
   ['俺拿水杯都比你这算盘有排面，格局打开点！','俺来开箱，你在旁边给蜂蜜罐开追悼会呢？','先别替俺算口数，给你的格局也量量尺寸吧。'],
   ['你再算算，别让杯垫都觉得你这报价垫底。','这价连白开水都嫌没味儿，你还搁这儿回甘呢？','你这算盘不是精打细算，是怕良心多占一格。'],
   ['箱子还没开，你抱蜂蜜罐的姿势倒先练熟了。','俺选的是箱子，你这熊怎么先给预算烧香了？','你先笑着，等俺开完箱，再看看谁的算盘缺牙。']
  ],
  host:[
   ['箱子还没开，你这张嘴已经把九个箱子全赢一遍了。','你那套赢法挺完整，就是还没通知箱子配合你。','你这手气先不评价，嘴倒是已经申请当大奖了。'],
   ['你盯箱子的眼神，像极了预算只有一块还在挑顶配。','你研究的是概率？俺看是在给直觉写表扬信。','最大的还没认你，你倒先把获奖感言背熟了。'],
   ['俺看的是箱子，你研究的是把嘴硬包装成战略。','你这算盘打得挺响，可惜响的是俺这边的。','你这一犹豫，连杯垫都替你想好了十套解释。'],
   ['你不是在选箱，是在给等会儿的表情包选封面。','俺这报价都递到手边了，你还想给它办个选秀。','嘴硬归嘴硬，别等开完箱又说自己只是来活跃气氛。']
  ]
 }
};
function publishBanter(speaker,index){
 if(!Number.isInteger(index)||index<0||index>3||busy||shuffling())throw Error('当前不能放话');
 if(performance.now()-lastBanterAt<3000)throw Error('请稍等片刻再说');
 lastBanterAt=performance.now();const id=crypto.randomUUID(),gid=game.gameId;
 const group=(game.mode==='drink'?banterLines.drink[speaker]:banterLines[speaker])[index],key=(game.mode||'gift')+':'+speaker+':'+index;let text=group;
 if(Array.isArray(group)){const choices=group.map((line,i)=>({line,i})).filter(p=>p.i!==lastBanterPick[key]);const pick=choices[Math.floor(Math.random()*choices.length)];lastBanterPick[key]=pick.i;text=pick.line;}
 game.stageEvent={id,kind:'banter',speaker,text,duration:3000,active:true};render();
 setTimeout(()=>{if(game.gameId===gid&&game.stageEvent?.id===id){game.stageEvent.active=false;render();window.DreamRoom?.changed();}},3000);
}
async function startAnimation(start=true,text='熊二正在洗牌，请稍候…',speaker='host'){
 if(busy||game.phase!=='select'||game.selected!==null)throw Error('当前不能洗牌');
 if(start)game.start();
 const id=crypto.randomUUID(),gid=game.gameId;busy=true;game.stageEvent={id,kind:'shuffle',speaker,text,duration:2200,active:true};
 render();window.DreamRoom?.changed();
 await new Promise(resolve=>setTimeout(resolve,2200));
 if(game.gameId===gid&&game.stageEvent?.id===id){game.stageEvent.active=false;busy=false;render();}
}
async function act(action,index){
 if((busy||shuffling())&&action!=='reset')throw Error('请等待动画结束');
 if(poolWaiting()&&!['poolProposal','applyConfig','banter','skip','reset'].includes(action))throw Error('请等待房主最终确认本局数值');
 if(reshuffleWaiting()&&!['banter','requestReshuffle','reshuffle','reset'].includes(action))throw Error('请等待房主审批洗牌申请');
 if(action==='start'){if(game.mode!=='gift')throw Error('请先设置数值并等待房主最终确认');await startAnimation();}
 else if(action==='shuffle'){if(window.DreamRoom&&DreamRoom.role!=='solo')throw Error('当前不能操作');await startAnimation(false);}
 else if(action==='requestReshuffle'||action==='reshuffle'){
  if(window.DreamRoom&&!['host','solo'].includes(DreamRoom.role))throw Error('请由当前操作玩家发送洗牌请求');
  if(!index||typeof index!=='object'||Array.isArray(index)||Object.keys(index).length!==2||!Object.prototype.hasOwnProperty.call(index,'confirmed')||!Object.prototype.hasOwnProperty.call(index,'gameId')||index.confirmed!==true||typeof index.gameId!=='string'||index.gameId!==game.gameId)throw Error('请先明确接受发送这句话；本局变化后需要重新确认');
  if(game.counterProposal?.status==='pending')throw Error('请先撤回礼物要求，再申请洗牌');
  game.submitReshuffleRequest();render();
 }
 else if(action==='banter')publishBanter('player',index);
 else if(action==='counter'){
  const p=game.submitCounter(index),gid=game.gameId;render();
  if(!window.DreamRoom||DreamRoom.role==='solo'){
   await new Promise(resolve=>setTimeout(resolve,750));
   if(game.gameId===gid&&game.counterProposal?.id===p.id&&game.counterProposal.status==='pending'){game.resolveCounterAuto(p.id);offerStarted=Date.now();render();}
  }
 }
 else if(action==='withdrawCounter'){if(typeof index!=='string')throw Error('无效的要求');game.withdrawCounter(index);render();}
 else if(action==='poolProposal'){
  if(!index||typeof index!=='object'||Array.isArray(index)||Object.keys(index).length!==2||index.gameId!==game.gameId||!index.config||!Array.isArray(index.config.values)||index.config.values.length!==9)throw Error('数值方案已过期，请重新确认');
  game.submitPoolProposal(index.config);render();
 }
 else if(action==='applyConfig'){
  if(!index||game.mode==='gift'||index.mode!==game.mode||game.phase!=='select'||game.selected!==null||window.DreamRoom?.role==='host'&&game.started!==false)throw Error('只能在开始前修改本版数值');
  game.submitPoolProposal(index);render();
 }
 else if(action==='skip'){game.skip();render();}
 else if(action==='box')await choose(index);
 else if(action==='continue'){game.continue(offerStarted?Date.now()-offerStarted:0);render()}
 else if(action==='accept'){game.accept();render();celebrate();tone(true)}
 else if(action==='swap'){game.swap();render();celebrate();tone(true)}
 else if(action==='reveal'){const wasFinal=game.phase==='final',g=game.reveal();game.original=g;render();if(wasFinal){celebrate();tone(true)}else show('原箱揭晓',`<div class="reveal-gift">${art(g)}<h3>${g.name}</h3><p>你已锁定的本局结果：${game.result.name}</p></div>`)}
 else if(action==='reset'){if(window.DreamRoom?.role==='host')throw Error('只有房主可以重置');if(busy)throw Error('请等待动画结束');reset();}else throw Error('无效操作');
}
function dispatch(action,index){if(window.DreamRoom&&DreamRoom.request(action,index))return;act(action,index).then(()=>window.DreamRoom?.changed()).catch(()=>render());}
$('boxes').onclick=e=>{const b=e.target.closest('[data-box]');if(b)dispatch('box',Number(b.dataset.box))};
$('continue').onclick=()=>dispatch('continue');
$('accept').onclick=()=>dispatch('accept');
$('reveal').onclick=()=>dispatch('reveal');
$('swap').onclick=()=>dispatch('swap');
function show(title,body){window.QuotePopup?.pause();$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modal').showModal()}
$('closeModal').onclick=()=>$('modal').close();
$('modal').onclose=()=>window.QuotePopup?.render(game,$('bearLine').textContent);
$('reset').onclick=()=>{if(busy)return;if(!['select','ended'].includes(game.phase)){show('重新开始这一局？','<p>当前梦想箱与估值将被清空，重新随机分配九份礼物。房间内所有人将同步重置。</p><button id="confirmReset" class="primary">确认重新开局</button>');$('confirmReset').onclick=()=>{$('modal').close();dispatch('reset')}}else dispatch('reset')};
function reset(){const config=game.mode!=='gift'?game.config:null;game=new DreamEngine(Math.random,config);game.started=game.mode==='gift'&&window.DreamRoom?.role!=='host';window.AdminDesk?.prepare(game);log=[];offerStarted=0;lastBanterAt=-Infinity;render()}
$('rules').onclick=()=>{if(game.mode!=='gift'){show('爱做梦的熊二 · '+(game.mode==='drink'?'轻饮玩法':'金额玩法'),'<ol><li>设置范围，自动生成九个数，逐项修改后点击确认使用。</li><li>开始并看完洗牌，再保留一只箱子。</li><li>按2→2→2→1开其他箱，每轮决定接受报价或继续。</li><li>最后两箱可保留或换箱，选择后立即结算。</li></ol><p>'+(game.mode==='drink'?'仅限成年人自愿参与，小口数为游戏标记。可随时跳过、不喝，或用水等无酒精饮品替代，不限时、不劝酒。':'金额用于娱乐模拟，不触发转账或支付。')+'</p><p>房间由房主选择版本，玩家可在开始前修改本版数值；房主可在未开箱之间调整数值，已开箱与已结算结果保持不变，不保证随机结果。换箱领取新箱内数值。房主保持页面打开以同步游戏。</p>');return;}show('梦想家入场指南','<ol><li>先选一个编号箱，作为你的梦想箱。</li><li>逐个打开其他箱子，开出的礼物将被排除。</li><li>按2、2、2、1个箱子分四轮开箱，每轮后等待报价。</li><li>接受报价即可终止；继续则放弃当次报价。</li><li>第四次报价后选择继续，在最后两箱中选择保留原箱或换箱，立即揭晓。</li></ol><p>九种礼物每局各一份，礼物可由房主预设或在未开箱之间调整，不保证随机结果。设置绑定箱号，换箱后领取新箱内的礼物。一位主播操作，其他人可用房间码围观；房主需保持页面打开。单人模式由熊二按剩余奖池与游戏过程自动估值。礼物名称用于娱乐模拟，不自动发送真实礼物或触发支付。</p>');};
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'音效：关':'音效：开';$('sound').setAttribute('aria-pressed',!muted);tone()};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{show('全屏提示','<p>当前浏览器暂不支持全屏，可使用 F11 放大游戏画面。</p>')}};
document.addEventListener('keydown',e=>{if($('reshuffleDialog')?.open||$('counterofferDialog')?.open||$('adminDialog')?.open||$('playerStartDialog')?.open||$('resultDialog')?.open||$('roomNameDialog')?.open||$('modal').open||$('quoteDialog').open||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA/.test(e.target?.tagName))return;if(/^[1-9]$/.test(e.key))dispatch('box',Number(e.key)-1)});
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<38;i++){const a=document.createElement('i');a.className='confetti';a.style.cssText=`left:${Math.random()*100}%;animation-delay:${Math.random()*.5}s;background:${['#b9904e','#a33450','#f3dca5'][i%3]}`;document.body.append(a);setTimeout(()=>a.remove(),3500)}}
window.AdminDesk?.init({
 getGame:()=>game,isBusy:()=>busy||shuffling()||reshuffleWaiting()||poolWaiting(),
 change:(gift,target)=>{if(!AdminDesk.authorized()||busy||shuffling()||reshuffleWaiting())throw Error('当前不可操作，请确认房主身份并等待开箱结束');game.setTreasure(gift,target);render();window.DreamRoom?.changed();},
 clear:()=>{if(!AdminDesk.authorized()||busy)throw Error('当前不可操作');game.clearTreasurePreset();render();window.DreamRoom?.changed();},
 restart:()=>{if(!AdminDesk.authorized()||busy)throw Error('当前不可操作');dispatch('reset');}
});
window.PlayerStart?.init(dispatch);
window.GameModes?.init({getGame:()=>game,isBusy:()=>busy||shuffling()||reshuffleWaiting(),show,dispatch,
 applyConfig:config=>{
  if(window.DreamRoom?.role==='player'){dispatch('applyConfig',config);return;}
  if(window.DreamRoom&&!['host','solo'].includes(DreamRoom.role)||busy)throw Error('当前没有设置权限');
  if(config.mode!==game.mode||game.mode==='gift')throw Error('请选择当前版本');
  game.configure(config);log=[];offerStarted=0;render();window.DreamRoom?.changed();
 },
 switchMode:config=>{
  if(window.DreamRoom&&!['host','solo'].includes(DreamRoom.role)||busy)throw Error('只有房主可切换版本');
  game=new DreamEngine(Math.random,config);game.started=game.mode==='gift'&&window.DreamRoom?.role!=='host';log=[];offerStarted=0;lastBanterAt=-Infinity;render();window.DreamRoom?.changed();
 }
});
window.GameTheatre?.init({isBusy:()=>busy||shuffling(),send:(speaker,index)=>{
 const role=window.DreamRoom?.role||'solo';
 if(speaker==='host'){if(role!=='host')return false;try{publishBanter('host',index);DreamRoom.changed();return true;}catch{return false;}}
 if(!['solo','player'].includes(role))return false;
 if(role==='player'&&!DreamRoom.canPlay())return false;
 if(role==='solo'){try{publishBanter('player',index);return true;}catch{return false;}}
 dispatch('banter',index);return true;
}});
if(window.GameTheatre){document.querySelector('.stage-top').insertAdjacentHTML('afterend','<button id="startSolo" class="secondary" type="button">开始 · 打乱宝箱 ✦</button>');$('startSolo').onclick=()=>{if(game.mode!=='gift'&&window.NumericStart)NumericStart.open();else dispatch('shuffle');};}
window.Showtime?.init({decision:dispatch,art});
window.QuotePopup?.init({decision:dispatch,art});
window.CounterOffer?.init({getGame:()=>game,art,isBusy:()=>busy||shuffling()||reshuffleWaiting(),privateCost:items=>{if(window.DreamRoom?.role!=='host')return null;return window.OwnerDesk?.bundleCost(items)??items.reduce((sum,item)=>sum+DreamEngine.GIFTS[item.gift].score*item.count,0);},
 sendProposal:items=>{
  const role=window.DreamRoom?.role||'solo';
  if(!['solo','player'].includes(role)||busy)throw Error('只有当前操作玩家可以提出要求');
  if(role==='player'){if(!DreamRoom.canPlay())return false;DreamRoom.request('counter',items);return true;}
  return act('counter',items);
 },
 withdrawProposal:()=>{
  const role=window.DreamRoom?.role||'solo',id=game.counterProposal?.id;
  if(!['solo','player'].includes(role)||busy||!id)throw Error('当前无法撤回');
  if(role==='player'){if(!DreamRoom.canPlay())return false;DreamRoom.request('withdrawCounter',id);return true;}
  return act('withdrawCounter',id);
 },
 decideProposal:accept=>{
  if(window.DreamRoom?.role!=='host'||busy||typeof accept!=='boolean')throw Error('只有房主可以审核要求');
  game.decideCounter(game.counterProposal?.id,accept);offerStarted=Date.now();render();DreamRoom.changed();return true;
 }
});
window.ReshufflePrompt?.init({getGame:()=>game,isBusy:()=>busy||shuffling(),request:()=>{
 const role=window.DreamRoom?.role||'solo';if(!['player','solo'].includes(role)||busy||shuffling())throw Error('当前无法请求洗牌');
 const request={confirmed:true,gameId:game.gameId};
 if(role==='player'){if(!DreamRoom.canPlay())return false;DreamRoom.request('requestReshuffle',request);return true;}
 return act('requestReshuffle',request);
},review:async(id,approved)=>{
 const role=window.DreamRoom?.role||'solo';if(!['host','solo'].includes(role)||busy||shuffling())throw Error('只有房主可以决定是否重新洗牌');
 game.reviewReshuffleRequest(id,approved);
 if(!approved){render();window.DreamRoom?.changed();return true;}
 const config=JSON.parse(JSON.stringify(game.config));game=new DreamEngine(Math.random,config);game.started=true;
 log=['<span>重新洗牌 · 房主已批准</span><strong>求求熊二大王了，我是你的兵</strong>'];offerStarted=0;lastBanterAt=-Infinity;
 await startAnimation(false,'求求熊二大王了，我是你的兵','player');window.DreamRoom?.changed();return true;
}});
async function confirmNumericPool(id,config){
 const role=window.DreamRoom?.role||'solo';if(!['host','solo'].includes(role)||busy||shuffling()||reshuffleWaiting()||window.DreamRoom?.connected===false)throw Error('请由在线房主最终确认数值');
 const previous=JSON.stringify(game.config),preset=game.directorPreset;const approved=game.decidePoolProposal(id,config);
 game=new DreamEngine(Math.random,approved);game.started=false;if(preset!==null&&previous===JSON.stringify(game.config))game.setTreasure(preset);
 log=[];offerStarted=0;lastBanterAt=-Infinity;window.MobilePages?.focus('game');await startAnimation();window.DreamRoom?.changed();return true;
}
window.NumericStart?.init({getGame:()=>game,isBusy:()=>busy||shuffling()||reshuffleWaiting(),isConnected:()=>window.DreamRoom?.connected!==false,
 submit:async config=>{const role=window.DreamRoom?.role||'solo';if(!['player','solo'].includes(role)||busy||shuffling())throw Error('当前无法提交数值');if(role==='player'){if(!DreamRoom.canPlay())throw Error('连接恢复后再提交，草稿会保留');DreamRoom.request('poolProposal',{gameId:game.gameId,config});return true;}if(game.started!==false)throw Error('请在开始前确认数值');const proposal=game.submitPoolProposal(config);render();return confirmNumericPool(proposal.id,config);},
 approve:confirmNumericPool,
 reject:id=>{if(window.DreamRoom?.role!=='host'||busy||shuffling()||DreamRoom.connected===false)throw Error('只有在线房主可退回方案');game.decidePoolProposal(id,null);render();DreamRoom.changed();return true;}
});
window.MobilePages?.init({getGame:()=>game});
render();
window.OwnerDesk?.init(bundle=>{if(!window.DreamRoom||DreamRoom.role!=='host'||game.phase!=='pricing'||reshuffleWaiting())return;if(game.mode==='gift')game.setBundle(bundle);else game.setNumericOffer(bundle.value);offerStarted=Date.now();render();DreamRoom.changed();});
window.DreamRoom?.init({render,reset,act,
 prepareRoom:()=>{game.started=false;render();},
 publicState:()=>RoomCore.publicState(game),
 save:()=>({game:game.snapshot(),original:game.original||null,offerStarted}),
 restore:s=>{if(!s)return false;game=Object.assign(new DreamEngine(),s.game);const needStart=!Object.prototype.hasOwnProperty.call(s.game,'started')&&s.game.phase==='select',oldCadence=s.game.cadence!=='2-2-2-1',migrated=needStart||oldCadence||!Object.prototype.hasOwnProperty.call(s.game,'initialSelected')||s.game.pricesVersion!=='car1500';if(needStart)game.started=false;if(s.game.pricesVersion!=='car1500'){game.pricesVersion='car1500';for(const key of ['offer','result','lastDeclinedOffer'])game[key]=DreamEngine.reprice(game[key]);if(game.comparison){game.comparison.alternative=DreamEngine.reprice(game.comparison.alternative);game._compare(game.comparison.kind,game.comparison.alternative);}}game.initialSelected??=game.selected;game.finalChoice??=null;if(oldCadence){game.cadence='2-2-2-1';if(['offer','pricing'].includes(game.phase)&&!DreamEngine.QUOTE_ROUNDS.includes(game.round)){game.phase=game.round>=7?'final':'open';game.offer=null;}if(game.phase==='open'){game.offer=null;if(game.round>=7)game.phase='final';}}if(game.stageEvent?.active){game.stageEvent.active=false;busy=false;}game.original=s.original;const numericStartMigrated=game.mode!=='gift'&&game.phase==='select'&&game.selected===null&&!Object.prototype.hasOwnProperty.call(s.game,'poolProposal');if(numericStartMigrated)game.started=false;const moneyMigrated=normalizeMoneyState(game);offerStarted=s.offerStarted||0;log=game.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${pool()[game.boxes[b]].name}</strong>`).reverse();render();return migrated||moneyMigrated||numericStartMigrated;},
 loadPublic:s=>{const previous=game.phase;game=s;game.mode??='gift';game.gifts=game.mode==='gift'?DreamEngine.GIFTS:s.pool.map(g=>({...g,score:g.value}));normalizeMoneyState(game);busy=false;log=s.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${pool()[s.boxes[b]].name}</strong>`).reverse();render();if(previous!=='ended'&&s.phase==='ended'){celebrate();tone(true)}}
});





