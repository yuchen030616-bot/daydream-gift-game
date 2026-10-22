(function(root){
 'use strict';
 const Engine=typeof DreamEngine!=='undefined'?DreamEngine:typeof require==='function'?require('./engine.js'):null;
 const TITLES={gift:'主播礼物版',money:'普通金额版',drink:'轻饮挑战版'};
 const unit=mode=>mode==='money'?'元':'小口';
 function generate(mode,min,max,rng=Math.random){
  if(!['money','drink'].includes(mode))throw Error('请选择普通版或喝酒版');
  Engine.makePool({mode,min,max});
  const weights=mode==='money'?[1,.7,.45,.25,.12,.06,.025,.01,0]:[1,.875,.75,.625,.5,.375,.25,.125,0];
  const scale=mode==='drink'||Number.isInteger(min)&&Number.isInteger(max)?1:100;
  const values=weights.map((w,i)=>{const r=rng();if(!Number.isFinite(r)||r<0||r>=1)throw Error('随机源无效');const jitter=mode==='money'&&i>0&&i<8?(r-.5)*.025:0;return Math.max(min,Math.min(max,Math.round((min+(max-min)*Math.max(0,Math.min(1,w+jitter)))*scale)/scale));}).sort((a,b)=>b-a);
  return Engine.makePool({mode,min,max,values}).config;
 }
 const defaults=mode=>mode==='gift'?{mode:'gift'}:generate(mode,mode==='money'?1:0,mode==='money'?1000:3);
 if(typeof module!=='undefined'&&module.exports){module.exports={generate,defaults,unit,TITLES};return;}
 const $=id=>document.getElementById(id);
 let api,current,draftKey='',pendingSwitch=null;
 const role=()=>window.DreamRoom?.role||'solo';
 const owner=()=>['host','solo'].includes(role());
 const playable=()=>role()==='solo'||role()==='player'&&DreamRoom.canPlay();
 const configKey=g=>[g.gameId,g.mode||'gift'].join(':');
 const canApply=g=>!api.isBusy()&&g.phase==='select'&&g.selected===null&&(owner()||role()==='player'&&DreamRoom.canPlay()&&g.started===false);
 function feedback(text,error=false){$('modeFeedback').textContent=text;$('modeFeedback').classList.toggle('is-error',error);}
 function remembered(mode){try{const value=JSON.parse(localStorage.getItem('daydream.pool.'+mode));if(value&&value.mode===mode)return Engine.makePool(value).config;}catch{}return defaults(mode);}
 function remember(config){try{localStorage.setItem('daydream.pool.'+config.mode,JSON.stringify(config));}catch{}}
 function writeDraft(config){
  $('modeMin').value=String(config.min);$('modeMax').value=String(config.max);
  const step=config.mode==='drink'?'1':'.01',max=config.mode==='drink'?5:1000000;
  for(const id of ['modeMin','modeMax']){$(id).step=step;$(id).max=String(max);$(id).min='0';}
  $('modeValues').innerHTML=config.values.map((value,i)=>`<label>${String(i+1).padStart(2,'0')} 号数值<input type="number" data-pool-value="${i}" aria-label="第${i+1}项数值" min="${config.min}" max="${config.max}" step="${step}" inputmode="decimal" value="${value}"><span>${unit(config.mode)}</span></label>`).join('');
  for(const input of document.querySelectorAll('[data-pool-value]'))input.oninput=()=>feedback('已修改草稿，点“确认使用”后才会进入宝箱。');
 }
 function readNumber(id){const raw=$(id).value.trim();if(raw==='')throw Error('请填写范围，0也是有效数值');return Number(raw);}
 function apply(){
  try{const g=api.getGame();if(!canApply(g))throw Error('只能在本局选箱前应用数值；房间中请先等待同步');const min=readNumber('modeMin'),max=readNumber('modeMax');const values=Array.from(document.querySelectorAll('[data-pool-value]'),n=>{if(n.value.trim()==='')throw Error('请填好全部九个数值');return Number(n.value);});const config=Engine.makePool({mode:g.mode,min,max,values}).config;api.applyConfig(config);remember(config);feedback(role()==='player'?'已发送，等待房主确认数值。':'九个数值已应用并重新打乱。');}catch(e){feedback(e.message,true);}
 }
 function switchMode(mode){
  try{if(!owner())throw Error('房间版本由房主切换');if(api.isBusy())throw Error('动画进行中，请稍后切换');if(!TITLES[mode])throw Error('无效版本');const g=api.getGame();if((g.mode||'gift')===mode){$('modeSetup').scrollIntoView({behavior:'smooth',block:'start'});return;}
   const perform=()=>{api.switchMode(remembered(mode));pendingSwitch=null;};
   if(!['select','ended'].includes(g.phase)){pendingSwitch={mode,key:configKey(g)};api.show('切换到'+TITLES[mode]+'？','<p>切换会结束当前这局并重新准备九只宝箱。房间码与在线连接保留。</p><button id="confirmModeSwitch" class="primary" type="button">确认切换版本</button>');$('confirmModeSwitch').onclick=()=>{if(!owner()||!pendingSwitch||configKey(api.getGame())!==pendingSwitch.key){$('modal').close();feedback('对局已变化，请重新选择版本。',true);return;}$('modal').close();perform();};}
   else perform();
  }catch(e){feedback(e.message,true);}
 }
 function decorate(g){
  const mode=g.mode||'gift',numeric=mode!=='gift',drink=mode==='drink',pool=g.gifts||g.pool||Engine.GIFTS;
  document.body.dataset.edition=mode;
  if($('gameSubtitle'))$('gameSubtitle').textContent=TITLES[mode];
  if($('gameTagline'))$('gameTagline').textContent=mode==='gift'?'梦想可以很大，熊二的报价可不一定。':drink?'轻松玩一局，喝不喝、怎么参与，都由你决定。':'九个金额，一只梦想箱。这口价，你收不收？';
  if($('topDream'))$('topDream').textContent=numeric?Math.max(...pool.map(x=>x.value))+' '+unit(mode):'嘉年华';
  if($('topDreamLabel'))$('topDreamLabel').textContent=drink?'本局数值上限':numeric?'本局最高金额':'本场终极梦想';
  if($('collectionTitle'))$('collectionTitle').textContent=drink?'轻饮数值册':numeric?'九档梦想金额':'梦想礼物册';
  if($('adminEntry'))$('adminEntry').hidden=numeric;
  const rule=document.querySelector('.room-config-rule');if(rule)rule.textContent=numeric?(drink?'小口数为自愿互动标记，可随时跳过或用水替代；配置由房主与玩家在开始前确认。':'本局金额仅作娱乐模拟，不自动转账。数值由房主与玩家在开始前确认，换箱领取新箱内金额。'):'游戏规则：礼物可由房主预设或调整，不保证随机结果。换箱后领取新箱内礼物。';
  if(!numeric)return;
  if($('bearLine'))$('bearLine').textContent=g.phase==='offer'?(drink?'这份方案是「'+g.offer.name+'」。自愿参与，随时可以跳过或用无酒精饮品替代。':'俺掐爪一算，这口价「'+g.offer.name+'」！收下稳稳当当，继续就看你的手气啦。'):g.phase==='ended'?(drink?'本局结果「'+g.result.name+'」。按你舒服的方式参与，跳过也没关系。':'成交「'+g.result.name+'」！这份梦想，先替你收好啦。'):drink?'按自己的节奏玩，随时可跳过，不劝酒。':'嘿嘿，九个金额已经装箱，先选一只属于你的梦想箱。';
  if($('offerNote'))$('offerNote').textContent=g.phase==='ended'?'本局最终'+(drink?'方案':'金额'):g.phase==='pricing'?'等待房主给出'+(drink?'自愿方案':'金额报价'):drink?'口数为游戏标记，不规定饮用容量；可直接跳过。':'金额仅作娱乐模拟，不触发转账或支付。';
  if(drink){$('accept').textContent='接受此方案 · 自愿参与';$('continue').textContent='继续开箱';if(g.comparison?.kind==='skip')$('reveal').hidden=true;}
 }
 function render(g){
  if(!api)return;current=g;const mode=g.mode||'gift',numeric=mode!=='gift';
  for(const b of document.querySelectorAll('[data-mode]')){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!owner()||api.isBusy();}
  $('modeSetup').hidden=!numeric;$('skipDrink').hidden=mode!=='drink'||g.phase==='ended';$('skipDrink').disabled=!playable()||api.isBusy();
  if(!numeric){$('accept').textContent='接受估值 · 终止追梦 ↗';$('continue').textContent='继续追梦 →';return;}
  $('modeSetupTitle').textContent=mode==='money'?'先定金额范围，再微调九个数':'先定小口数，再自由修改九项';
  $('modeSetupNote').textContent=mode==='money'?'金额单位为元，只用于娱乐模拟。填范围后自动生成九个数；不满意的数字可直接改，确认后再装箱。':'以“小口数”为游戏标记，范围0至5，0代表不喝。不限时，不劝酒，也可用无酒精饮品替代。';
  const note=document.querySelector('.mode-drink-note');if(note)note.hidden=mode!=='drink';
  if(configKey(g)!==draftKey){draftKey=configKey(g);const config={mode,min:g.config?.min??0,max:g.config?.max??(mode==='drink'?3:1000),values:(g.gifts||g.pool).map(x=>x.value)};writeDraft(config);feedback(owner()?'数值可逐项修改，选箱前确认即可。':role()==='player'?'稍后开始后可先调整数值；选箱前提交给房主确认。':'本房间配置由房主与操作玩家设置。');}
  const edit=!api.isBusy()&&(owner()||role()==='player'&&DreamRoom.canPlay()&&g.phase==='select'&&g.selected===null&&g.started===false);
  for(const n of document.querySelectorAll('#modeSetup input'))n.disabled=!edit;$('generateValues').disabled=!edit;$('applyValues').disabled=!canApply(g);
 }
 root.GameModes={generate,defaults,remembered,remember,decorate,render,canApply,
  init(options){api=options;
   for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>switchMode(b.dataset.mode);
   $('generateValues').onclick=()=>{try{const g=api.getGame();if(!owner()&&!(role()==='player'&&DreamRoom.canPlay()&&g.started===false&&g.phase==='select'))throw Error('当前不能编辑数值');if(api.isBusy())throw Error('请等待动画结束');const config=generate(g.mode,readNumber('modeMin'),readNumber('modeMax'));writeDraft(config);feedback('已生成九个数，可以逐项修改；确认后才会装箱。');}catch(e){feedback(e.message,true);}};
   $('applyValues').onclick=apply;for(const id of ['modeMin','modeMax'])$(id).oninput=()=>feedback('范围已改，点“自动生成”或同步调整九项，再确认使用。');
   document.querySelector('.decision-actions').insertAdjacentHTML('beforeend','<button id="skipDrink" class="secondary" type="button" hidden>本局跳过 · 不喝</button>');$('skipDrink').onclick=()=>{if(playable()&&!api.isBusy())api.dispatch('skip');};
  },openSettings(){if(current?.mode!=='gift')$('modeSetup').scrollIntoView({behavior:'smooth',block:'start'});}
 };
})(typeof window!=='undefined'?window:null);
