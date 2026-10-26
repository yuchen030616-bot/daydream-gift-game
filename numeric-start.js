(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let api,current,dialog,body,marker,setup,originalApply='',dismissed='',loaded='',sending=false,sendingGame='',sendingAuthority='',draftCache=null,lastError='',applyMarker=null;
 const role=()=>window.DreamRoom?.role||'solo';
 const numeric=g=>g&&(g.mode==='money'||g.mode==='drink');
 const pending=g=>g?.poolProposal?.status==='pending'&&g.poolProposal.gameId===g.gameId;
 const key=g=>g?.gameId+':'+(g?.poolProposal?.id||'draft');
 const available=g=>numeric(g)&&window.DreamRoom?.seriesConfigured!==true&&g.started===false&&g.phase==='select'&&g.selected===null&&!api.isBusy()&&g.reshuffleRequest?.status!=='pending';
 const authority=g=>key(g)+':'+(g?.poolProposal?.status||'none')+':'+g?.started;
 const connected=()=>{if(role()==='solo')return true;if(api.isConnected)return !!api.isConnected();const room=window.DreamRoom;if(typeof room?.connected==='boolean')return room.connected;if(typeof room?.isConnected==='function')return !!room.isConnected();const status=$('roomStatus')?.textContent||'';return !/网络连接中|正在连接|连接失败|等待房主上线/.test(status);};
 const live=()=>connected()&&(role()==='solo'||role()==='host'||!!window.DreamRoom?.canPlay());
 function saveDraft(){if(!marker||!setup||!loaded)return;draftCache={key:loaded,min:$('modeMin').value,max:$('modeMax').value,values:Array.from(setup.querySelectorAll('[data-pool-value]'),input=>input.value)};}
 function beginSending(g){saveDraft();sending=true;sendingGame=g.gameId;sendingAuthority=authority(g);lastError='';}
 function failed(text){sending=false;lastError=text||'提交未获确认，草稿已保留，连接恢复后请重试。';if(dialog?.open){controls();message(lastError,true);}}
 function message(text,error=false){$('numericStartStatus').textContent=text;$('numericStartStatus').classList.toggle('is-error',error);}
 function restore(){saveDraft();if(applyMarker){applyMarker.replaceWith($('applyValues'));applyMarker=null;}if(marker&&setup){marker.replaceWith(setup);marker=null;if($('applyValues'))$('applyValues').textContent=originalApply;}loaded='';}
 function controls(){
  const g=api.getGame(),host=role()==='host',waiting=!host&&(pending(g)||sending),enabled=available(g)&&live()&&!sending&&!waiting&&(host?pending(g):['player','solo'].includes(role()));
  $('applyValues').textContent=host?'确认并开始':role()==='solo'?'确认并开始':'提交给房主确认';$('applyValues').disabled=!enabled;
  $('generateValues').textContent='自动生成九个数';$('generateValues').disabled=!enabled;
  for(const input of setup.querySelectorAll('input'))input.disabled=!enabled;
  $('rejectNumericStart').hidden=!host||!pending(g);$('rejectNumericStart').disabled=!available(g)||!connected()||sending;
  $('numericStartTitle').textContent=host?'确认本局九个数值':g.mode==='money'?'先选本局金额':'先选自愿小口数';
  $('numericStartHint').textContent=g.mode==='drink'?'小口数0至5，0代表不喝。自愿参与，可随时跳过。':'金额保留到分。可按范围和参考均价生成九个不同的数，也可逐项修改。';
  if(!connected())message('连接已中断，草稿已保留。恢复连接后可重试；已发送的方案以房主同步结果为准。',true);
  else if(lastError)message(lastError,true);
  else if(waiting)message(sending?'正在发送方案，等待同步确认，请勿重复提交。':'方案已提交，等待房主调整并确认。');
  else if(host)message('可以修改范围和九个数值。确认后将直接洗牌，玩家无需再次点击开始。');
  else if(g.poolProposal?.status==='declined')message('房主请你重新调整。修改后可以再次提交。');
  else message(role()==='solo'?'选好九项数值，确认后直接洗牌开始。':'选好九项数值后提交，等待房主最终确认。');
 }
 function open(){
  if(!api)return false;current=api.getGame();const host=role()==='host';
  if(!available(current)||!(host?pending(current):['player','solo'].includes(role())))return false;
  if(dialog.open){controls();return true;}
  if(document.querySelector('dialog[open]'))return false;
  setup=$('modeSetup');if(!setup)return false;
  marker=document.createElement('span');marker.hidden=true;setup.before(marker);body.append(setup);originalApply=$('applyValues').textContent;setup.hidden=false;applyMarker=document.createElement('span');applyMarker.hidden=true;$('applyValues').before(applyMarker);$('rejectNumericStart').parentNode.before($('applyValues'));
  const config=current.poolProposal?.gameId===current.gameId?current.poolProposal.config:{mode:current.mode,min:current.config.min,max:current.config.max,values:(current.gifts||current.pool).map(g=>g.value)};
  try{window.GameModes.setDraft(config);loaded=key(current);if(draftCache?.key===loaded){$('modeMin').value=draftCache.min;$('modeMax').value=draftCache.max;Array.from(setup.querySelectorAll('[data-pool-value]')).forEach((input,i)=>{if(draftCache.values[i]!==undefined)input.value=draftCache.values[i];});}dialog.showModal();controls();return true;}catch(error){restore();message(error.message||'暂时无法打开数值设置。',true);return false;}
 }
 function close(){dismissed=key(api.getGame());dialog.close();restore();}
 function render(g){
  if(!api)return;current=g;
  if(sending&&(g.gameId!==sendingGame||authority(g)!==sendingAuthority)){sending=false;lastError='';}
  const entry=$('openNumericStart');if(entry){const eligible=available(g)&&(role()==='host'?pending(g):['player','solo'].includes(role()));entry.hidden=!eligible;entry.disabled=api.isBusy();entry.textContent=role()==='host'?'待确认 · 审核玩家九个数值':pending(g)||sending?'查看已提交数值 · 等待房主':'设置九个数值 · 提交开始';}
  if(dialog.open){
   if(!available(g)||!['host','player','solo'].includes(role())||role()==='host'&&!pending(g)){dialog.close();restore();return;}
   if(loaded!==key(g)&&g.poolProposal?.config){saveDraft();window.GameModes.setDraft(g.poolProposal.config);loaded=key(g);}
   controls();return;
  }
  if(role()==='host'&&pending(g)&&dismissed!==key(g)&&!(window.MobilePages?.enabled()&&window.MobilePages.page==='room'))open();
 }
 function intercept(configuration){
  if(!dialog?.open||!marker)return false;
  const g=api.getGame(),host=role()==='host';
  if(!available(g)||!live()||sending||(!host&&pending(g))||!(host?pending(g):['player','solo'].includes(role()))){message('当前不能提交，请等待同步或房主回复。',true);return true;}
  try{
   const config=DreamEngine.makePool(configuration).config;if(config.mode!==g.mode)throw Error('不能通过数值设置切换版本');
   beginSending(g);controls();message(host?'正在确认并准备洗牌…':'正在发送方案…');
   const result=host?api.approve(g.poolProposal.id,config):api.submit(config);
   Promise.resolve(result).catch(error=>failed(error?.message||'提交失败，请稍后重试。'));
  }catch(error){failed(error.message||'数值无效，请检查九项设置。');}
  return true;
 }
 window.NumericStart={init(options){
  api=options;dialog=document.createElement('dialog');dialog.id='numericStartDialog';dialog.className='numeric-start-dialog';dialog.setAttribute('aria-labelledby','numericStartTitle');
  const title=document.createElement('h2');title.id='numericStartTitle';const hint=document.createElement('p');hint.id='numericStartHint';
  const status=document.createElement('p');status.id='numericStartStatus';status.setAttribute('role','status');body=document.createElement('div');body.id='numericStartBody';
  const actions=document.createElement('div');actions.className='numeric-start-actions';const reject=document.createElement('button');reject.id='rejectNumericStart';reject.type='button';reject.textContent='退回重改';reject.onclick=()=>{
   const g=api.getGame();if(role()!=='host'||!available(g)||!pending(g)||!connected()||sending)return;
   beginSending(g);controls();try{Promise.resolve(api.reject(g.poolProposal.id)).catch(error=>failed(error?.message||'退回失败，请稍后重试。'));}catch(error){failed(error.message);}
  };
  const dismiss=document.createElement('button');dismiss.id='closeNumericStart';dismiss.type='button';dismiss.textContent='稍后';dismiss.onclick=close;actions.append(reject,dismiss);const footer=document.createElement('div');footer.id='numericStartActionsFooter';footer.append(actions);dialog.append(title,hint,status,body,footer);document.body.append(dialog);
  const entry=document.createElement('button');entry.id='openNumericStart';entry.type='button';entry.className='enamel';entry.hidden=true;entry.onclick=open;document.querySelector('.decision-actions')?.append(entry);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{dismissed=key(api.getGame());restore();});
  document.addEventListener('close',()=>queueMicrotask(()=>{if(api)render(api.getGame());}),true);
 },render,open,editing:()=>!!dialog?.open&&!!marker,intercept,failed};
})();
