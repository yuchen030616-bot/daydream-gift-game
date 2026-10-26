(function(root){
 'use strict';
 const Engine=typeof DreamEngine!=='undefined'?DreamEngine:typeof require==='function'?require('./engine.js'):null;
 const TITLES={gift:'主播礼物版',money:'普通金额版',drink:'轻饮挑战版'};
 const unit=mode=>mode==='money'?'元':'小口';
 const actorName=mode=>mode==='money'||mode==='drink'?'玩家':'主播';
 function generate(mode,min,max,rng=Math.random,previous=[],targetMean=null){
  if(!['money','drink'].includes(mode))throw Error('请选择普通版或喝酒版');
  const limits=Engine.makePool({mode,min,max}).config;min=limits.min;max=limits.max;
  const random=()=>{const r=rng();if(!Number.isFinite(r)||r<0||r>=1)throw Error('随机源无效');return r;};
  if(mode==='drink'){
   const values=Array.from({length:9},(_,i)=>{const r=random();return i===0?max:i===8?min:min+Math.floor(r*(max-min+1));}).sort((a,b)=>b-a);
   if(min<max&&values.every((v,i)=>v===previous[i])){values[4]+=values[4]<max?1:-1;values.sort((a,b)=>b-a);}
   return Engine.makePool({mode,min,max,values}).config;
  }
  const low=Math.round(min*100),high=Math.round(max*100);
  if(high-low<8)throw Error('范围至少相差0.08元，才能生成九个不同金额；请扩大最小值与最大值的间距。');
  const targeted=targetMean!==null&&targetMean!==undefined&&targetMean!=='';
  if(targeted&&(typeof targetMean!=='number'||!Number.isFinite(targetMean)||targetMean<0||targetMean>1000000))throw Error('参考均价须为0至1000000之间的有效金额');
  const target=targeted?Math.round(targetMean*100):null;let chosen,last;
  for(const step of [1000,100,1]){
   const first=Math.floor(low/step)+1,lastIndex=Math.ceil(high/step)-1;if(lastIndex-first+1<7)continue;
   const minSum=7*first+21,maxSum=7*lastIndex-21,base=low+high;
   last={min:(base+step*minSum)/900,max:(base+step*maxSum)/900};
   const desired=targeted?Math.max(minSum,Math.min(maxSum,Math.round((target*9-base)/step))):null;
   if(targeted&&(Math.abs(base+step*desired-target*9)/9>1))continue;
   chosen={step,first,lastIndex,desired};break;
  }
  if(!chosen)throw Error('保留范围两端且九个金额不重复时，参考均价须在 '+last.min.toFixed(2)+' 至 '+last.max.toFixed(2)+' 元之间；请调整参考均价或范围。');
  const {step,first,lastIndex}=chosen,k=[];
  for(let i=0;i<7;i++){const point=low+(high-low)*(i+1+(random()-.5)*.25)/8;const floor=i?k[i-1]+1:first;k.push(Math.max(floor,Math.min(lastIndex-(6-i),Math.round(point/step))));}
  if(targeted){let diff=chosen.desired-k.reduce((sum,value)=>sum+value,0);
   for(let pass=0;diff&&pass<100;pass++)for(let offset=0;offset<7&&diff;offset++){
    const i=(offset+pass)%7,capacity=diff>0?(i===6?lastIndex:k[i+1]-1)-k[i]:k[i]-(i===0?first:k[i-1]+1);
    const delta=Math.min(Math.abs(diff),Math.max(1,Math.ceil(Math.abs(diff)/7)),capacity);if(delta>0){const signed=diff>0?delta:-delta;k[i]+=signed;diff-=signed;}
   }
   if(diff)for(const i of diff>0?[6,5,4,3,2,1,0]:[0,1,2,3,4,5,6]){const capacity=diff>0?(i===6?lastIndex:k[i+1]-1)-k[i]:k[i]-(i===0?first:k[i-1]+1);const delta=Math.min(Math.abs(diff),capacity),signed=diff>0?delta:-delta;k[i]+=signed;diff-=signed;}
  }
  let values=[low,...k.map(value=>value*step),high].sort((a,b)=>b-a).map(value=>value/100);
  if(values.every((value,i)=>value===previous[i])){
   outer:for(let i=0;i<7;i++)for(const direction of [1,-1]){const next=k[i]+direction;if(next<(i?k[i-1]+1:first)||next>(i===6?lastIndex:k[i+1]-1))continue;
    if(targeted){for(let j=0;j<7;j++){if(j===i)continue;const other=k[j]-direction;const adjusted=k.map((v,n)=>n===i?next:n===j?other:v);if(adjusted.every((v,n)=>v>=first&&v<=lastIndex&&(!n||v>adjusted[n-1]))){k.splice(0,7,...adjusted);break outer;}}}
    else{k[i]=next;break outer;}
   }
   values=[low,...k.map(value=>value*step),high].sort((a,b)=>b-a).map(value=>value/100);
  }
  return Engine.makePool({mode,min,max,values}).config;
 }
 const defaults=mode=>mode==='gift'?{mode:'gift'}:generate(mode,mode==='money'?1:0,mode==='money'?1000:3);
 if(typeof module!=='undefined'&&module.exports){module.exports={generate,defaults,unit,TITLES,actorName};return;}
 const $=id=>document.getElementById(id);
 let api,current,draftKey='',pendingSwitch=null;
 const role=()=>window.DreamRoom?.role||'solo';
 const owner=()=>['host','solo'].includes(role());
 const seriesActive=()=>{const s=window.DreamRoom?.series;return !!s&&!['completed','ended'].includes(s.status);};
 const seriesLocked=()=>window.DreamRoom?.seriesConfigured===true;
 const playable=()=>role()==='solo'||role()==='player'&&DreamRoom.canPlay();
 const configKey=g=>[g.gameId,g.mode||'gift'].join(':');
 const canApply=g=>!seriesLocked()&&!api.isBusy()&&g.phase==='select'&&g.selected===null&&(owner()||role()==='player'&&DreamRoom.canPlay()&&g.started===false);
 function feedback(text,error=false){$('modeFeedback').textContent=text;$('modeFeedback').classList.toggle('is-error',error);}
 function remembered(mode){try{const value=JSON.parse(localStorage.getItem('daydream.pool.'+mode));if(value&&value.mode===mode)return Engine.makePool(value).config;}catch{}return defaults(mode);}
 function remember(config){try{localStorage.setItem('daydream.pool.'+config.mode,JSON.stringify(config));}catch{}}
 function writeDraft(config){
  $('modeMin').value=String(config.min);$('modeMax').value=String(config.max);
  const step=config.mode==='money'?'0.01':'1',max=config.mode==='drink'?5:1000000;
  for(const id of ['modeMin','modeMax']){$(id).step=step;$(id).max=String(max);$(id).min='0';}
  if($('modeMeanField'))$('modeMeanField').hidden=config.mode!=='money';
  $('modeValues').innerHTML=config.values.map((value,i)=>`<label>${String(i+1).padStart(2,'0')} 号数值<input type="number" data-pool-value="${i}" aria-label="第${i+1}项数值" min="${config.min}" max="${config.max}" step="${step}" inputmode="decimal" value="${value}"><span>${unit(config.mode)}</span></label>`).join('');
  for(const input of document.querySelectorAll('[data-pool-value]')){input.oninput=()=>feedback('已修改草稿，点“确认使用”后才会进入宝箱。');input.onchange=()=>roundInput(input,config.mode);}
 }
 function roundInput(input,mode){if(mode!=='money'||input.value.trim()==='')return;const value=Number(input.value);if(Number.isFinite(value)&&value>=0&&value<=1000000){input.value=String(Math.round(value*100)/100);feedback('已保留最多两位小数；修改后点“确认使用”。');}}
 function readNumber(id){const raw=$(id).value.trim();if(raw==='')throw Error('请填写范围，0也是有效数值');return Number(raw);}
 function switchError(error){const text=error?.message||String(error);feedback(text,true);const blocker=document.querySelector?.('dialog[open]');if(blocker&&blocker!==$('modal')){const note=document.createElement?.('p');if(note){note.textContent=text;note.setAttribute('role','status');blocker.append(note);}return;}const escaped=text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));api.show('暂时无法更换模式','<p>'+escaped+'</p>');}
 function apply(){
  try{const g=api.getGame();if(seriesLocked())throw Error('本大局沿用首局金额，不能重新设置九个数值');if(!canApply(g))throw Error('只能在本局选箱前应用数值；房间中请先等待同步');const min=readNumber('modeMin'),max=readNumber('modeMax');const values=Array.from(document.querySelectorAll('[data-pool-value]'),n=>{if(n.value.trim()==='')throw Error('请填好全部九个数值');return Number(n.value);});const config=Engine.makePool({mode:g.mode,min,max,values}).config;if(window.NumericStart?.intercept(config))return;api.applyConfig(config);remember(config);feedback(role()==='player'?'已发送，等待房主确认数值。':'九个数值已应用并重新打乱。');}catch(e){feedback(e.message,true);}
 }
 function switchMode(mode){
  try{if(!owner())throw Error('房间版本由房主切换');if(api.isBusy())throw Error('动画进行中，请稍后切换');if(!TITLES[mode])throw Error('无效版本');const g=api.getGame();if(seriesActive()&&(g.mode||'gift')!==mode)throw Error('计分对战进行中，不能切换版本；请先结束本大局');if((g.mode||'gift')===mode){if(!window.MobilePages?.focus('settings'))$('modeSetup').scrollIntoView({behavior:'smooth',block:'start'});return;}
   const perform=()=>{if(!owner())throw Error('只有房主可更换模式');if(api.isBusy())throw Error('动画或房间请求进行中，请稍后再更换模式');if(seriesActive())throw Error('计分对战进行中，不能切换版本；请先结束本大局');const result=api.switchMode(remembered(mode));pendingSwitch=null;Promise.resolve(result).catch(switchError);};
   if(!['select','ended'].includes(g.phase)){pendingSwitch={mode,key:configKey(g)};api.show('切换到'+TITLES[mode]+'？','<p>切换会结束当前这局并重新准备九只宝箱。房间码与在线连接保留。</p><button id="confirmModeSwitch" class="primary" type="button">确认切换版本</button>');$('confirmModeSwitch').onclick=()=>{try{if(!owner())throw Error('只有房主可更换模式');if(api.isBusy())throw Error('动画或房间请求进行中，请稍后再试');if(!pendingSwitch||configKey(api.getGame())!==pendingSwitch.key)throw Error('对局已变化，请重新选择模式');$('modal').close();perform();}catch(error){pendingSwitch=null;switchError(error);}};}
   else perform();
  }catch(e){switchError(e);}
 }
 function openSwitcher(){
  if(!api||document.querySelector?.('dialog[open]'))return false;
  const allowed=owner()&&!seriesActive();api.show('更换游戏模式','<p>'+(seriesActive()?'计分对战进行中。九档金额仅首局确认，本大局沿用；结束大局后才可切换版本。':allowed?'选择本房间的游戏模式。进行中的对局会再次要求确认。':'当前为'+(role()==='watch'?'围观席':actorName(api.getGame().mode)+'操作席')+'，游戏模式由房主更换。请联系房主选择版本。')+'</p>'+Object.entries(TITLES).map(([mode,title])=>`<button id="switchEdition${mode}" class="secondary" type="button" ${allowed?'':'disabled'}>${title}</button>`).join(''));
  for(const mode of Object.keys(TITLES)){const button=$('switchEdition'+mode);if(button)button.onclick=()=>{if(!owner()){switchError(Error('游戏模式由房主更换'));return;}$('modal').close();switchMode(mode);};}return true;
 }
 function decorate(g){
  const mode=g.mode||'gift',numeric=mode!=='gift',drink=mode==='drink',pool=g.gifts||g.pool||Engine.GIFTS;
  const actor=actorName(mode);
  if($('roomIntro'))$('roomIntro').textContent=role()==='host'?'你正在房主观看席。把'+actor+'操作邀请发给负责开箱的人，其他人可使用围观邀请加入。':role()==='player'?'你正在'+actor+'操作席。选箱、开箱和决定会同步给房主及围观者。':role()==='watch'?'你正在围观。'+actor+'的选箱、开箱和最终结果会实时同步。':'创建房间，把'+actor+'操作邀请发给负责开箱的人；其他人可输入房间码围观。';
  for(const [id,heading,caption]of [['roomLinkArea',actor+'操作席',' · 发给负责开箱的人'],['watchLinkArea','围观邀请',' · 可分享给多人']]){
   const label=$(id)?.querySelector?.('label');if(!label)continue;
   const badge=label.querySelector?.('.room-invitation-badge'),children=Array.from(label.childNodes||[]),texts=children.filter(n=>n.nodeType===3);
   if(badge){const after=children.slice(children.indexOf(badge)+1).find(n=>n.nodeType===3);for(const text of texts)text.textContent='';badge.textContent=heading+(after?'':caption);if(after)after.textContent=caption;}
   else if(texts.length){texts[0].textContent=heading+caption;for(const text of texts.slice(1))text.textContent='';}
  }
  if($('copyPlayer'))$('copyPlayer').textContent='复制'+actor+'操作邀请';if($('copyWatch'))$('copyWatch').textContent='复制围观邀请';
  document.body.dataset.edition=mode;
  if($('gameSubtitle'))$('gameSubtitle').textContent=TITLES[mode];
  if($('gameTagline'))$('gameTagline').textContent=mode==='gift'?'梦想可以很大，熊二的报价可不一定。':drink?'轻松玩一局，喝不喝、怎么参与，都由你决定。':'九个金额，一只梦想箱。这口价，你收不收？';
  if($('topDream'))$('topDream').textContent=numeric?Math.max(...pool.map(x=>x.value))+' '+unit(mode):'嘉年华';
  if($('topDreamLabel'))$('topDreamLabel').textContent=drink?'本局数值上限':numeric?'本局最高金额':'本场终极梦想';
  if($('collectionTitle'))$('collectionTitle').textContent=drink?'轻饮数值册':numeric?'九档梦想金额':'梦想礼物册';
  if($('adminEntry'))$('adminEntry').hidden=false;
  const rule=document.querySelector('.room-config-rule');if(rule)rule.textContent=numeric?(drink?'小口数为自愿互动标记，可随时跳过或用水替代；未开箱数值可由房主调整，换箱领取新箱内方案。':'本局金额仅作娱乐模拟，不自动转账。未开箱金额可由房主调整，不保证随机结果；换箱领取新箱内金额。'):'游戏规则：礼物可由房主预设或调整，不保证随机结果。换箱后领取新箱内礼物。';
  if(!numeric)return;
  if($('bearLine'))$('bearLine').textContent=g.phase==='offer'?(drink?'这份方案是「'+g.offer.name+'」。自愿参与，随时可以跳过或用无酒精饮品替代。':'俺掐爪一算，这口价「'+g.offer.name+'」！收下稳稳当当，继续就看你的手气啦。'):g.phase==='ended'?(drink?'本局结果「'+g.result.name+'」。按你舒服的方式参与，跳过也没关系。':'成交「'+g.result.name+'」！这份梦想，先替你收好啦。'):drink?'按自己的节奏玩，随时可跳过，不劝酒。':'嘿嘿，九个金额已经装箱，先选一只属于你的梦想箱。';
  if($('offerNote'))$('offerNote').textContent=g.phase==='ended'?'本局最终'+(drink?'方案':'金额'):g.phase==='pricing'?'等待房主给出'+(drink?'自愿方案':'金额报价'):drink?'口数为游戏标记，不规定饮用容量；可直接跳过。':'金额仅作娱乐模拟，不触发转账或支付。';
  if(drink){$('accept').textContent='接受此方案 · 自愿参与';$('continue').textContent='继续开箱';if(g.comparison?.kind==='skip')$('reveal').hidden=true;}
 }
 function render(g){
  if(!api)return;current=g;const mode=g.mode||'gift',numeric=mode!=='gift';
  for(const b of document.querySelectorAll('[data-mode]')){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!owner()||api.isBusy()||seriesActive()&&b.dataset.mode!==mode;}
  $('modeSetup').hidden=!numeric;$('skipDrink').hidden=mode!=='drink'||g.phase==='ended';$('skipDrink').disabled=!playable()||api.isBusy();
  if(!numeric){$('accept').textContent='接受估值 · 终止追梦 ↗';$('continue').textContent='继续追梦 →';return;}
  $('modeSetupTitle').textContent=mode==='money'?'先定金额范围，再微调九个数':'先定小口数，再自由修改九项';
  $('modeSetupNote').textContent=mode==='money'?'九个金额自动分散生成且不重复，范围不够会提示扩大。可选参考均价，生成后仍可逐项修改并提交房主确认。填好范围，点“自动生成并使用”即可装箱；不满意的数字可直接改，再点确认。':'以“小口数”为游戏标记，范围0至5，0代表不喝。点“自动生成并使用”即可装箱；可随时跳过或用无酒精饮品替代。';
  const note=document.querySelector('.mode-drink-note');if(note)note.hidden=mode!=='drink';
  if(configKey(g)!==draftKey){if($('modeMean'))$('modeMean').value='';draftKey=configKey(g);const config={mode,min:g.config?.min??0,max:g.config?.max??(mode==='drink'?3:1000),values:(g.gifts||g.pool).map(x=>x.value)};writeDraft(config);feedback(owner()?'数值可逐项修改，选箱前确认即可。':role()==='player'?'稍后开始后可先调整数值；选箱前提交给房主确认。':'本房间配置由房主与操作玩家设置。');}
  const edit=canApply(g)&&(!g.poolProposal||g.poolProposal.status!=='pending'||window.NumericStart?.editing());
  for(const n of document.querySelectorAll('#modeSetup input'))n.disabled=!edit;$('generateValues').disabled=!edit;$('applyValues').disabled=!canApply(g);
  $('generateValues').textContent=g.phase==='select'?'自动生成并使用九个数 ↗':'已开局 · 重置后生成';
  if(g.phase!=='select')feedback(g.phase==='ended'?'本局已结束，重置本局后可重新生成数字。':'本局数字已锁定；重置本局后可重新生成，当前宝箱不会被修改。');
 }
 root.GameModes={generate,defaults,remembered,remember,decorate,render,canApply,openSwitcher,actorName,setDraft:config=>writeDraft(Engine.makePool(config).config),
  init(options){api=options;
   $('modeValues').insertAdjacentHTML('beforebegin','<label id="modeMeanField" class="mode-mean-field">参考均价（可选，仅用于生成）<input id="modeMean" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" placeholder="留空则均匀分散"><small>九个金额互不相同并保留范围两端；生成后仍可编辑，再交房主确认。</small></label>');
   for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>switchMode(b.dataset.mode);
   $('generateValues').onclick=()=>{try{const g=api.getGame();if(!canApply(g))throw Error('只能在选箱前生成，已开局请先重置；联机请等待连接就绪');const previous=Array.from(document.querySelectorAll('[data-pool-value]'),n=>Number(n.value));const config=generate(g.mode,readNumber('modeMin'),readNumber('modeMax'),Math.random,previous,g.mode==='money'&&$('modeMean')?.value.trim()!==''?Number($('modeMean').value):null);writeDraft(config);if(window.NumericStart?.editing()){feedback((role()==='solo'?'已生成九项草稿，确认后直接洗牌。':'已生成九项草稿，提交后由房主最终确认。')+(g.mode==='money'?'本次九项均价 '+(config.values.reduce((sum,value)=>sum+value,0)/9).toFixed(2)+' 元。':''));return;}api.applyConfig(config);remember(config);feedback((role()==='player'?'九个数已生成，正在同步到房间。':'九个数已生成并装入宝箱，可以开始。')+(config.min===config.max?'范围上下限相同，因此九个数相同。':'不满意可再生成，或逐项修改后确认。'));if(!window.MobilePages?.focus('settings'))$('modeValues').scrollIntoView?.({behavior:'smooth',block:'center'});}catch(e){feedback(e.message,true);}};
   $('applyValues').onclick=apply;for(const id of ['modeMin','modeMax']){$(id).oninput=()=>feedback('范围已改，点“自动生成并使用”，或调整九项后确认。');$(id).onchange=()=>roundInput($(id),api.getGame().mode);}
   document.querySelector('.decision-actions').insertAdjacentHTML('beforeend','<button id="skipDrink" class="secondary" type="button" hidden>本局跳过 · 不喝</button>');$('skipDrink').onclick=()=>{if(playable()&&!api.isBusy())api.dispatch('skip');};
  },openSettings(){if(seriesLocked()){api.show('本大局金额已固定','<p>九档金额仅首局确认，本大局沿用。无需重新设置，开始本局即可直接洗牌。</p>');return false;}if(current?.mode!=='gift'&&!window.MobilePages?.focus('settings'))$('modeSetup').scrollIntoView({behavior:'smooth',block:'start'});}
 };
})(typeof window!=='undefined'?window:null);
