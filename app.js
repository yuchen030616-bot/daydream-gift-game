const $=id=>document.getElementById(id);
const assets=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
let game=new DreamEngine(),busy=false,muted=true,log=[],offerStarted=0;
function art(g,cls='gift-art'){const visual=g.items?.[0]||g;const i=DreamEngine.GIFTS.findIndex(x=>x.name===visual.name);return `<img class="${cls}" src="assets/${assets[i]}" alt="${visual.name}">`;}
function tone(win=false){if(muted)return;try{const a=new(window.AudioContext||window.webkitAudioContext)();[0,1,2].forEach((n)=>{const o=a.createOscillator(),v=a.createGain();o.connect(v);v.connect(a.destination);o.frequency.value=(win?523:330)*[1,1.25,1.5][n];v.gain.setValueAtTime(.035,a.currentTime+n*.1);v.gain.exponentialRampToValueAtTime(.001,a.currentTime+n*.1+.35);o.start(a.currentTime+n*.1);o.stop(a.currentTime+n*.1+.4)});setTimeout(()=>a.close(),1000)}catch{}}
function render(){const p=game.phase,playable=!window.DreamRoom||DreamRoom.canPlay();document.body.dataset.phase=p;$('round').textContent=String(game.round).padStart(2,'0');$('progress').value=game.round;
const hints={select:['先选一个，留住你的梦想','点击一个编号箱，作为本局保留箱。'],pricing:['等待房主给你报价','本轮礼物已揭晓，房主正在决定这一口价。'],open:['排除一个箱子，离梦想更近一步','打开其他箱子，看看哪份礼物与本局告别。'],offer:['这份估值，你愿意收下吗？','接受即终止本局；继续则放弃当前估值。'],final:['最后一箱，答案就在你手里','打开最初保留的暗箱，揭晓最终礼物。'],ended:['这一局，梦想已有答案','可以看看原箱，或重新开启一段梦想。']};$('phase').textContent=hints[p][0];$('hint').textContent=p==='open'?`再开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 个箱子，就会收到下一份报价。`:hints[p][1];
$('boxes').innerHTML=game.boxes.map((gi,i)=>{const selected=game.selected===i,opened=game.opened.includes(i)||selected&&!!game.original,gift=selected&&game.original?game.original:DreamEngine.GIFTS[gi];return `<button class="box ${opened?'opened':''} ${selected?'selected':''}" data-box="${i}" ${busy||p!=='select'&&(p!=='open'||selected||opened)?'disabled':''} aria-label="${i+1}号箱${opened?'，已开出'+gift.name:selected?'，我的梦想箱':''}"><span class="box-number">${String(i+1).padStart(2,'0')}</span>${opened?art(gift,'box-icon'): '<span class="box-icon">✦</span>'}<span class="box-name">${opened?gift.name:selected?'我的梦想箱':'未知的心动'}</span></button>`}).join('');
$('prizes').innerHTML=DreamEngine.GIFTS.map((g,i)=>{const out=game.opened.some(b=>game.boxes[b]===i);return `<div class="prize ${out?'eliminated':''}"><span class="prize-rank">${String(i+1).padStart(2,'0')}</span><span class="prize-icon">${art(g)}</span><strong class="prize-name">${g.name}</strong><span class="prize-value">${out?'已揭晓':i===0?'终极大奖':'待揭晓'}</span></div>`}).join('');
$('myBox').innerHTML=game.selected===null?'<span>等待选择</span>':`<strong>${String(game.selected+1).padStart(2,'0')}</strong><span>号梦想箱 · 为你保留</span>`;
const reward=p==='ended'?game.result:['final','pricing'].includes(p)?null:game.offer;$('offer').innerHTML=reward?`${art(reward)}<strong>${reward.name}</strong>`:`<span class="waiting-star">✧</span><strong>${p==='pricing'?'等待房主报价':p==='open'?'本轮开箱后报价':p==='final'?'揭晓你的保留箱':'等待第一份估值'}</strong>`;
const quips=['嘿嘿，俺掐爪一算，给你「{gift}」！签了吧，俺还赶着吃蜂蜜呢。','哎呀，开走的可不退哦～「{gift}」，俺这回可是咬着牙报的！','还惦记嘉年华呐？先瞅瞅俺的「{gift}」，心动就别嘴硬嘛。','俺这算盘都快搓冒烟了！「{gift}」，再多一滴蜂蜜也没有啦。','你瞅俺这真诚的小眼神～「{gift}」，现在收下，俺绝不反悔！','还敢继续？有点东西哦！先给你「{gift}」，要不咱见好就收？','最后这口价「{gift}」！俺把蜂蜜罐都押……咳，差点说漏嘴。'];
const remaining=DreamEngine.GIFTS.filter((_,i)=>!game.opened.some(b=>game.boxes[b]===i));const smallest=remaining.reduce((a,b)=>a.score<b.score?a:b);
const riskQuips=[`嘿嘿，万一最后就剩「${smallest.name}」呢？俺这份「{gift}」可是稳稳当当的，要不见好就收？`,`大的你想要，小的你又怕～「{gift}」先落袋，总比最后捧着「${smallest.name}」干瞪眼强吧？`,`别光盯着大奖呀，「${smallest.name}」还在里面等你呢！俺给「{gift}」，这踏实劲儿可得算进去。`];
if($('bearLine'))$('bearLine').textContent=p==='offer'?(game.offer.reason==='低奖风险'?riskQuips[(game.round-1)%riskQuips.length]:quips[(game.round-1)%quips.length]).replace('{gift}',game.offer.name):p==='ended'?`嘿嘿，成交「${game.result.name}」！俺这买卖做得……咳，祝你开心！`:p==='pricing'?'嘿嘿，等俺掰掰爪子，下一口价马上来！':p==='final'?'哎哟，你居然扛到最后啦！快开箱，俺都替你捏把汗。':p==='open'?`这轮还要开 ${DreamEngine.QUOTE_ROUNDS.find(n=>n>game.round)-game.round} 箱，开完俺再报！`:'嘿嘿，先挑个箱子吧！俺这算盘，今天可不一定向着你哦。';
$('offerNote').textContent=p==='ended'?'本局最终礼物':p==='offer'?(game.offer.issuer==='host'?'房主已出价 · 是否终止？':'本轮模拟估值 · 是否终止？'):p==='pricing'?'房主确认后，报价会同步给所有人':p==='final'?'揭晓你的保留箱，领取最终结果':'按2→2→2→1开箱报价，最后揭晓保留箱';
$('accept').hidden=p!=='offer';$('continue').hidden=p!=='offer';$('reveal').hidden=!['final','ended'].includes(p);$('reveal').textContent=p==='final'?'打开我的梦想箱 ✦':'看看原箱藏着什么';$('history').innerHTML=log.length?log.map(x=>`<li>${x}</li>`).join(''):'<li>梦想档案将在开箱后记录</li>';
if(!playable){document.querySelectorAll('[data-box]').forEach(b=>b.disabled=true);['accept','continue','reveal'].forEach(id=>$(id).disabled=true);}else ['accept','continue','reveal'].forEach(id=>$(id).disabled=false);
$('reset').disabled=!!window.DreamRoom&&DreamRoom.role!=='host'&&!playable;
if(game.original)$('myBox').innerHTML=`${art(game.original)}<strong>${game.original.name}</strong><span>${game.selected+1}号原箱 · 已揭晓</span>`;
window.OwnerDesk?.render(game);
}
async function choose(i){if(busy)return;try{if(game.phase==='select'){game.select(i);tone();render();return}if(game.phase!=='open')return;busy=true;const b=document.querySelector(`[data-box="${i}"]`);b?.classList.add('revealing');document.querySelectorAll('[data-box]').forEach(x=>x.disabled=true);tone();await new Promise(r=>setTimeout(r,550));game.open(i,!!window.DreamRoom&&DreamRoom.role==='host');const g=DreamEngine.GIFTS[game.boxes[i]];log.unshift(`<span>第 ${game.round} 轮 · ${i+1}号箱</span><strong>${g.name}</strong>`);busy=false;offerStarted=Date.now();render();if(game.phase==='offer')$('accept').focus();else if(game.phase==='final')$('reveal').focus()}catch(e){busy=false;render();throw e;}}
async function act(action,index){
 if(action==='box')await choose(index);
 else if(action==='continue'){game.continue(offerStarted?Date.now()-offerStarted:0);render()}
 else if(action==='accept'){game.accept();render();celebrate();tone(true)}
 else if(action==='reveal'){const wasFinal=game.phase==='final',g=game.reveal();game.original=g;render();if(wasFinal){celebrate();tone(true)}else show('原箱揭晓',`<div class="reveal-gift">${art(g)}<h3>${g.name}</h3><p>你已锁定的本局结果：${game.result.name}</p></div>`)}
 else if(action==='reset')reset();else throw Error('无效操作');
}
function dispatch(action,index){if(window.DreamRoom&&DreamRoom.request(action,index))return;act(action,index).then(()=>window.DreamRoom?.changed()).catch(()=>render());}
$('boxes').onclick=e=>{const b=e.target.closest('[data-box]');if(b)dispatch('box',Number(b.dataset.box))};
$('continue').onclick=()=>dispatch('continue');
$('accept').onclick=()=>dispatch('accept');
$('reveal').onclick=()=>dispatch('reveal');
function show(title,body){$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modal').showModal()}
$('closeModal').onclick=()=>$('modal').close();
$('reset').onclick=()=>{if(busy)return;if(!['select','ended'].includes(game.phase)){show('重新开始这一局？','<p>当前梦想箱与估值将被清空，重新随机分配九份礼物。房间内所有人将同步重置。</p><button id="confirmReset" class="primary">确认重新开局</button>');$('confirmReset').onclick=()=>{$('modal').close();dispatch('reset')}}else dispatch('reset')};
function reset(){game=new DreamEngine();log=[];offerStarted=0;render()}
$('rules').onclick=()=>show('梦想家入场指南','<ol><li>先选一个编号箱，作为你的梦想箱。</li><li>逐个打开其他箱子，开出的礼物将被排除。</li><li>按2、2、2、1个箱子分四轮开箱，每轮后等待报价。</li><li>接受报价即可终止；继续则放弃当次报价。</li><li>第四次报价后选择继续，最后揭晓保留箱中的礼物。</li></ol><p>九种礼物每局各一个、随机分配。一位主播操作，其他人可用房间码围观；房主需保持页面打开。单人模式由熊二按剩余奖池与游戏过程自动估值。礼物名称用于娱乐模拟，不自动发送真实礼物或触发支付。</p>');
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'音效：关':'音效：开';$('sound').setAttribute('aria-pressed',!muted);tone()};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{show('全屏提示','<p>当前浏览器暂不支持全屏，可使用 F11 放大游戏画面。</p>')}};
document.addEventListener('keydown',e=>{if($('modal').open||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA/.test(e.target?.tagName))return;if(/^[1-9]$/.test(e.key))dispatch('box',Number(e.key)-1)});
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<38;i++){const a=document.createElement('i');a.className='confetti';a.style.cssText=`left:${Math.random()*100}%;animation-delay:${Math.random()*.5}s;background:${['#b9904e','#a33450','#f3dca5'][i%3]}`;document.body.append(a);setTimeout(()=>a.remove(),3500)}}
render();
window.OwnerDesk?.init(bundle=>{if(!window.DreamRoom||DreamRoom.role!=='host'||game.phase!=='pricing')return;game.setBundle(bundle);offerStarted=Date.now();render();DreamRoom.changed();});
window.DreamRoom?.init({render,reset,act,
 publicState:()=>RoomCore.publicState(game),
 save:()=>({game:game.snapshot(),original:game.original||null,offerStarted}),
 restore:s=>{if(!s)return false;game=Object.assign(new DreamEngine(),s.game);const migrated=s.game.cadence!=='2-2-2-1';if(migrated){game.cadence='2-2-2-1';if(['offer','pricing'].includes(game.phase)&&!DreamEngine.QUOTE_ROUNDS.includes(game.round)){game.phase=game.round>=7?'final':'open';game.offer=null;}if(game.phase==='open'){game.offer=null;if(game.round>=7)game.phase='final';}}game.original=s.original;offerStarted=s.offerStarted||0;log=game.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${DreamEngine.GIFTS[game.boxes[b]].name}</strong>`).reverse();render();return migrated;},
 loadPublic:s=>{const previous=game.phase;game=s;busy=false;log=s.opened.map((b,i)=>`<span>第 ${i+1} 轮 · ${b+1}号箱</span><strong>${DreamEngine.GIFTS[s.boxes[b]].name}</strong>`).reverse();render();if(previous!=='ended'&&s.phase==='ended'){celebrate();tone(true)}}
});





