/* Room owner approves quote-only delegation. This UI never changes authority itself. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),room=()=>window.DreamRoom;
 let api,game,busy=false,dismissed='',lastKey='',epoch=0;
 const host=()=>room()?.role==='host';
 const requests=()=>room()?.bankerRequests||[];
 const pending=()=>requests().filter(r=>r.status==='pending');
 const key=()=>pending().map(r=>r.id).join('|');
 function status(text){$('bankerStatus').textContent=text;}
 function close(){dismissed=key();if($('bankerDialog').open)$('bankerDialog').close();}
 function renderList(){const list=$('bankerRequestsList');list.replaceChildren();
  if(!host())return;for(const request of pending()){
   const row=document.createElement('div');row.className='banker-request';
   const name=document.createElement('strong');name.textContent=request.name+' · 申请报价庄家';row.append(name);
   const actions=document.createElement('div');actions.className='banker-review-actions';
   for(const[accept,label]of [[false,'拒绝'],[true,'同意 · 仅报价']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=busy||room()?.connected===false;button.onclick=()=>decide(request.id,accept);actions.append(button);}row.append(actions);list.append(row);
  }
 }
 function sync(){if(!api)return;const active=room()&&room().role!=='solo',banker=room()?.currentBanker;
  $('bankerEntry').hidden=!active;$('bankerEntry').textContent=room()?.canQuote?'庄家 · 你负责报价':'庄家 · 申请 / 查看';
  $('bankerCurrent').textContent=banker?'当前庄家：'+banker.name+(banker.host?'（房主）':'（仅报价）'):'当前庄家：房主';
  $('requestBanker').hidden=host()||room()?.canQuote===true;$('requestBanker').disabled=busy||room()?.canRequestBanker!==true||room()?.connected===false;
  $('reclaimBanker').hidden=!host()||banker?.host!==false;$('reclaimBanker').disabled=busy||room()?.connected===false;
  $('bankerReviewHeading').hidden=!host();renderList();
 }
 async function invoke(fn,message){if(busy||room()?.connected===false)return;busy=true;const ticket=epoch;sync();status('正在同步…');try{const ok=await fn();if(ticket!==epoch)return;if(ok===false)throw Error('当前未能完成，请等待最新房间状态后重试。');status(message);}catch(e){if(ticket===epoch)status(e.message||'同步失败，请稍后重试。');}finally{if(ticket===epoch){busy=false;sync();}}}
 function decide(id,accept){if(!host())return;return invoke(()=>room().decideBanker(id,accept),accept?'已同意庄家申请，仅交接报价权。':'已拒绝这份庄家申请。');}
 function open(){if(!api||!room()||room().role==='solo')return;window.QuotePopup?.pause();if(document.querySelector('dialog[open]:not(#bankerDialog)'))return;sync();if(!$('bankerDialog').open)$('bankerDialog').showModal();$('closeBanker').focus();}
 function render(g){if(!api)return;game=g;const next=room()?.role+':'+room()?.currentBanker?.peer;if(next!==lastKey){epoch++;busy=false;lastKey=next;}sync();const state=room()?.bankerRequestStatus;if(state==='pending'||state==='sending')status('庄家申请等待房主审批；你当前的开箱或围观身份保持。');else if(state==='declined')status('房主未同意这次申请；房间和对局保持。');else if(room()?.canQuote)status('你现在只负责报价。房间管理、管理员和宝箱控制权仍由原房主负责。');
  if(host()&&pending().length&&dismissed!==key()&&!$('bankerDialog').open)open();
 }
 window.BankerPanel={init(options){if(api)return;api=options;
  const entry=document.createElement('button');entry.id='bankerEntry';entry.type='button';entry.className='banker-entry';entry.textContent='庄家 · 申请 / 查看';($('roomActions')||$('roomPanel')).append(entry);
  document.body.insertAdjacentHTML('beforeend','<dialog id="bankerDialog" class="banker-dialog" aria-labelledby="bankerTitle"><button id="closeBanker" class="banker-close" type="button" aria-label="关闭庄家面板">×</button><span class="eyebrow">THE QUOTE DESK</span><h2 id="bankerTitle">庄家 · 只接手报价</h2><p id="bankerCurrent"></p><p>任何成员均可申请，须经房主同意。庄家只能报价；房间管理、管理员和宝箱内容仍由原房主掌握。</p><button id="requestBanker" class="enamel" type="button">申请成为庄家</button><button id="reclaimBanker" class="secondary" type="button" hidden>房主收回报价权</button><h3 id="bankerReviewHeading">待审批申请</h3><div id="bankerRequestsList"></div><p id="bankerStatus" role="status" aria-live="polite"></p></dialog>');
  $('bankerEntry').onclick=open;$('closeBanker').onclick=close;$('bankerDialog').oncancel=e=>{e.preventDefault();close();};
  $('requestBanker').onclick=()=>{if(host()||room()?.canRequestBanker!==true)return;return invoke(()=>room().requestBanker(),'庄家申请已发送，等待房主同意。');};
  $('reclaimBanker').onclick=()=>{if(!host())return;return invoke(()=>room().reclaimBanker(),'房主已收回报价权。');};
  document.addEventListener('close',()=>queueMicrotask(()=>{if(game)render(game);}),true);render(options.getGame());
 },render,open};
})();
