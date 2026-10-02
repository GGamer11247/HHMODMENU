/* Compatibility filename required by Hammy Home. Main implementation is debug-controls.js. */
(function(){
  'use strict';
  if (window.__HAMMY_DEBUG_CONTROLS_LOADED__) return;
  var s=document.createElement('script');
  s.src='js/debug-controls.js?v=19';
  s.async=false;
  (document.head||document.documentElement).appendChild(s);
})();
