const $=id=>document.getElementById(id);
const assets=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
let game=new DreamEngine(),busy=false,muted=true,log=[],offerStarted=0;
function art(g,cls='gift-art'){const visual=g.items?.[0]||g;const i=DreamEngine.GIFTS.findIndex(x=>x.name===visual.name);return `<img class="${cls}" src="assets/${assets[i]}" alt="${visual.name}">`;}
function tone(win=false){if(muted)return;try{const a=new(window.AudioContext||window.webkitAudioContext)();[0,1,2].forEach((n)=>{const o=a.createOscillator(),v=a.createGain();o.connect(v);v.connect(a.destination);o.frequency.value=(win?523:330)*[1,1.25,1.5][n];v.gain.setValueAtTime(.035,a.currentTime+n*.1);v.gain.exponentialRampToValueAtTime(.001,a.currentTime+n*.1+.35);o.start(a.currentTime+n*.1);o.stop(a.currentTime+n*.1+.4)});setTimeout(()=>a.close(),1000)}catch{}}
function render(){const p=game.phase;document.body.dataset.phase=p;$('round').textContent=String(game.round).padStart(2,'0');$('progress').value=game.round;
const hints={select:['先选一个，留住你的梦想','点击一个编号箱，作为本局保留箱。'],open:['排除一个箱子，离梦想更近一步','打开其他箱子，看看哪份礼物与本局告别。'],offer:['这份估值，你愿意收下吗？','接受即终止本局；继续则放弃当前估值。'],final:['最后一箱，答案就在你手里','所有其他礼物已揭晓，打开你的梦想箱。'],ended:['这一局，梦想已有答案','可以看看原箱，或重新开启一段梦想。']};$('phase').textContent=hints[p][0];$('hint').textContent=hints[p][1];
$('boxes').innerHTML=game.boxes.map((gi,i)=>{const opened=game.opened.includes(i),selected=game.selected===i;return `<button class="box ${opened?'opened':''} ${selected?'selected':''}" data-box="${i}" ${busy||p!=='select'&&(p!=='open'||selected||opened)?'disabled':''} aria-label="${i+1}号箱${selected?'，我的梦想箱':opened?'，已开出'+DreamEngine.GIFTS[gi].name:''}"><span class="box-number">${String(i+1).padStart(2,'0')}</span>${opened?art(DreamEngine.GIFTS[gi],'box-icon'): '<span class="box-icon">✦</span>'}<span class="box-name">${opened?DreamEngine.GIFTS[gi].name:selected?'我的梦想箱':'未知的心动'}</span></button>`}).join('');
$('prizes').innerHTML=DreamEngine.GIFTS.map((g,i)=>{const out=game.opened.some(b=>game.boxes[b]===i);return `<div class="prize ${out?'eliminated':''}"><span class="prize-rank">${String(i+1).padStart(2,'0')}</span><span class="prize-icon">${art(g)}</span><strong class="prize-name">${g.name}</strong><span class="prize-value">${out?'已揭晓':i===0?'终极大奖':'待揭晓'}</span></div>`}).join('');
$('myBox').innerHTML=game.selected===null?'<span>等待选择</span>':`<strong>${String(game.selected+1).padStart(2,'0')}</strong><span>号梦想箱 · 为你保留</span>`;
const reward=p==='ended'?game.result:p==='final'?null:game.offer;$('offer').innerHTML=reward?`${art(reward)}<strong>${reward.name}</strong>`:'<span class="waiting-star">✧</span><strong>等待第一份估值</strong>';
const quips=['嘿嘿，俺掐爪一算，给你「{gift}」！签了吧，俺还赶着吃蜂蜜呢。','哎呀，开走的可不退哦～「{gift}」，俺这回可是咬着牙报的！','还惦记嘉年华呐？先瞅瞅俺的「{gift}」，心动就别嘴硬嘛。','俺这算盘都快搓冒烟了！「{gift}」，再多一滴蜂蜜也没有啦。','你瞅俺这真诚的小眼神～「{gift}」，现在收下，俺绝不反悔！','还敢继续？有点东西哦！先给你「{gift}」，要不咱见好就收？','最后这口价「{gift}」！俺把蜂蜜罐都押……咳，差点说漏嘴。'];
const smallest=DreamEngine.GIFTS[game.boxes.filter((_,i)=>!game.opened.includes(i)).reduce((a,b)=>DreamEngine.GIFTS[a].score<DreamEngine.GIFTS[b].score?a:b)];
const riskQuips=[`嘿嘿，万一最后就剩「${smallest.name}」呢？俺这份「{gift}」可是稳稳当当的，要不见好就收？`,`大的你想要，小的你又怕～「{gift}」先落袋，总比最后捧着「${smallest.name}」干瞪眼强吧？`,`别光盯着大奖呀，「${smallest.name}」还在里面等你呢！俺给「{gift}」，这踏实劲儿可得算进去。`];
if($('bearLine'))$('bearLine').textContent=p==='offer'?(game.offer.reason==='低奖风险'?riskQuips[(game.round-1)%riskQuips.length]:quips[(game.round-1)%quips.length]).replace('{gift}',game.offer.name):p==='ended'?`嘿嘿，成交「${game.result.name}」！俺这买卖做得……咳，祝你开心！`:p==='final'?'哎哟，你居然扛到最后啦！快开箱，俺都替你捏把汗。':p==='open'?'又不收？行行行，继续开！俺倒要看看你能沉住几口气～':'嘿嘿，先挑个箱子吧！俺这算盘，今天可不一定向着你哦。';
$('offerNote').textContent=p==='ended'?'本局最终礼物':p==='offer'?'本轮模拟估值 · 是否终止？':p==='final'?'揭晓你的保留箱，领取最终结果':'每开一箱，收到一份新的礼物估值';
$('accept').hidden=p!=='offer';$('continue').hidden=p!=='offer';$('reveal').hidden=!['final','ended'].includes(p);$('reveal').textContent=p==='final'?'打开我的梦想箱 ✦':'看看原箱藏着什么';$('history').innerHTML=log.length?log.map(x=>`<li>${x}</li>`).join(''):'<li>梦想档案将在开箱后记录</li>';
}
async function choose(i){if(busy)return;try{if(game.phase==='select'){game.select(i);tone();render();return}if(game.phase!=='open')return;busy=true;const b=document.querySelector(`[data-box="${i}"]`);b?.classList.add('revealing');document.querySelectorAll('[data-box]').forEach(x=>x.disabled=true);tone();await new Promise(r=>setTimeout(r,550));game.open(i);const g=DreamEngine.GIFTS[game.boxes[i]];log.unshift(`<span>第 ${game.round} 轮 · ${i+1}号箱</span><strong>${g.name}</strong>`);busy=false;offerStarted=Date.now();render();if(game.phase==='offer')$('accept').focus();else $('reveal').focus()}catch(e){busy=false;render();}}
$('boxes').onclick=e=>{const b=e.target.closest('[data-box]');if(b)choose(Number(b.dataset.box))};
$('continue').onclick=()=>{game.continue(offerStarted?Date.now()-offerStarted:0);render()};
$('accept').onclick=()=>{game.accept();render();celebrate();tone(true)};
$('reveal').onclick=()=>{if(game.phase==='final'){game.reveal();render();celebrate();tone(true)}else{const g=game.reveal();show('原箱揭晓',`<div class="reveal-gift">${art(g)}<h3>${g.name}</h3><p>你已锁定的本局结果：${game.result.name}</p></div>`)}};
function show(title,body){$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modal').showModal()}
$('closeModal').onclick=()=>$('modal').close();
$('reset').onclick=()=>{if(busy)return;if(!['select','ended'].includes(game.phase)){show('重新开始这一局？','<p>当前梦想箱与估值将被清空，重新随机分配九份礼物。</p><button id="confirmReset" class="primary">确认重新开局</button>');$('confirmReset').onclick=()=>{$('modal').close();reset()}}else reset()};
function reset(){game=new DreamEngine();log=[];render()}
$('rules').onclick=()=>show('梦想家入场指南','<ol><li>先选一个编号箱，作为你的梦想箱。</li><li>逐个打开其他箱子，开出的礼物将被排除。</li><li>每开一箱，系统给出新的礼物估值。</li><li>接受估值即可终止；继续则放弃当次估值。</li><li>坚持到最后，揭晓并获得保留箱中的礼物。</li></ol><p>九种礼物每局各一个、随机分配。估值按全部未揭晓礼物的平均梦想分打折，并根据拒绝次数、思考时长和奖池变化调整；小奖概率较高且大小奖差距明显时，也会考虑保底的吸引力降低报价；报价可为两档礼物的组合，最高不超过剩余期望的84%。礼物名称用于娱乐模拟，不自动发送真实礼物。</p>');
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'音效：关':'音效：开';$('sound').setAttribute('aria-pressed',!muted);tone()};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{show('全屏提示','<p>当前浏览器暂不支持全屏，可使用 F11 放大游戏画面。</p>')}};
document.addEventListener('keydown',e=>{if($('modal').open||e.ctrlKey||e.metaKey||e.altKey)return;if(/^[1-9]$/.test(e.key))choose(Number(e.key)-1)});
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<38;i++){const a=document.createElement('i');a.className='confetti';a.style.cssText=`left:${Math.random()*100}%;animation-delay:${Math.random()*.5}s;background:${['#b9904e','#a33450','#f3dca5'][i%3]}`;document.body.append(a);setTimeout(()=>a.remove(),3500)}}
render();





