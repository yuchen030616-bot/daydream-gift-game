/* Shared bookkeeping display. All mutations go through the authoritative room API. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),room=()=>window.DreamRoom,host=()=>room()?.role==='host';
 let api,dialog,game,lastGame='',busy=false,error='';
 const rendered=new WeakMap();
 const series=()=>room()?.series||null;
 const unfinished=s=>s&&!['completed','ended'].includes(s.status);
 const idle=()=>game?.phase==='ended'||game?.phase==='select'&&game.started===false&&game.selected==null;
 const amount=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' 元':'—';
 function node(tag,id,text){const n=document.createElement(tag);if(id)n.id=id;if(text!==undefined)n.textContent=text;return n;}
 function memberList(){const members=room()?.seriesMembers;return Array.isArray(members)?members.filter(m=>m&&typeof m.peer==='string'&&m.role!=='player'):[];}
 function status(s){return !s?'尚未开始计分对战':s.status==='active'?'第 '+s.round+' / '+s.config.rounds+' 局进行中':s.status==='awaiting_banker'?(s.round?'本局已结算，等待确认下一局庄家':'等待确认第一局庄家'):s.status==='completed'?'本次 '+s.config.rounds+' 局对战已完成':'本次计分对战已结束';}
 function content(target,s,signature=JSON.stringify(s)){
  if(!target||rendered.get(target)===signature)return;rendered.set(target,signature);
  target.replaceChildren();target.append(node('p',null,status(s)));if(!s)return;
  target.append(node('p',null,'固定每局门票 '+amount(s.config.entryFee)+' · 已结算 '+s.records.length+' 局'));
  const balances=node('div');balances.className='series-balances';
  for(const account of s.balances||[]){const card=node('article');card.append(node('strong',null,account.name),node('span',null,'累计净额 '+amount(account.net)));balances.append(card);}target.append(balances);
  if(s.records.length){const scroller=node('div');scroller.className='series-table-scroll';const table=node('table'),head=node('thead'),row=node('tr');for(const text of ['局','开箱玩家','庄家','门票','获得金额','玩家净额'])row.append(node('th',null,text));head.append(row);table.append(head);const body=node('tbody');for(const record of s.records){const tr=node('tr');for(const text of [String(record.round),record.player.name,record.banker.name,amount(record.ticket),amount(record.prize),amount(record.playerNet)])tr.append(node('td',null,text));body.append(tr);}table.append(body);scroller.append(table);target.append(scroller);}
 }
 function summary(target,s,signature){
  if(!target||rendered.get(target)===signature)return;rendered.set(target,signature);target.replaceChildren();
  if(!s){target.append(node('strong',null,'计分板对战 · 查看账目'));return;}
  target.append(node('strong',null,'计分板 · 第 '+Math.max(1,s.round)+' / '+s.config.rounds+' 局'));
  const line=node('span');line.className='series-summary-line';
  if(!s.records.length)line.textContent='门票 '+amount(s.config.entryFee)+' · 待结算';
  else for(const account of (s.balances||[]).slice(0,2)){const accountText=node('span',null,account.name+' '+(account.net>0?'+':'')+amount(account.net));accountText.className='series-summary-account';line.append(accountText);}
  target.append(line);const extra=Math.max(0,(s.balances||[]).length-2),hint=node('small',null,(extra?'另 '+extra+' 位 · ':'')+'点击展开全账');hint.className='series-summary-hint';target.append(hint);
 }
 function boards(){
  const s=series(),signature=JSON.stringify(s);
  for(const [selector,id]of [['.stage','seriesGameBoard'],['#roomPanel','seriesRoomBoard']]){const parent=document.querySelector(selector);if(parent&&!$(id)){const details=node('details',id);details.className='series-board';const heading=node('summary',id+'Summary'),body=node('div',id+'Body');details.append(heading,body);parent.append(details);}const board=$(id);if(board){board.hidden=!s;summary($(id+'Summary')||board.children[0],s,signature);content($(id+'Body'),s,signature);}}
  for(const [parentId,id]of [['settlement','seriesSettlementNext'],['resultDialog','seriesResultNext']]){const parent=$(parentId);if(parent&&!$(id)){const b=node('button',id);b.type='button';b.className='secondary series-entry';b.onclick=()=>{if(parentId==='resultDialog'&&parent.open)parent.close();open();};parent.append(b);}const button=$(id);if(button){button.hidden=!s||game?.phase!=='ended';const caption=host()&&s?.status==='awaiting_banker'?'下一局庄家 · 确认后继续':'查看计分对战账目';if(button.textContent!==caption)button.textContent=caption;}}
 }
 function paint(){
  const s=series(),money=game?.mode==='money';content($('seriesDialogBoard'),s);
  $('seriesModeNotice').textContent=money?'九档金额仅首局确认，本大局沿用。这里只作游戏计分，无实际收款、转账或支付。庄家与开箱玩家必须为不同席位。':'计分板对战仅支持普通金额版，请由房主先切换到普通版。';
  $('seriesCreateForm').hidden=!host()||!money||unfinished(s);$('seriesCreate').disabled=busy||!idle()||room()?.connected===false;
  $('seriesNextForm').hidden=!host()||!money||s?.status!=='awaiting_banker';$('seriesConfirmNext').disabled=busy||room()?.connected===false;
  $('seriesEnd').hidden=!host()||!unfinished(s);$('seriesEnd').disabled=busy;
  const select=$('seriesBanker'),previous=select.value;select.replaceChildren();const blank=node('option',null,'请选择本局庄家');blank.value='';select.append(blank);for(const m of memberList()){const option=node('option',null,m.name+(m.role==='host'?' · 房主':''));option.value=m.peer;select.append(option);}if(memberList().some(m=>m.peer===previous))select.value=previous;
  $('seriesStatus').textContent=error||(!host()?'账目由房主确认。每局结算后不会自动重开，须先确认下一局庄家。':busy?'正在同步计分对战设置…':'确认后本次对战的局数与门票固定不变；每局都要由房主确认下一位庄家。');$('seriesStatus').classList.toggle('is-error',!!error);
 }
 async function action(kind){
  if(!host()||busy||game?.mode!=='money')return;const s=series();
  try{
   let callback;
   if(kind==='create'){if(!idle())throw Error('请在本局开始前或结算后设置计分对战');if(unfinished(s))throw Error('本次计分对战尚未结束，不能修改门票或局数');const rawRounds=$('seriesRounds').value.trim(),rawFee=$('seriesFee').value.trim(),rounds=Number(rawRounds),entryFee=Number(rawFee);if(!rawRounds||!rawFee||!Number.isInteger(rounds)||rounds<1||rounds>99||!Number.isFinite(entryFee)||entryFee<0||entryFee>1000000||Math.abs(entryFee*100-Math.round(entryFee*100))>1e-6)throw Error('请填写1至99局，门票为0至1000000元且最多两位小数');callback=()=>room().createSeries({rounds,entryFee});}
   else if(kind==='next'){const peer=$('seriesBanker').value;if(s?.status!=='awaiting_banker'||!memberList().some(m=>m.peer===peer))throw Error('请选择一位在线、非当前开箱玩家的庄家');callback=()=>room().confirmSeriesNext(peer);}
   else{if(!unfinished(s))throw Error('当前没有进行中的计分对战');callback=()=>room().endSeries();}
   busy=true;error='';paint();const accepted=await callback();if(accepted===false)throw Error('设置未能同步，请检查连接后重试');
  }catch(failure){error=failure?.message||'操作失败，请稍后重试';}
  finally{busy=false;if(dialog.open)paint();boards();}
 }
 function open(){if(!api)return false;game=api.getGame();if(dialog.open){paint();return true;}window.QuotePopup?.pause();if(document.querySelector('dialog[open]'))return false;paint();dialog.showModal();return true;}
 function render(g){if(!api)return;const changed=lastGame&&lastGame!==g.gameId;game=g;lastGame=g.gameId;boards();if(dialog.open){if(changed)dialog.close();else paint();}}
 window.SeriesBoard={init(options){
  api=options;game=api.getGame();lastGame=game?.gameId;
  dialog=node('dialog','seriesDialog');dialog.className='series-dialog';dialog.setAttribute('aria-labelledby','seriesTitle');
  const title=node('h2','seriesTitle','计分板对战'),notice=node('p','seriesModeNotice'),statusNode=node('p','seriesStatus');statusNode.setAttribute('role','status');
  const create=node('div','seriesCreateForm');create.className='series-config';const roundsLabel=node('label',null,'连续局数（1–99）'),rounds=node('input','seriesRounds');rounds.type='number';rounds.min='1';rounds.max='99';rounds.step='1';rounds.value='3';roundsLabel.append(rounds);const feeLabel=node('label',null,'固定每局门票（元）'),fee=node('input','seriesFee');fee.type='number';fee.min='0';fee.max='1000000';fee.step='0.01';fee.value='0';feeLabel.append(fee);const start=node('button','seriesCreate','确认本次对战设置');start.type='button';start.className='enamel';start.onclick=()=>action('create');create.append(roundsLabel,feeLabel,start);
  const next=node('div','seriesNextForm'),label=node('label',null,'下一局庄家'),select=node('select','seriesBanker');label.append(select);const confirm=node('button','seriesConfirmNext','确认庄家 · 准备下一局');confirm.type='button';confirm.className='enamel';confirm.onclick=()=>action('next');next.append(label,confirm);
  const body=node('div','seriesDialogBoard'),end=node('button','seriesEnd','结束本次计分对战');end.type='button';end.className='secondary';end.onclick=()=>action('end');const close=node('button','closeSeries','收起计分板');close.type='button';close.className='secondary';close.onclick=()=>dialog.close();
  dialog.append(title,notice,statusNode,create,next,body,end,close);document.body.append(dialog);render(game);
 },open,render};
})();
