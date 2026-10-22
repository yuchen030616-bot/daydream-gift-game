/* Room-owner console. The password is a local screen lock, never room authority. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),SESSION_MS=15*60*1000;
 const HASH='c48785dc07c8369e512911d4cefbdea2272320a23655efd25e63c925b099d0ea';
 const images=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
 const phases={select:'等待选箱',open:'正在开箱',pricing:'等待你报价',offer:'报价已发出',final:'最后两箱',ended:'本局已结束'};
 let api,current,until=0,unlocking=false,failures=0,blockedUntil=0,confirming=null,peek=false,lastRole='',lastGame='',activeTab='treasure',authEpoch=0;
 const clock=()=>performance.now(),role=()=>window.DreamRoom?.role||'solo';
 const owner=()=>['host','solo'].includes(role());
 const session=()=>until>clock();
 const authorized=()=>session()&&owner();
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const key=g=>[g.gameId,g.phase,g.round,g.selected,(g.opened||[]).join(','),g.directorLog?.length||0].join(':');
 function message(text,error=false){$('adminMessage').textContent=text;$('adminMessage').classList.toggle('is-error',error);}
 function read(name,fallback){try{return JSON.parse(localStorage.getItem(name))??fallback;}catch{return fallback;}}
 function store(name,value){try{localStorage.setItem(name,JSON.stringify(value));return true;}catch{return false;}}
 function nextGift(){const n=read('daydream.admin.next',null);return Number.isInteger(n)&&n>=0&&n<9?n:null;}
 function audit(action,gift=null){
  const rows=read('daydream.admin.audit',[]),safe=Array.isArray(rows)?rows:[];
  safe.unshift({at:Date.now(),action,gift:gift===null?null:DreamEngine.GIFTS[gift].name,gameId:current?.gameId||null});
  store('daydream.admin.audit',safe.slice(0,100));
 }
 function lock(text='已退出管理后台。'){
  authEpoch++;until=0;confirming=null;peek=false;$('adminPassword').value='';$('adminConfirmation').hidden=true;
  $('adminLoginError').textContent=text;if(current)render(current);
 }
 async function login(e){
  e.preventDefault();if(unlocking)return;
  if(clock()<blockedUntil){$('adminLoginError').textContent='输入过于频繁，请稍等30秒再试。';return;}
  unlocking=true;$('adminLoginButton').disabled=true;
  const epoch=authEpoch,value=$('adminPassword').value;$('adminPassword').value='';
  try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('daydream-admin-v1:'+value));
   if(epoch!==authEpoch)return;
   const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!==HASH){failures++;if(failures>=5){blockedUntil=clock()+30000;failures=0;}$('adminLoginError').textContent=blockedUntil>clock()?'已连续输错5次，请30秒后重试。':'密码不正确，请重新输入。';return;}
   until=clock()+SESSION_MS;failures=0;$('adminLoginError').textContent='';message(owner()?'已解锁，仅本设备可见。':'当前设备没有这个房间的管理权限。',!owner());
   render(api.getGame());
  }catch{$('adminLoginError').textContent='当前浏览器无法验证密码，请使用新版微信或浏览器的 HTTPS 页面。';}
  finally{unlocking=false;$('adminLoginButton').disabled=false;}
 }
 function open(){
  window.QuotePopup?.pause();lock('');render(api.getGame());
  $('adminDialog').showModal();if(!session())$('adminPassword').focus();
 }
 function closed(){
  lock('');$('adminSecret').textContent='';$('adminSecret').hidden=true;
  api.getGame()&&window.QuotePopup?.render(api.getGame(),$('bearLine').textContent);
 }
 function cancel(){confirming=null;$('adminConfirmation').hidden=true;}
 function requireControl(){
  if(!authorized())throw Error('请在创建房间的原设备登录管理后台');
  if(api.isBusy())throw Error('正在开箱，请等动画结束再操作');
 }
 function stage(action){
  try{
   requireControl();const g=api.getGame(),gift=Number($('adminGift').value);
   if(action==='treasure'){
    if(!['select','open','pricing','final'].includes(g.phase))throw Error('请等主播继续追梦后再调整，已发出的报价和已结算结果均已锁定');
    if(!Number.isInteger(gift)||gift<0||gift>8||g.opened.some(i=>g.boxes[i]===gift))throw Error('请选择尚未开出的礼物');
   }
   if(action==='clear'&&(g.selected!==null||g.directorPreset===null))throw Error('当前没有可撤回的选箱前预设');
   confirming={action,gift,expected:key(g)};
   $('adminConfirmationText').textContent=action==='restart'?'重新洗牌并结束当前进度？下一局预设会在本次重开时生效，房间内所有人会同步重置。':action==='clear'?'撤回保留箱预设？本局将按当前随机分配继续，操作记录仍会保留。':g.selected===null?`把主播即将选择的保留箱预设为「${DreamEngine.GIFTS[gift].name}」？玩家端会显示“导演设置局”，具体礼物仍保密。`:`把 ${g.selected+1} 号保留箱调整为「${DreamEngine.GIFTS[gift].name}」？将与另一只未开箱交换礼物，玩家端会显示本次调整。`;
   $('adminConfirmation').hidden=false;message('请核对下面的操作，再确认执行。');$('adminConfirm').focus();
  }catch(e){message(e.message,true);}
 }
 function execute(){
  const task=confirming;if(!task)return;
  try{
   requireControl();if(key(api.getGame())!==task.expected)throw Error('对局进度已变化，请重新选择操作');
   cancel();
   if(task.action==='treasure')api.change(task.gift);else if(task.action==='clear')api.clear();else api.restart();
   audit(task.action,task.action==='treasure'?task.gift:null);message(task.action==='restart'?'已重新开局。':'已生效，并同步导演设置提示。');render(api.getGame());
  }catch(e){cancel();message(e.message,true);render(api.getGame());}
 }
 function renderPublic(g){
  const events=g.director?.events||g.directorLog||[],enabled=!!(g.director?.enabled||events.length),banner=$('directorNotice');
  banner.hidden=!enabled;if(!enabled)return;
  const recent=events[events.length-1],label=recent?.action==='treasure'?'房主调整了未开箱中的保留箱礼物':recent?.action==='clear'?'房主已撤回选箱前预设':'房主已设置本局保留箱礼物';
  const restored=recent?.action==='clear'&&g.selected===null;
  $('directorNoticeText').textContent=label+(restored?'，本局已恢复随机分配。':'。本局含房主藏宝设置，具体礼物仍待揭晓。');
  $('directorPublicLog').innerHTML=events.map(e=>`<li>${escape(new Date(e.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))} · ${e.action==='treasure'?'房主调整了保留箱礼物':e.action==='clear'?'房主撤回选箱前预设':'房主启用了保留箱预设'}</li>`).join('');
 }
 function preview(){const i=Number($('adminGift').value);if(!Number.isInteger(i)||i<0||i>8)return;const g=DreamEngine.GIFTS[i];$('adminGiftImage').src='assets/'+images[i];$('adminGiftName').textContent=g.name;$('adminGiftPrice').textContent=g.score.toLocaleString('zh-CN')+' 抖币';}
 function tab(name){activeTab=name;for(const b of document.querySelectorAll('[data-admin-tab]'))b.setAttribute('aria-selected',b.dataset.adminTab===name);for(const p of document.querySelectorAll('[data-admin-page]'))p.hidden=p.dataset.adminPage!==name;}
 function render(g){
  if(!api)return;current=g;renderPublic(g);
  if(lastRole&&lastRole!==role()){until=0;peek=false;cancel();}lastRole=role();
  if(g.gameId!==lastGame){peek=false;cancel();lastGame=g.gameId;}
  const valid=session();$('adminLogin').hidden=valid;$('adminConsole').hidden=!valid;$('adminLogout').hidden=!valid;$('adminDialog').classList.toggle('is-locked',!valid);
  if(!valid){$('adminScope').textContent='管理员登录';return;}
  $('adminScope').textContent=role()==='host'?'房主专属 · 本设备':role()==='solo'?'单人模式 · 本设备':'当前为主播／围观页面';
  $('adminNoAuthority').hidden=owner();$('adminControls').hidden=!owner();if(!owner())return;
  if(confirming&&key(g)!==confirming.expected){cancel();message('对局已更新，未执行的操作已取消，请重新确认。',true);}
  $('adminPhase').textContent=phases[g.phase]||'同步中';$('adminRound').textContent=g.opened.length+' / 7';$('adminReserve').textContent=g.selected===null?'等待选箱':String(g.selected+1).padStart(2,'0')+' 号箱';
  const n=nextGift();$('adminNextStatus').textContent=n===null?'下一局：随机分配':'下一局：保留箱预设为 '+DreamEngine.GIFTS[n].name;
  const allowed=['select','open','pricing','final'].includes(g.phase)&&!api.isBusy();
  $('adminApply').disabled=!allowed;$('adminClear').disabled=g.phase!=='select'||g.directorPreset===null||api.isBusy();$('adminRestart').disabled=api.isBusy();
  $('adminTreasureHint').textContent=g.phase==='offer'?'报价已发出，藏宝暂时锁定。等主播选择继续后可调整。':g.phase==='ended'?'结果已结算，不能改写。可设置下一局或重新开局。':g.selected===null?'选箱前设置：主播选中的那只保留箱将放入指定礼物。':'仅可选择尚未开出的礼物；设置后与其他未开箱交换，已开箱保持原样。';
  for(const option of $('adminGift').options)option.disabled=g.opened.some(b=>g.boxes[b]===Number(option.value));
  if($('adminGift').selectedOptions[0]?.disabled){const first=Array.from($('adminGift').options).find(o=>!o.disabled);if(first)$('adminGift').value=first.value;}
  preview();
  $('adminPeek').textContent=peek?'收起藏宝信息':'查看当前藏宝';
  $('adminSecret').hidden=!peek;
  if(peek)$('adminSecret').textContent=g.selected!==null?'当前保留箱：'+DreamEngine.GIFTS[g.boxes[g.selected]].name:g.directorPreset!==null?'已设预选礼物：'+DreamEngine.GIFTS[g.directorPreset].name:'未设预选，九箱随机分配。';
  const logs=g.directorLog||[];$('adminCurrentLog').innerHTML=logs.length?logs.slice().reverse().map(e=>`<li><time>${escape(new Date(e.at).toLocaleTimeString('zh-CN'))}</time><strong>${e.action==='clear'?'撤回预设':e.action==='preset'?'保留箱预设':'调整保留箱'}</strong><span>${e.giftIndex===undefined?'恢复随机分配':escape(DreamEngine.GIFTS[e.giftIndex]?.name||'未知礼物')}</span></li>`).join(''):'<li>本局尚未使用藏宝设置。</li>';
  const rows=read('daydream.admin.audit',[]);$('adminAudit').innerHTML=Array.isArray(rows)&&rows.length?rows.slice(0,15).map(e=>`<li><time>${escape(new Date(e.at).toLocaleString('zh-CN'))}</time><span>${escape(({treasure:'设置本局藏宝',clear:'撤回本局预设',restart:'重新开局',next:'保存下一局预设',random:'取消下一局预设'})[e.action]||'管理操作')}${e.gift?' · '+escape(e.gift):''}</span></li>`).join(''):'<li>本设备暂时没有管理记录。</li>';
  tab(activeTab);
 }
 window.AdminDesk={
  authorized,
  prepare(g){
   if(!owner())return;const gift=nextGift();if(gift===null)return;
   // Consume a one-round preset only when it can actually be removed from storage.
   if(!store('daydream.admin.next',null))return;g.setTreasure(gift);
  },
  init(options){api=options;
   document.querySelector('.stage').insertAdjacentHTML('afterbegin','<aside id="directorNotice" class="director-notice" role="status" hidden><strong>✦ 导演设置局</strong><p id="directorNoticeText"></p><details><summary>查看设置记录</summary><ol id="directorPublicLog"></ol></details></aside>');
   document.body.insertAdjacentHTML('beforeend',`<dialog id="adminDialog" class="admin-dialog is-locked" aria-labelledby="adminTitle"><header class="admin-header"><div class="admin-wordmark"><img src="assets/bear-negotiator.png" alt="熊二"><div><span class="eyebrow">BEAR'S PRIVATE OFFICE</span><h2 id="adminTitle">熊二 · 管理事务所</h2><p id="adminScope">管理员登录</p></div></div><button id="adminClose" class="admin-icon" type="button" aria-label="关闭管理后台">×</button></header><form id="adminLogin" class="admin-login"><span class="admin-lock-icon" aria-hidden="true">✦</span><h3>管理员，请入座。</h3><p>输入密码，打开你的管理控制台。</p><label for="adminPassword">管理密码</label><input id="adminPassword" type="password" autocomplete="current-password" required maxlength="128" placeholder="请输入管理密码"><p id="adminLoginError" class="admin-error" role="alert"></p><button id="adminLoginButton" class="admin-primary" type="submit">解锁后台 →</button><small>密码只解锁本机界面；多人管理仍需原房主设备。<br>每次打开均需输入密码；关闭后立即锁定。</small></form><section id="adminConsole" hidden><div id="adminNoAuthority" class="admin-empty" hidden><h3>请回到房主页面管理</h3><p>当前设备是主播或围观者。输入密码不会获得他人房间的管理权，请使用创建这个房间的原浏览器。</p></div><div id="adminControls"><div class="admin-overview"><article><span>当前进度</span><strong id="adminPhase"></strong></article><article><span>已开箱</span><strong id="adminRound"></strong></article><article><span>保留箱</span><strong id="adminReserve"></strong></article></div><div class="admin-tabs" role="tablist" aria-label="管理功能"><button type="button" role="tab" data-admin-tab="treasure" aria-selected="true">藏宝设置</button><button type="button" role="tab" data-admin-tab="round" aria-selected="false">新局管理</button><button type="button" role="tab" data-admin-tab="records" aria-selected="false">操作记录</button></div><div class="admin-body"><section data-admin-page="treasure"><div class="admin-section-title"><span>01 / TREASURE CONTROL</span><h3>给这局梦想，设个答案。</h3></div><p id="adminTreasureHint" class="admin-help"></p><div class="admin-treasure-grid"><div class="admin-gift-preview"><img id="adminGiftImage" alt="礼物预览"><strong id="adminGiftName"></strong><span id="adminGiftPrice"></span></div><div class="admin-gift-form"><label for="adminGift">本局保留箱礼物</label><select id="adminGift">${DreamEngine.GIFTS.map((g,i)=>`<option value="${i}">${g.icon} ${g.name}</option>`).join('')}</select><button id="adminApply" class="admin-primary" type="button">设置本局藏宝 →</button><button id="adminClear" class="admin-secondary" type="button">撤回选箱前预设</button></div></div><div class="admin-private"><span>🔒 以下内容仅本设备显示</span><button id="adminPeek" type="button">查看当前藏宝</button><p id="adminSecret" hidden></p></div><div class="admin-disclosure"><strong>导演模式，公开标记。</strong><p>使用藏宝设置后，主播和围观者会看到设置提示与记录，具体礼物在开箱前保密。已开出的礼物不能恢复，发出报价期间不能改，结算结果不能重写。</p></div></section><section data-admin-page="round" hidden><div class="admin-section-title"><span>02 / NEXT DREAM</span><h3>下一局，提前安排。</h3></div><p class="admin-help">保存后仅在下一次重开生效，使用一次后恢复随机。新局同样会显示导演设置提示。</p><label for="adminNext">下一局保留箱礼物</label><select id="adminNext"><option value="">随机分配</option>${DreamEngine.GIFTS.map((g,i)=>`<option value="${i}">${g.icon} ${g.name}</option>`).join('')}</select><button id="adminSaveNext" class="admin-primary" type="button">保存下一局预设</button><p id="adminNextStatus" class="admin-next-status"></p><div class="admin-restart"><h4>重新开局</h4><p>重新洗牌、清空当前进度，房间码与在线成员保留。</p><button id="adminRestart" class="admin-secondary" type="button">↻ 结束本局，重新开始</button></div></section><section data-admin-page="records" hidden><div class="admin-section-title"><span>03 / THE LEDGER</span><h3>每次设置，都有记录。</h3></div><p class="admin-help">礼物详情仅房主本机可见；玩家只看到发生了哪类设置。管理记录保存在本浏览器。</p><h4>本局藏宝记录</h4><ol id="adminCurrentLog" class="admin-ledger"></ol><h4>本设备最近操作</h4><ol id="adminAudit" class="admin-ledger"></ol></section></div><div id="adminConfirmation" class="admin-confirmation" hidden><strong>确认这次管理操作</strong><p id="adminConfirmationText"></p><div><button id="adminConfirm" class="admin-primary" type="button">确认执行</button><button id="adminCancel" class="admin-secondary" type="button">取消</button></div></div><p id="adminMessage" class="admin-message" role="status" aria-live="polite"></p></div></section><footer class="admin-bottom"><span>本机界面锁 · 管理权由房主身份校验</span><button id="adminLogout" type="button" hidden>退出登录 ↗</button></footer></dialog>`);
   $('adminEntry').onclick=open;$('adminLogin').onsubmit=login;$('adminClose').onclick=()=>$('adminDialog').close();$('adminLogout').onclick=()=>lock();
   $('adminDialog').onclose=closed;
   $('adminGift').onchange=()=>{cancel();preview();};$('adminApply').onclick=()=>stage('treasure');$('adminClear').onclick=()=>stage('clear');$('adminRestart').onclick=()=>stage('restart');$('adminConfirm').onclick=execute;$('adminCancel').onclick=cancel;
   $('adminPeek').onclick=()=>{if(!authorized())return;peek=!peek;render(api.getGame());};
   $('adminNext').value=nextGift()===null?'':String(nextGift());
   $('adminSaveNext').onclick=()=>{try{requireControl();const raw=$('adminNext').value,gift=raw===''?null:Number(raw);if(gift!==null&&(!Number.isInteger(gift)||gift<0||gift>8))throw Error('请选择有效礼物');if(!store('daydream.admin.next',gift))throw Error('浏览器未能保存，请允许本地存储后再试');audit(gift===null?'random':'next',gift);message('已保存，下次重开时生效一次。');render(api.getGame());}catch(e){message(e.message,true);}};
   for(const b of document.querySelectorAll('[data-admin-tab]'))b.onclick=()=>{cancel();tab(b.dataset.adminTab);};
   setInterval(()=>{if(until&&!session())lock('登录已超过15分钟，请重新输入密码。');},1000);
  },render
 };
})();
