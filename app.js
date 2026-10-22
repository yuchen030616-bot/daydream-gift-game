const $=id=>document.getElementById(id);
const assets=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
let game=new DreamEngine(),busy=false,muted=true,log=[],offerStarted=0;
const pool=()=>game.gifts||DreamEngine.GIFTS;
const shuffling=()=>game.stageEvent?.kind==='shuffle'&&game.stageEvent.active===true;
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
function render(){const p=game.phase,playable=!window.DreamRoom||DreamRoom.canPlay();document.body.dataset.phase=p;$('round').textContent=String(game.round).padStart(2,'0');$('progress').value=game.round;
const hints={select:['先选一个，留住你的梦想','点击一个编号箱，作为本局保留箱。'],pricing:['等待房主给你报价','本轮礼物已揭晓，房主正在决定这一口价。'],open:['排除一个箱子，离梦想更近一步','打开其他箱子，看看哪份礼物与本局告别。'],offer:['这份估值，你愿意收下吗？','接受即终止本局；继续则放弃当前估值。'],final:['最后两箱，换还是不换？','保留原箱或换成另一箱，选择后立即揭晓。'],ended:['这一局，梦想已有答案','可以看看原箱，或重新开启一段梦想。']};$('phase').textContent=hints[p][0];$('hint').textContent=p==='open'?`再开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 个箱子，就会收到下一份报价。`:hints[p][1];
$('boxes').innerHTML=game.boxes.map((gi,i)=>{const selected=game.selected===i,initial=i===(game.initialSelected??game.selected),gift=selected&&game.finalChoice?game.result:initial&&game.original?game.original:game.opened.includes(i)?pool()[gi]:null,opened=!!gift;return `<button class="box ${opened?'opened':''} ${selected?'selected':''}" data-box="${i}" ${busy||shuffling()||game.started===false||p!=='select'&&(p!=='open'||selected||opened)?'disabled':''} aria-label="${i+1}号箱${opened?'，已开出'+gift.name:selected?'，我的梦想箱':''}"><span class="box-number">${String(i+1).padStart(2,'0')}</span>${opened?art(gift,'box-icon'): '<span class="box-icon">✦</span>'}<span class="box-name">${opened?gift.name:selected?'我的梦想箱':initial?'原保留箱':'未知的心动'}</span></button>`}).join('');
$('prizes').innerHTML=pool().map((g,i)=>{const out=game.opened.some(b=>game.boxes[b]===i);return `<div class="prize ${out?'eliminated':''}"><span class="prize-rank">${String(i+1).padStart(2,'0')}</span><span class="prize-icon">${art(g)}</span><strong class="prize-name">${g.name}</strong><span class="prize-value">${out?'已揭晓':(game.mode==='gift'?i===0:g.value===Math.max(...pool().map(x=>x.value)))?(game.mode==='gift'?'终极大奖':'本局最高'):'待揭晓'}</span></div>`}).join('');
$('myBox').innerHTML=game.selected===null?'<span>等待选择</span>':`<strong>${String(game.selected+1).padStart(2,'0')}</strong><span>号梦想箱 · 为你保留</span>`;
const reward=p==='ended'?game.result:['final','pricing'].includes(p)?null:game.offer;$('offer').innerHTML=reward?`${art(reward)}<strong>${reward.name}</strong>`:`<span class="waiting-star">✧</span><strong>${p==='pricing'?'等待房主报价':p==='open'?'本轮开箱后报价':p==='final'?'保留原箱，还是换箱？':'等待第一份估值'}</strong>`;
const quips=['嘿嘿，俺掐爪一算，给你「{gift}」！签了吧，俺还赶着吃蜂蜜呢。','哎呀，开走的可不退哦～「{gift}」，俺这回可是咬着牙报的！','还惦记嘉年华呐？先瞅瞅俺的「{gift}」，心动就别嘴硬嘛。','俺这算盘都快搓冒烟了！「{gift}」，再多一滴蜂蜜也没有啦。','你瞅俺这真诚的小眼神～「{gift}」，现在收下，俺绝不反悔！','还敢继续？有点东西哦！先给你「{gift}」，要不咱见好就收？','最后这口价「{gift}」！俺把蜂蜜罐都押……咳，差点说漏嘴。'];
const remaining=pool().filter((_,i)=>!game.opened.some(b=>game.boxes[b]===i));const smallest=remaining.reduce((a,b)=>a.score<b.score?a:b);
const riskQuips=[`嘿嘿，万一最后就剩「${smallest.name}」呢？俺这份「{gift}」可是稳稳当当的，要不见好就收？`,`大的你想要，小的你又怕～「{gift}」先落袋，总比最后捧着「${smallest.name}」干瞪眼强吧？`,`别光盯着大奖呀，「${smallest.name}」还在里面等你呢！俺给「{gift}」，这踏实劲儿可得算进去。`];
if($('bearLine'))$('bearLine').textContent=p==='offer'?(game.offer.reason==='低奖风险'?riskQuips[(game.round-1)%riskQuips.length]:quips[(game.round-1)%quips.length]).replace('{gift}',game.offer.name):p==='ended'?`嘿嘿，成交「${game.result.name}」！俺这买卖做得……咳，祝你开心！`:p==='pricing'?'嘿嘿，等俺掰掰爪子，下一口价马上来！':p==='final'?'嘿嘿，最后两箱啦！守住老朋友，还是换个新梦想？选好可就开啦～':p==='open'?`这轮还要开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 箱，开完俺再报！`:'嘿嘿，先挑个箱子吧！俺这算盘，今天可不一定向着你哦。';
$('offerNote').textContent=p==='ended'?'本局最终礼物':p==='offer'?(game.offer.issuer==='host'?'房主已出价 · 是否终止？':'本轮模拟估值 · 是否终止？'):p==='pricing'?'房主确认后，报价会同步给所有人':p==='final'?'最后一次选择：保留原箱或换箱，立即揭晓结果':'按2→2→2→1开箱报价，最后可保留或换箱';
$('accept').hidden=p!=='offer';$('continue').hidden=p!=='offer';$('reveal').hidden=!['final','ended'].includes(p);$('reveal').textContent=p==='final'?'打开我的梦想箱 ✦':'看看原箱藏着什么';$('history').innerHTML=log.length?log.map(x=>`<li>${x}</li>`).join(''):'<li>梦想档案将在开箱后记录</li>';
if(!playable||busy||shuffling()){document.querySelectorAll('[data-box]').forEach(b=>b.disabled=true);['accept','continue','reveal','swap'].forEach(id=>$(id).disabled=true);}else ['accept','continue','reveal','swap'].forEach(id=>$(id).disabled=false);
$('reset').disabled=busy||shuffling()||!!window.DreamRoom&&!['host','solo'].includes(DreamRoom.role);
const shownReserve=game.finalChoice?game.result:game.original;if(shownReserve)$('myBox').innerHTML=`${art(shownReserve)}<strong>${shownReserve.name}</strong><span>${game.selected+1}号梦盒 · ${game.finalChoice==='swap'?'已换箱':game.finalChoice==='keep'?'保留原箱':'原箱已揭晓'}</span>`;
$('swap').hidden=p!=='final';const other=game.boxes.findIndex((_,i)=>i!==game.selected&&!game.opened.includes(i));$('swap').textContent=other>=0?`换成 ${other+1} 号箱 · 立即开箱`:'换成另一箱';if(p==='final'){$('reveal').textContent=`保留 ${game.selected+1} 号箱 · 立即开箱`;$('hint').textContent=`原箱是 ${game.selected+1} 号，另一箱是 ${other+1} 号。选择后立即揭晓，不能再换。`;}
if(game.finalChoice)$('history').innerHTML=`<li><span>最终选择</span><strong>${game.finalChoice==='swap'?`换箱 ${game.initialSelected+1} → ${game.selected+1} 号`:`保留 ${game.selected+1} 号箱`}</strong></li>`+$('history').innerHTML;
if(game.started===false){$('phase').textContent='等待主播开始游戏';$('hint').textContent='主播确认开始后，本局才会开放选箱。';}
window.GameModes?.decorate(game);
if($('startSolo')){$('startSolo').hidden=!!window.DreamRoom&&DreamRoom.role!=='solo'||p!=='select'||game.selected!==null;$('startSolo').disabled=busy||shuffling();}
window.OwnerDesk?.render(game);
window.QuotePopup?.render(game,$('bearLine').textContent);
window.Showtime?.render(game);
window.PlayerStart?.render(game);
window.AdminDesk?.render(game);
window.GameModes?.render(game);
window.GameTheatre?.render(game);
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
 drink:['轻松玩一局，喝不喝都随你，咱只比手气。','水杯也能追梦，开心最要紧。','先聊聊方案，参与方式由你决定。','慢慢选，不催不劝，随时能跳过。']
};
function publishBanter(speaker,index){
 if(!Number.isInteger(index)||index<0||index>3||busy||shuffling())throw Error('当前不能放话');
 if(performance.now()-lastBanterAt<3000)throw Error('请稍等片刻再说');
 lastBanterAt=performance.now();const id=crypto.randomUUID(),gid=game.gameId;
 const group=game.mode==='drink'?banterLines.drink[index]:banterLines[speaker][index],key=speaker+':'+index;let text=group;
 if(Array.isArray(group)){const choices=group.map((line,i)=>({line,i})).filter(p=>p.i!==lastBanterPick[key]);const pick=choices[Math.floor(Math.random()*choices.length)];lastBanterPick[key]=pick.i;text=pick.line;}
 game.stageEvent={id,kind:'banter',speaker,text,duration:3000,active:true};render();
 setTimeout(()=>{if(game.gameId===gid&&game.stageEvent?.id===id){game.stageEvent.active=false;render();window.DreamRoom?.changed();}},3000);
}
async function startAnimation(start=true){
 if(busy||game.phase!=='select'||game.selected!==null)throw Error('当前不能洗牌');
 if(start)game.start();
 const id=crypto.randomUUID(),gid=game.gameId;busy=true;game.stageEvent={id,kind:'shuffle',speaker:'host',text:'九只梦盒，重新藏好。',duration:2200,active:true};
 render();window.DreamRoom?.changed();
 await new Promise(resolve=>setTimeout(resolve,2200));
 if(game.gameId===gid&&game.stageEvent?.id===id){game.stageEvent.active=false;busy=false;render();}
}
async function act(action,index){
 if((busy||shuffling())&&action!=='reset')throw Error('请等待动画结束');
 if(action==='start')await startAnimation();
 else if(action==='shuffle'){if(window.DreamRoom&&DreamRoom.role!=='solo')throw Error('当前不能操作');await startAnimation(false);}
 else if(action==='banter')publishBanter('player',index);
 else if(action==='applyConfig'){
  if(!index||game.mode==='gift'||index.mode!==game.mode||game.phase!=='select'||game.selected!==null||window.DreamRoom?.role==='host'&&game.started!==false)throw Error('只能在开始前修改本版数值');
  game.configure(index);log=[];offerStarted=0;render();
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
function reset(){const config=game.mode!=='gift'?game.config:null;game=new DreamEngine(Math.random,config);game.started=window.DreamRoom?.role!=='host';if(game.mode==='gift')window.AdminDesk?.prepare(game);log=[];offerStarted=0;lastBanterAt=-Infinity;render()}
$('rules').onclick=()=>{if(game.mode!=='gift'){show('爱做梦的熊二 · '+(game.mode==='drink'?'轻饮玩法':'金额玩法'),'<ol><li>设置范围，自动生成九个数，逐项修改后点击确认使用。</li><li>开始并看完洗牌，再保留一只箱子。</li><li>按2→2→2→1开其他箱，每轮决定接受报价或继续。</li><li>最后两箱可保留或换箱，选择后立即结算。</li></ol><p>'+(game.mode==='drink'?'仅限成年人自愿参与，小口数为游戏标记。可随时跳过、不喝，或用水等无酒精饮品替代，不限时、不劝酒。':'金额用于娱乐模拟，不触发转账或支付。')+'</p><p>房间由房主选择版本，玩家可在开始前修改本版数值；房主保持页面打开以同步游戏。</p>');return;}show('梦想家入场指南','<ol><li>先选一个编号箱，作为你的梦想箱。</li><li>逐个打开其他箱子，开出的礼物将被排除。</li><li>按2、2、2、1个箱子分四轮开箱，每轮后等待报价。</li><li>接受报价即可终止；继续则放弃当次报价。</li><li>第四次报价后选择继续，在最后两箱中选择保留原箱或换箱，立即揭晓。</li></ol><p>九种礼物每局各一份，礼物可由房主预设或在未开箱之间调整，不保证随机结果。设置绑定箱号，换箱后领取新箱内的礼物。一位主播操作，其他人可用房间码围观；房主需保持页面打开。单人模式由熊二按剩余奖池与游戏过程自动估值。礼物名称用于娱乐模拟，不自动发送真实礼物或触发支付。</p>');};
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'音效：关':'音效：开';$('sound').setAttribute('aria-pressed',!muted);tone()};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{show('全屏提示','<p>当前浏览器暂不支持全屏，可使用 F11 放大游戏画面。</p>')}};
document.addEventListener('keydown',e=>{if($('adminDialog')?.open||$('playerStartDialog')?.open||$('resultDialog')?.open||$('roomNameDialog')?.open||$('modal').open||$('quoteDialog').open||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA/.test(e.target?.tagName))return;if(/^[1-9]$/.test(e.key))dispatch('box',Number(e.key)-1)});
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<38;i++){const a=document.createElement('i');a.className='confetti';a.style.cssText=`left:${Math.random()*100}%;animation-delay:${Math.random()*.5}s;background:${['#b9904e','#a33450','#f3dca5'][i%3]}`;document.body.append(a);setTimeout(()=>a.remove(),3500)}}
window.AdminDesk?.init({
 getGame:()=>game,isBusy:()=>busy,
 change:(gift,target)=>{if(!AdminDesk.authorized()||busy)throw Error('当前不可操作，请确认房主身份并等待开箱结束');game.setTreasure(gift,target);render();window.DreamRoom?.changed();},
 clear:()=>{if(!AdminDesk.authorized()||busy)throw Error('当前不可操作');game.clearTreasurePreset();render();window.DreamRoom?.changed();},
 restart:()=>{if(!AdminDesk.authorized()||busy)throw Error('当前不可操作');dispatch('reset');}
});
window.PlayerStart?.init(dispatch);
window.GameModes?.init({getGame:()=>game,isBusy:()=>busy||shuffling(),show,dispatch,
 applyConfig:config=>{
  if(window.DreamRoom?.role==='player'){dispatch('applyConfig',config);return;}
  if(window.DreamRoom&&!['host','solo'].includes(DreamRoom.role)||busy)throw Error('当前没有设置权限');
  if(config.mode!==game.mode||game.mode==='gift')throw Error('请选择当前版本');
  game.configure(config);log=[];offerStarted=0;render();window.DreamRoom?.changed();
 },
 switchMode:config=>{
  if(window.DreamRoom&&!['host','solo'].includes(DreamRoom.role)||busy)throw Error('只有房主可切换版本');
  game=new DreamEngine(Math.random,config);game.started=window.DreamRoom?.role!=='host';log=[];offerStarted=0;lastBanterAt=-Infinity;render();window.DreamRoom?.changed();
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
if(window.GameTheatre){document.querySelector('.stage-top').insertAdjacentHTML('afterend','<button id="startSolo" class="secondary" type="button">开始 · 打乱宝箱 ✦</button>');$('startSolo').onclick=()=>dispatch('shuffle');}
window.Showtime?.init({decision:dispatch,art});
window.QuotePopup?.init({decision:dispatch,art});
render();
window.OwnerDesk?.init(bundle=>{if(!window.DreamRoom||DreamRoom.role!=='host'||game.phase!=='pricing')return;if(game.mode==='gift')game.setBundle(bundle);else game.setNumericOffer(bundle.value);offerStarted=Date.now();render();DreamRoom.changed();});
window.DreamRoom?.init({render,reset,act,
 prepareRoom:()=>{game.started=false;render();},
 publicState:()=>RoomCore.publicState(game),
 save:()=>({game:game.snapshot(),original:game.original||null,offerStarted}),
 restore:s=>{if(!s)return false;game=Object.assign(new DreamEngine(),s.game);const needStart=!Object.prototype.hasOwnProperty.call(s.game,'started')&&s.game.phase==='select',oldCadence=s.game.cadence!=='2-2-2-1',migrated=needStart||oldCadence||!Object.prototype.hasOwnProperty.call(s.game,'initialSelected')||s.game.pricesVersion!=='car1500';if(needStart)game.started=false;if(s.game.pricesVersion!=='car1500'){game.pricesVersion='car1500';for(const key of ['offer','result','lastDeclinedOffer'])game[key]=DreamEngine.reprice(game[key]);if(game.comparison){game.comparison.alternative=DreamEngine.reprice(game.comparison.alternative);game._compare(game.comparison.kind,game.comparison.alternative);}}game.initialSelected??=game.selected;game.finalChoice??=null;if(oldCadence){game.cadence='2-2-2-1';if(['offer','pricing'].includes(game.phase)&&!DreamEngine.QUOTE_ROUNDS.includes(game.round)){game.phase=game.round>=7?'final':'open';game.offer=null;}if(game.phase==='open'){game.offer=null;if(game.round>=7)game.phase='final';}}if(game.stageEvent?.active){game.stageEvent.active=false;busy=false;}game.original=s.original;const moneyMigrated=normalizeMoneyState(game);offerStarted=s.offerStarted||0;log=game.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${pool()[game.boxes[b]].name}</strong>`).reverse();render();return migrated||moneyMigrated;},
 loadPublic:s=>{const previous=game.phase;game=s;game.mode??='gift';game.gifts=game.mode==='gift'?DreamEngine.GIFTS:s.pool.map(g=>({...g,score:g.value}));normalizeMoneyState(game);busy=false;log=s.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${pool()[s.boxes[b]].name}</strong>`).reverse();render();if(previous!=='ended'&&s.phase==='ended'){celebrate();tone(true)}}
});





