/* Room-owner console. The password is a local screen lock, never room authority. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),SESSION_MS=30*60*1000,SESSION_KEY='daydream.admin.session.v2';
 const HASH='c48785dc07c8369e512911d4cefbdea2272320a23655efd25e63c925b099d0ea';
 const images=['carnival.png','airship.svg','douyin.png','cruise.png','car.svg','balloon.png','rabbit.svg','kiss.png','heart.png'];
 const phases={select:'等待选箱',open:'正在开箱',pricing:'等待你报价',offer:'报价已发出',final:'最后两箱',ended:'本局已结束'};
 let api,current,until=0,expiresAt=0,unlocking=false,failures=0,blockedUntil=0,confirming=null,peek=false,lastRole='',lastGame='',activeTab='treasure',authEpoch=0,giftPoolKey='',targetPoolKey='',roomBrowser=null,roomRows=[],roomBrowserEpoch=0,roomRowsKey=null;
 const clock=()=>performance.now(),role=()=>window.DreamRoom?.role||'solo';
 const owner=()=>['host','solo'].includes(role());
 const session=()=>until>clock()&&expiresAt>Date.now();
 const authorized=()=>session()&&owner();
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const mode=g=>g?.mode||'gift';
 const pool=g=>g?.gifts||g?.pool||DreamEngine.GIFTS;
 const numeric=g=>mode(g)!=='gift';
 const signature=g=>JSON.stringify([mode(g),g?.config?.min??null,g?.config?.max??null,pool(g).map(x=>x.value??x.score)]);
 const itemName=(g,i)=>pool(g)[i]?.name||'未知项目';
 const itemLabel=(g,i)=>itemName(g,i)+(numeric(g)?' · 第 '+(i+1)+' 项':'');
 const presetKey=g=>mode(g)==='gift'?'daydream.admin.next':'daydream.admin.next.'+mode(g);
 let nextPoolKey='';
 const key=g=>[g.gameId,g.phase,g.round,g.selected,(g.opened||[]).join(','),g.directorLog?.length||0,signature(g)].join(':');
 const availableGifts=g=>pool(g).map((_,i)=>i).filter(i=>!g.opened.some(b=>g.boxes[b]===i));
 const availableBoxes=g=>g.boxes.map((_,i)=>i).filter(i=>!g.opened.includes(i));
 function selectedGift(){const raw=$('adminGift').value,n=Number(raw);return raw!==''&&Number.isInteger(n)&&n>=0&&n<9?n:null;}
 function selectedTarget(g){if(g.selected===null)return null;const raw=$('adminTarget').value,n=Number(raw);return raw!==''&&Number.isInteger(n)&&availableBoxes(g).includes(n)?n:null;}
 function randomGift(g){const pool=availableGifts(g);if(!pool.length)return null;const bytes=new Uint8Array(1),limit=256-256%pool.length;do{crypto.getRandomValues(bytes);}while(bytes[0]>=limit);return pool[bytes[0]%pool.length];}
 function refreshChoices(g){
  const gifts=availableGifts(g),poolSig=signature(g),giftKey=poolSig+':'+gifts.join(','),previous=giftPoolKey.startsWith(poolSig+':')?$('adminGift').value:'';
  if(giftKey!==giftPoolKey){$('adminGift').innerHTML='<option value="">请选择项目，或点随机</option>'+gifts.map(i=>`<option value="${i}">${escape(itemLabel(g,i))}</option>`).join('');giftPoolKey=giftKey;}
  $('adminGift').value=previous!==''&&gifts.includes(Number(previous))?previous:'';
  const boxes=availableBoxes(g),targetKey=g.selected+':'+boxes.join(','),target=$('adminTarget').value;
  if(targetKey!==targetPoolKey){$('adminTarget').innerHTML=g.selected===null?'<option value="">主播即将选中的保留箱</option>':boxes.map(i=>`<option value="${i}">${i+1} 号箱 · ${i===g.selected?'主播保留箱':boxes.length===2?'另一只未开箱':'未开箱'}</option>`).join('');$('adminTarget').value=g.selected===null?'':target!==''&&boxes.includes(Number(target))?target:String(g.selected);targetPoolKey=targetKey;}
  $('adminRandom').disabled=!authorized()||api.isBusy()||!gifts.length;
 }
 function message(text,error=false){$('adminMessage').textContent=text;$('adminMessage').classList.toggle('is-error',error);}
 function read(name,fallback){try{return JSON.parse(localStorage.getItem(name))??fallback;}catch{return fallback;}}
 function store(name,value){try{localStorage.setItem(name,JSON.stringify(value));return true;}catch{return false;}}
 function restoreSession(){
  const saved=read(SESSION_KEY,null),now=Date.now();
  if(!saved||saved.version!==2||!Number.isFinite(saved.issued)||!Number.isFinite(saved.expires)||saved.issued>now+5000||saved.expires<=now||saved.expires-saved.issued!==SESSION_MS)return;
  if(until>0&&expiresAt===saved.expires)return;
  expiresAt=saved.expires;until=clock()+Math.min(SESSION_MS,saved.expires-now);
 }
 function clearPrivate(){
  authEpoch++;confirming=null;peek=false;giftPoolKey='';targetPoolKey='';$('adminGift').value='';$('adminTarget').value='';$('adminPassword').value='';$('adminConfirmation').hidden=true;$('adminSecret').textContent='';$('adminSecret').hidden=true;
 }
 function stopRoomBrowser(){roomBrowserEpoch++;roomBrowser?.close();roomBrowser=null;roomRows=[];roomRowsKey=null;if($('adminRoomList'))$('adminRoomList').replaceChildren?.();if($('adminRoomCount'))$('adminRoomCount').textContent='0';}
 function browseRooms(){
  if(!session()||!$('adminDialog').open)return;
  stopRoomBrowser();
  if(!window.RoomLobby){$('adminRoomStatus').textContent='房间目录尚未加载，请刷新网页。';return;}
  $('adminRoomStatus').textContent='正在连接在线房间目录…';
  const epoch=roomBrowserEpoch,active=()=>epoch===roomBrowserEpoch&&session()&&$('adminDialog').open;
  roomBrowser=window.RoomLobby.subscribe(rows=>{if(!active())return;roomRows=rows;renderRooms();},{baseUrl:location.href,onStatus:status=>{if(!active())return;$('adminRoomStatus').textContent=status.connected?'在线目录已连接 · 房主离线后自动移除':'目录连接中，正在重试…';}});
 }
 function renderRooms(){
  const list=$('adminRoomList');if(!list||!session())return;
  const nextKey=JSON.stringify(roomRows.map(({code,alias,hostName,count,mode,phase,watchUrl})=>({code,alias,hostName,count,mode,phase,watchUrl})));if(nextKey===roomRowsKey)return;roomRowsKey=nextKey;
  list.replaceChildren();$('adminRoomCount').textContent=String(roomRows.length);
  if(!roomRows.length){const empty=document.createElement('p');empty.className='admin-room-empty';empty.textContent='暂未发现在线房间。房主打开新版并保持在线后，会自动出现在这里。';list.append(empty);return;}
  const editions={gift:'主播版',money:'普通版',drink:'喝酒版'};
  for(const row of roomRows){const card=document.createElement('article');card.className='admin-room-card';const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),watch=document.createElement('a');title.textContent=(row.alias?'房间 '+row.alias:'房间码生成中')+' · '+row.hostName;detail.textContent=(editions[row.mode]||'主播版')+' · '+(phases[row.phase]||'进行中')+' · '+row.count+' 人在线';info.append(title,detail);watch.textContent='进入观战';watch.className='admin-room-watch';watch.href=row.watchUrl;watch.target='_blank';watch.rel='noopener noreferrer';card.append(info,watch);list.append(card);}
 }
 function nextGift(g=current){const n=read(presetKey(g),null);if(mode(g)==='gift')return Number.isInteger(n)&&n>=0&&n<9?n:null;return n&&n.signature===signature(g)&&Number.isInteger(n.index)&&n.index>=0&&n.index<pool(g).length?n.index:null;}
 function refreshNext(g){const sig=signature(g);if(nextPoolKey!==sig){$('adminNext').innerHTML='<option value="">随机分配</option>'+pool(g).map((_,i)=>`<option value="${i}">${escape(itemLabel(g,i))}</option>`).join('');const n=nextGift(g);$('adminNext').value=n===null?'':String(n);nextPoolKey=sig;}}
 function audit(action,gift=null,box=null){
  const rows=read('daydream.admin.audit',[]),safe=Array.isArray(rows)?rows:[];
  safe.unshift({at:Date.now(),action,gift:gift===null?null:itemLabel(current,gift),box,mode:mode(current),gameId:current?.gameId||null});
  store('daydream.admin.audit',safe.slice(0,100));
 }
 function lock(text='已退出管理后台。'){
  until=0;expiresAt=0;store(SESSION_KEY,null);clearPrivate();stopRoomBrowser();
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
   const now=Date.now();expiresAt=now+SESSION_MS;until=clock()+SESSION_MS;store(SESSION_KEY,{version:2,issued:now,expires:expiresAt});failures=0;$('adminLoginError').textContent='';message(owner()?'已解锁，30分钟内无需再次输入密码。':'已解锁在线房间目录。当前房间管理仍需原房主身份。');
   render(api.getGame());browseRooms();
  }catch{$('adminLoginError').textContent='当前浏览器无法验证密码，请使用新版微信或浏览器的 HTTPS 页面。';}
  finally{unlocking=false;$('adminLoginButton').disabled=false;}
 }
 function open(){
  window.QuotePopup?.pause();clearPrivate();restoreSession();render(api.getGame());
  if(!$('adminDialog').open)$('adminDialog').showModal();if(!session())$('adminPassword').focus();else browseRooms();
 }
 function closed(){
  clearPrivate();stopRoomBrowser();
  api.getGame()&&window.QuotePopup?.render(api.getGame(),$('bearLine').textContent);
 }
 function cancel(){confirming=null;$('adminConfirmation').hidden=true;}
 function requireControl(){
  if(!authorized())throw Error('请在创建房间的原设备登录管理后台');
  if(api.isBusy())throw Error('正在开箱，请等动画结束再操作');
 }
 function randomize(){
  try{requireControl();const g=api.getGame(),gift=randomGift(g);if(gift===null)throw Error('没有可选择的未开项目');cancel();$('adminGift').value=String(gift);preview();message('随机选中「'+itemLabel(g,gift)+'」，确认设置后才会生效。');}catch(e){message(e.message,true);}
 }
 function stage(action){
  try{
   requireControl();const g=api.getGame(),gift=selectedGift(),target=selectedTarget(g);
   if(action==='treasure'){
    if(!['select','open','pricing','final'].includes(g.phase))throw Error('请等主播继续追梦后再调整，已发出的报价和已结算结果均已锁定');
    if(gift===null||!availableGifts(g).includes(gift))throw Error('请先选择尚未开出的项目，或点击随机');
    if(g.selected!==null&&target===null)throw Error('请选择尚未打开的箱子');
   }
   if(action==='clear'&&(g.selected!==null||g.directorPreset===null))throw Error('当前没有可撤回的选箱前预设');
   confirming={action,gift,target,expected:key(g)};
   $('adminConfirmationText').textContent=action==='restart'?'重新洗牌并结束当前进度？同一配置的下一局预设会在本次重开时生效，房间内所有人会同步重置。':action==='clear'?'撤回保留箱预设？本局将按当前随机分配继续，操作记录仍会保留。':g.selected===null?`把主播即将选择的保留箱预设为「${itemLabel(g,gift)}」？具体设置仅你可见。`:`把 ${target+1} 号箱调整为「${itemLabel(g,gift)}」？将与另一只未开箱交换内容；设置绑定箱号，换箱后会拿到新箱子的内容。`;
   if(numeric(g))$('adminConfirmationText').textContent=$('adminConfirmationText').textContent.replaceAll('交换内容','交换数值').replaceAll('新箱子的内容','新箱子的数值');
   $('adminConfirmation').hidden=false;message('请核对下面的操作，再确认执行。');$('adminConfirm').focus();
  }catch(e){message(e.message,true);}
 }
 function execute(){
  const task=confirming;if(!task)return;
  try{
   requireControl();if(key(api.getGame())!==task.expected)throw Error('对局进度已变化，请重新选择操作');
   cancel();
   if(task.action==='treasure')api.change(task.gift,task.target);else if(task.action==='clear')api.clear();else api.restart();
   audit(task.action,task.action==='treasure'?task.gift:null,task.target);message(task.action==='restart'?'已重新开局。':'已生效，具体配置仅本机可见。');render(api.getGame());
  }catch(e){cancel();message(e.message,true);render(api.getGame());}
 }
 function preview(){const i=selectedGift(),valid=i!==null&&current&&availableGifts(current).includes(i),isNumeric=numeric(current);$('adminGiftImage').hidden=!valid||isNumeric;if(valid){const gift=pool(current)[i];if(!isNumeric)$('adminGiftImage').src='assets/'+images[i];$('adminGiftName').textContent=itemLabel(current,i);$('adminGiftPrice').textContent=isNumeric?(mode(current)==='drink'?'小口数仅作标记，可跳过或用水替代':'金额仅作娱乐模拟'):gift.score.toLocaleString('zh-CN')+' 抖币';}else{$('adminGiftName').textContent=isNumeric?'尚未选择数值':'尚未选择礼物';$('adminGiftPrice').textContent='手动选择，或点击随机';}$('adminApply').disabled=!valid||!authorized()||api.isBusy()||!['select','open','pricing','final'].includes(current?.phase)||(current.selected!==null&&selectedTarget(current)===null);}
 function tab(name){activeTab=name;for(const b of document.querySelectorAll('[data-admin-tab]'))b.setAttribute('aria-selected',b.dataset.adminTab===name);for(const p of document.querySelectorAll('[data-admin-page]'))p.hidden=p.dataset.adminPage!==name;}
 function render(g){
  if(!api)return;current=g;
  if(lastRole&&lastRole!==role()){peek=false;cancel();}lastRole=role();
  if(g.gameId!==lastGame){peek=false;cancel();giftPoolKey='';targetPoolKey='';$('adminGift').value='';$('adminTarget').value='';lastGame=g.gameId;}
  const valid=session();$('adminLogin').hidden=valid;$('adminConsole').hidden=!valid;$('adminLogout').hidden=!valid;$('adminDialog').classList.toggle('is-locked',!valid);
  if(!valid){$('adminScope').textContent='管理员登录';return;}
  $('adminScope').textContent=(role()==='host'?'房主专属 · 本设备':role()==='solo'?'单人模式 · 本设备':'在线目录 · 只读观战')+' · 免密剩余 '+Math.max(1,Math.ceil(Math.min(until-clock(),expiresAt-Date.now())/60000))+' 分钟';
  $('adminNoAuthority').hidden=owner();$('adminControls').hidden=!owner();if(!owner())return;
  if(confirming&&key(g)!==confirming.expected){cancel();message('对局已更新，未执行的操作已取消，请重新确认。',true);}
  $('adminPhase').textContent=phases[g.phase]||'同步中';$('adminRound').textContent=g.opened.length+' / 7';$('adminReserve').textContent=g.selected===null?'等待选箱':String(g.selected+1).padStart(2,'0')+' 号箱';
  refreshNext(g);const n=nextGift(g);$('adminNextStatus').textContent=n===null?'下一局：随机分配':'下一局：保留箱预设为 '+itemLabel(g,n);
  const allowed=['select','open','pricing','final'].includes(g.phase)&&!api.isBusy();
  $('adminApply').disabled=!allowed;$('adminClear').disabled=g.phase!=='select'||g.directorPreset===null||api.isBusy();$('adminRestart').disabled=api.isBusy();
  $('adminTreasureHint').textContent=g.phase==='offer'?'报价已发出，藏宝暂时锁定。等主播选择继续后可调整。':g.phase==='ended'?'结果已结算，不能改写。可设置下一局或重新开局。':g.selected===null?'选箱前设置：主播选中的那只保留箱将放入指定礼物。':availableBoxes(g).length===2?'最后两只箱都能设置。先选箱号，再选礼物；设置绑定箱号，主播换箱后拿新箱子的礼物。':'先选择要设置的未开箱，再选择礼物。已开礼物已排除，已开箱保持原样。';
  refreshChoices(g);
  for(const label of document.querySelectorAll('label[for=adminGift],label[for=adminNext]'))label.textContent=numeric(g)?(label.htmlFor==='adminNext'?'下一局保留箱数值':'这只箱子的数值'):(label.htmlFor==='adminNext'?'下一局保留箱礼物':'这只箱子的礼物');
  const choiceHint=document.querySelector('.admin-choice-hint');if(choiceHint)choiceHint.textContent=numeric(g)?'仅从尚未开出的现有数值抽选；重复值按第几项区分，确认后才交换。':'仅从未开出的礼物抽选；确认设置后才生效。';
  const disclosure=document.querySelector('.admin-disclosure p');if(disclosure)disclosure.textContent=numeric(g)?'换箱后领取新箱内数值；只交换未开项目，已发报价与结算结果不能修改。具体设置与操作记录仅本机可见。'+(mode(g)==='drink'?'仅限成年人自愿，可跳过或用水替代。':'金额仅作娱乐模拟。'):'主播换箱后领取新箱内的礼物；已开出的礼物不能恢复，发出报价期间不能改，结算结果不能重写。具体设置和操作记录仅本机可见。';
  if(numeric(g))$('adminTreasureHint').textContent=$('adminTreasureHint').textContent.replaceAll('指定礼物','所选数值').replaceAll('再选礼物','再选数值').replaceAll('选择礼物','选择数值').replaceAll('已开礼物','已开数值').replaceAll('箱子的礼物','箱子的数值').replaceAll('新箱子的礼物','新箱子的数值')+' 只交换尚未开出的现有数值，不改变数值大小。'+(mode(g)==='drink'?'成年人自愿，可跳过或用水替代。':'金额仅供娱乐模拟。');
  preview();
  $('adminPeek').textContent=peek?'收起藏宝信息':'查看所选箱藏宝';
  $('adminSecret').hidden=!peek;
  if(peek){const target=selectedTarget(g);$('adminSecret').textContent=g.selected!==null&&target!==null?`${target+1} 号箱当前藏着：`+itemLabel(g,g.boxes[target]):g.directorPreset!==null?'已设预选项目：'+itemLabel(g,g.directorPreset):'未设预选，九箱随机分配。';}
  const logs=g.directorLog||[];$('adminCurrentLog').innerHTML=logs.length?logs.slice().reverse().map(e=>`<li><time>${escape(new Date(e.at).toLocaleTimeString('zh-CN'))}</time><strong>${e.action==='clear'?'撤回预设':e.action==='preset'?'保留箱预设':`调整 ${e.box+1} 号箱`}</strong><span>${e.giftIndex===undefined?'恢复随机分配':escape(itemLabel(g,e.giftIndex))}</span></li>`).join(''):'<li>本局尚未使用藏宝设置。</li>';
  const rows=read('daydream.admin.audit',[]);$('adminAudit').innerHTML=Array.isArray(rows)&&rows.length?rows.slice(0,15).map(e=>`<li><time>${escape(new Date(e.at).toLocaleString('zh-CN'))}</time><span>${escape(({treasure:'设置本局藏宝',clear:'撤回本局预设',restart:'重新开局',next:'保存下一局预设',random:'取消下一局预设'})[e.action]||'管理操作')}${Number.isInteger(e.box)?' · '+(e.box+1)+'号箱':''}${e.gift?' · '+escape(e.gift):''}</span></li>`).join(''):'<li>本设备暂时没有管理记录。</li>';
  tab(activeTab);
 }
 window.AdminDesk={
  authorized,
  prepare(g){
   if(!owner())return;const gift=nextGift(g);if(gift===null)return;
   // Consume a one-round preset only when it can actually be removed from storage.
   if(!store(presetKey(g),null))return;g.setTreasure(gift);
  },
  init(options){api=options;
   // Public rules are constant for every round; private administrator actions stay local.
   document.body.insertAdjacentHTML('beforeend',`<dialog id="adminDialog" class="admin-dialog is-locked" aria-labelledby="adminTitle"><header class="admin-header"><div class="admin-wordmark"><img src="assets/bear-negotiator.png" alt="熊二"><div><span class="eyebrow">BEAR'S PRIVATE OFFICE</span><h2 id="adminTitle">熊二 · 管理事务所</h2><p id="adminScope">管理员登录</p></div></div><button id="adminClose" class="admin-icon" type="button" aria-label="关闭管理后台">×</button></header><form id="adminLogin" class="admin-login"><span class="admin-lock-icon" aria-hidden="true">✦</span><h3>管理员，请入座。</h3><p>输入密码，打开你的管理控制台。</p><label for="adminPassword">管理密码</label><input id="adminPassword" type="password" autocomplete="current-password" required maxlength="128" placeholder="请输入管理密码"><p id="adminLoginError" class="admin-error" role="alert"></p><button id="adminLoginButton" class="admin-primary" type="submit">解锁后台 →</button><small>密码只解锁本机界面；多人管理仍需原房主设备。<br>登录后30分钟内免密，关闭或刷新不延长有效期；退出登录会立即锁定。</small></form><section id="adminConsole" hidden><details id="adminOnlineRooms" class="admin-online-rooms" open><summary><span>在线房间</span><strong id="adminRoomCount">0</strong><small>点击展开 / 收起</small></summary><div class="admin-room-toolbar"><p id="adminRoomStatus" role="status">登录后连接在线房间目录</p><button id="adminRefreshRooms" class="admin-secondary" type="button">刷新目录</button></div><div id="adminRoomList" class="admin-room-list"></div><p class="admin-room-note">点击观战会新开只读页面，当前房间继续保持在线。</p></details><div id="adminNoAuthority" class="admin-empty" hidden><h3>请回到房主页面管理</h3><p>当前设备是主播或围观者。输入密码不会获得他人房间的管理权，请使用创建这个房间的原浏览器。</p></div><div id="adminControls"><div class="admin-overview"><article><span>当前进度</span><strong id="adminPhase"></strong></article><article><span>已开箱</span><strong id="adminRound"></strong></article><article><span>保留箱</span><strong id="adminReserve"></strong></article></div><div class="admin-tabs" role="tablist" aria-label="管理功能"><button type="button" role="tab" data-admin-tab="treasure" aria-selected="true">藏宝设置</button><button type="button" role="tab" data-admin-tab="round" aria-selected="false">新局管理</button><button type="button" role="tab" data-admin-tab="records" aria-selected="false">操作记录</button></div><div class="admin-body"><section data-admin-page="treasure"><div class="admin-section-title"><span>01 / TREASURE CONTROL</span><h3>给这局梦想，设个答案。</h3></div><p id="adminTreasureHint" class="admin-help"></p><div class="admin-treasure-grid"><div class="admin-gift-preview"><img id="adminGiftImage" alt="礼物预览"><strong id="adminGiftName"></strong><span id="adminGiftPrice"></span></div><div class="admin-gift-form"><label for="adminTarget">要设置哪只箱子</label><select id="adminTarget"><option value="">主播即将选中的保留箱</option></select><label for="adminGift">这只箱子的礼物</label><div class="admin-choice-row"><select id="adminGift"><option value="">请选择礼物，或点随机</option></select><button id="adminRandom" class="admin-secondary" type="button">⤨ 随机</button></div><small class="admin-choice-hint">仅从未开出的礼物抽选；确认设置后才生效。</small><button id="adminApply" class="admin-primary" type="button">设置本局藏宝 →</button><button id="adminClear" class="admin-secondary" type="button">撤回选箱前预设</button></div></div><div class="admin-private"><span>🔒 以下内容仅本设备显示</span><button id="adminPeek" type="button">查看当前藏宝</button><p id="adminSecret" hidden></p></div><div class="admin-disclosure"><strong>设置绑定箱号。</strong><p>主播换箱后领取新箱内的礼物；已开出的礼物不能恢复，发出报价期间不能改，结算结果不能重写。玩家只看到统一游戏规则，具体设置和操作记录仅本机可见。</p></div></section><section data-admin-page="round" hidden><div class="admin-section-title"><span>02 / NEXT DREAM</span><h3>下一局，提前安排。</h3></div><p class="admin-help">保存后仅在下一次重开生效，使用一次后恢复随机。预设绑定主播选中的保留箱。</p><label for="adminNext">下一局保留箱礼物</label><select id="adminNext"><option value="">随机分配</option>${DreamEngine.GIFTS.map((g,i)=>`<option value="${i}">${g.icon} ${g.name}</option>`).join('')}</select><button id="adminSaveNext" class="admin-primary" type="button">保存下一局预设</button><p id="adminNextStatus" class="admin-next-status"></p><div class="admin-restart"><h4>重新开局</h4><p>重新洗牌、清空当前进度，房间码与在线成员保留。</p><button id="adminRestart" class="admin-secondary" type="button">↻ 结束本局，重新开始</button></div></section><section data-admin-page="records" hidden><div class="admin-section-title"><span>03 / THE LEDGER</span><h3>每次设置，都有记录。</h3></div><p class="admin-help">礼物详情和管理操作记录仅房主本机可见，保存在本浏览器。</p><h4>本局藏宝记录</h4><ol id="adminCurrentLog" class="admin-ledger"></ol><h4>本设备最近操作</h4><ol id="adminAudit" class="admin-ledger"></ol></section></div><div id="adminConfirmation" class="admin-confirmation" hidden><strong>确认这次管理操作</strong><p id="adminConfirmationText"></p><div><button id="adminConfirm" class="admin-primary" type="button">确认执行</button><button id="adminCancel" class="admin-secondary" type="button">取消</button></div></div><p id="adminMessage" class="admin-message" role="status" aria-live="polite"></p></div></section><footer class="admin-bottom"><span>本机界面锁 · 管理权由房主身份校验</span><button id="adminLogout" type="button" hidden>退出登录 ↗</button></footer></dialog>`);
   $('adminEntry').onclick=open;$('adminLogin').onsubmit=login;$('adminClose').onclick=()=>$('adminDialog').close();$('adminLogout').onclick=()=>lock();
   $('adminDialog').onclose=closed;$('adminRefreshRooms').onclick=browseRooms;restoreSession();
   $('adminGift').onchange=()=>{cancel();preview();};
   $('adminTarget').onchange=()=>{cancel();peek=false;render(api.getGame());};
   $('adminRandom').onclick=randomize;$('adminApply').onclick=()=>stage('treasure');$('adminClear').onclick=()=>stage('clear');$('adminRestart').onclick=()=>stage('restart');$('adminConfirm').onclick=execute;$('adminCancel').onclick=cancel;
   $('adminPeek').onclick=()=>{if(!authorized())return;peek=!peek;render(api.getGame());};
   $('adminNext').value='';
   $('adminSaveNext').onclick=()=>{try{requireControl();const g=api.getGame(),raw=$('adminNext').value,gift=raw===''?null:Number(raw);if(gift!==null&&(!Number.isInteger(gift)||gift<0||gift>=pool(g).length))throw Error('请选择有效项目');if(!store(presetKey(g),gift===null?null:mode(g)==='gift'?gift:{index:gift,signature:signature(g)}))throw Error('浏览器未能保存，请允许本地存储后再试');audit(gift===null?'random':'next',gift);message('已保存，仅同一配置的下一次重开生效一次。');render(g);}catch(e){message(e.message,true);}};
   for(const b of document.querySelectorAll('[data-admin-tab]'))b.onclick=()=>{cancel();tab(b.dataset.adminTab);};
   setInterval(()=>{if(until&&!session())lock('登录已超过30分钟，请重新输入密码。');},1000);
   window.addEventListener?.('storage',event=>{if(event.key!==SESSION_KEY)return;if(!event.newValue||event.newValue==='null'){until=0;expiresAt=0;clearPrivate();stopRoomBrowser();render(api.getGame());}else{restoreSession();if($('adminDialog').open){render(api.getGame());browseRooms();}}});
  },render
 };
})();
