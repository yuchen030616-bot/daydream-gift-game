(function(){'use strict';
 const link=document.getElementById('dreamBackHall'),brand=document.querySelector('.brand');
 function confirmReturn(event){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const role=window.DreamRoom?.role,phase=document.body.dataset.phase;
  const message=role==='host'?'返回大厅后，当前房间会暂停同步。确定返回大厅？':(['player','solo'].includes(role)&&['open','pricing','offer','final'].includes(phase)?'本局还没有结束，确定返回大厅？':'');
  if(message&&!window.confirm(message))event.preventDefault();
 }
 link?.addEventListener('click',confirmReturn);brand?.addEventListener('click',confirmReturn);
})();
