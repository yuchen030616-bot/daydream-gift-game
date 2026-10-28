/* Keep previously shared dream-room links working at the new game hall entry. */
(function(){'use strict';const here=new URL(location.href),hash=new URLSearchParams(here.hash.slice(1));if(hash.get('room')||here.searchParams.get('room')){const target=new URL('dream.html',here);target.search=here.search;target.hash=here.hash;location.replace(target.href);}})();
