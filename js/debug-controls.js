/* Hammy Home local debugging controls.
 * Loaded before the app's window.onload handler so it can patch restrictions
 * before the scene starts, then exposes a live editor once the app is ready.
 */
(function () {
  'use strict';

  // Load exactly once. The game expects both debug-controls.js and the
  // versioned compatibility filename to exist; the second load is a no-op.
  if (window.__HAMMY_DEBUG_CONTROLS_LOADED__) return;
  window.__HAMMY_DEBUG_CONTROLS_LOADED__ = true;

  var root = window.z0;
  function getRoot() { return window.z0 || root || null; }
  var MAX_DEBUG_OBJECTS = 1000000;
  var DEFAULT_BUFFER_CAPACITY = 256;
  var state = {
    selected: null,
    open: true,
    mods: {
      pouchCapacity: 6,
      gravityStrength: 39.2266,
      gravityX: 0,
      gravityY: -1,
      gravityZ: 0,
      gravityInitialized: false
    }
  };

  function z(name) {
    var r = getRoot();
    if (!r) return null;
    if (r[name]) return r[name];
    if (r.z2 && r.z2[name]) return r.z2[name];
    return null;
  }

  function getPool() {
    var r = getRoot(); return r && r.z2 && r.z2.Helpers ? r.z2.Helpers.ObjectPool : null;
  }

  function forEachCtor(obj, visitor, seen, depth) {
    if (!obj || typeof obj !== 'object' || depth < 0) return;
    seen = seen || [];
    if (seen.indexOf(obj) >= 0) return;
    seen.push(obj);
    Object.keys(obj).forEach(function (key) {
      var value;
      try { value = obj[key]; } catch (_) { return; }
      if (typeof value === 'function' && value.prototype) { visitor(value, key); return; }
      if (value && typeof value === 'object' && depth > 0) forEachCtor(value, visitor, seen, depth - 1);
    });
  }

  function safeCall(fn, ctx) {
    try {
      return fn.apply(ctx, Array.prototype.slice.call(arguments, 2));
    } catch (e) {
      console.warn('[Hammy Debug]', e);
      return undefined;
    }
  }

  // ---- Restriction bypasses ------------------------------------------------
  function patchRestrictions() {
    var acc = z('z1092');
    var drag = z('z1061');
    var manager = z('z1063');
    var foodConfig = z('FoodConfig');
    if (foodConfig && Number(foodConfig.maxObjects) < 250) foodConfig.maxObjects = 250;
    // Object counts / pools.
    var pool = getPool();
    if (pool) {
      pool.getNumObjectsRemaining = function () { return -1; };
      if (pool.objMaxCounts) {
        Object.keys(pool.objMaxCounts).forEach(function (key) {
          pool.objMaxCounts[key] = -1;
        });
      }
    }

    // Make all registered entity counts effectively unlimited. The renderer's
    // SPS buffers are separately expanded in ham.min.js to a safe debug size.
    if (z('App') && Array.isArray(z('App').EntityConfigs)) {
      z('App').EntityConfigs.forEach(function (cfg) {
        if (cfg && cfg.maxObjects && cfg.maxObjects < DEFAULT_BUFFER_CAPACITY) cfg.maxObjects = DEFAULT_BUFFER_CAPACITY;
      });
    }
    if (z('z1062')) z('z1062').objectCount = MAX_DEBUG_OBJECTS;
    if (acc && acc.prototype) acc.prototype.getObjectCount = function () { return MAX_DEBUG_OBJECTS; };
    if (acc && acc.prototype) {
      forEachCtor(getRoot(), function (ctor) {
        try {
          if (ctor !== acc && ctor.prototype && acc.prototype.isPrototypeOf(ctor.prototype)) {
            ctor.objectCount = MAX_DEBUG_OBJECTS;
            if (Object.prototype.hasOwnProperty.call(ctor.prototype, 'isValidDropLocation')) {
              ctor.prototype.isValidDropLocation = function () { return true; };
            }
          }
        } catch (_) {}
      }, null, 3);
    }

    // Placement: bypass grid snapping, cage bounds and overlap checks.
    if (acc) {
      acc.prototype.getPositionOnMapFromDropToRef = function (x, y, zz, out) {
        out.x = x;
        out.y = y;
        out.z = zz;
      };
      acc.prototype.isValidDropLocation = function () { return true; };
      acc.prototype.limitPosition = function () {};
    }
    if (drag) {
      drag.prototype.isValidDropLocation = function () { return true; };
      drag.prototype.setPositionOnMapFromDrop = function (x, y, zz) {
        if (typeof this.setPositionDrag === 'function') this.setPositionDrag(x, y, zz, true);
        if (typeof this.setPosition === 'function') this.setPosition(x, y, zz);
      };
    }
    if (manager) manager.prototype._isValidDrop = function () { return true; };

    // Disable the application-level "is placed / can translate / can rotate"
    // restrictions for local experiments.
    if (acc) {
      var oldInit = acc.prototype.init;
      if (!acc.prototype.__hamDebugInitPatched) {
        acc.prototype.init = function () {
          var r = oldInit ? oldInit.apply(this, arguments) : undefined;
          this.canTranslate = true;
          this.canRotate = true;
          this.canPaint = true;
          this.canDelete = true;
          this.isDraggable = true;
          return r;
        };
        acc.prototype.__hamDebugInitPatched = true;
      }
    }
  }

  function patchInstanceState(app) {
    if (!app) return;
    var gh = app.graphicsHelper;
    if (gh) {
      gh.camBoundsMin = null;
      gh.camBoundsMax = null;
      gh.moveCameraBorder = 0;
      gh.camMaxSpeed = Math.max(gh.camMaxSpeed || 0, 100);
      gh.maxCameraZoomPos = -5;
      gh.minCameraZoomPos = -250;
    }
    // Re-assert counts once configs/object pools are initialized.
    if (z('z1062')) z('z1062').objectCount = MAX_DEBUG_OBJECTS;
    var pool = getPool();
    if (pool) {
      if (pool.objMaxCounts) Object.keys(pool.objMaxCounts).forEach(function (key) { pool.objMaxCounts[key] = -1; });
      pool.getNumObjectsRemaining = function () { return -1; };
    }
  }

  // ---- UI ------------------------------------------------------------------
  var css = [
    '#hamDebug{position:fixed;left:10px;top:10px;width:355px;max-height:calc(100vh - 20px);overflow:hidden;z-index:2147483647;font:12px/1.35 Arial,sans-serif;color:#eee;background:rgba(18,18,22,.96);border:1px solid rgba(255,255,255,.18);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.45);backdrop-filter:blur(5px)}',
    '#hamDebug *{box-sizing:border-box}',
    '#hamDebug .hdHead{display:flex;align-items:center;gap:7px;padding:8px 10px;background:rgba(255,255,255,.06);cursor:grab;user-select:none;touch-action:none}',
    '#hamDebug.hdDragging .hdHead{cursor:grabbing}',
    '#hamDebug .hdTitle{font-weight:700;font-size:14px;flex:1}',
    '#hamDebug button,#hamDebug select,#hamDebug input{font:inherit}',
    '#hamDebug button{background:#2b2f38;color:#fff;border:1px solid #525866;border-radius:5px;padding:6px 9px;cursor:pointer;pointer-events:auto}',
    '#hamDebug button:hover{background:#3a404b}',
    '#hamDebug input,#hamDebug select{background:#101217;color:#eee;border:1px solid #454b57;border-radius:4px;padding:3px 5px}',
    '#hamDebug .hdBody{padding:8px;max-height:calc(100vh - 80px);overflow:auto}',
    '#hamDebug .hdRow{display:grid;grid-template-columns:72px 1fr 72px 1fr;gap:4px;align-items:center;margin:4px 0}',
    '#hamDebug .hdRow1{display:grid;grid-template-columns:72px 1fr;gap:4px;align-items:center;margin:4px 0}',
    '#hamDebug .hdTriple{display:grid;grid-template-columns:32px 1fr 32px 1fr 32px 1fr;gap:4px;align-items:center;margin:4px 0}',
    '#hamDebug .hdSection{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.13);font-weight:700;color:#9fd8ff}',
    '#hamDebug .hdMini{color:#a8adb7;font-size:11px}',
    '#hamDebug .hdBtns{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}',
    '#hamDebug .hdBadge{padding:2px 6px;border-radius:999px;background:#303641;color:#b9c1ce;font-size:10px}',
    '#hamDebug input[type=color]{height:24px;padding:1px}',
    '#hamDebug input[type=checkbox]{width:auto}',
    '#hamDebug textarea{width:100%;min-height:65px;resize:vertical;background:#0f1115;color:#ddd;border:1px solid #454b57;border-radius:4px;padding:5px;font:10px/1.3 Consolas,monospace}',
    '#hamDebug .hdHidden{display:none!important}',
    '#hamDebug .hdWarn{color:#ffca78}',
    '#hamDebug .hdOk{color:#a4f0b0}'
  ].join('');

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'className') n.className = attrs[k];
      else if (k === 'checked') n.checked = !!attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function fmt(n) { return Number(n || 0).toFixed(4).replace(/\.0000$/, ''); }
  function deg(rad) { return (Number(rad || 0) * 180 / Math.PI); }
  function rad(degVal) { return (Number(degVal || 0) * Math.PI / 180); }
  function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)); }
  function toHex(c) {
    var r = c && (c.r != null ? c.r : c.x), g = c && (c.g != null ? c.g : c.y), b = c && (c.b != null ? c.b : c.z);
    return '#' + [r,g,b].map(function (v) { return Math.round(clamp01(v) * 255).toString(16).padStart(2,'0'); }).join('');
  }
  function normalizeColorValue(v) {
    return { r: v && (v.r != null ? v.r : v.x) || 0, g: v && (v.g != null ? v.g : v.y) || 0, b: v && (v.b != null ? v.b : v.z) || 0 };
  }
  function setColor(obj, key, hex) {
    var r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    if (typeof obj.setColor === 'function') safeCall(obj.setColor, obj, r, g, b, key);
  }

  function getObjects(app) {
    // Do NOT deduplicate by id/uniqueId here. Hammy Home can reuse an id
    // across multiple instances of the same placed item, and the old logic
    // silently threw away every instance after the first one. Deduplicate
    // only when the exact same JS object appears in both source collections.
    var out = [];
    function add(o) {
      if (!o || typeof o !== 'object') return;
      if (!(o.position || o.mesh || o.hitMeshes || o.accType)) return;
      if (out.indexOf(o) !== -1) return;
      out.push(o);
    }
    (app.objsOnScene || []).forEach(add);
    var h = z('z1062');
    (h && h.activeObjects || []).forEach(add);
    return out;
  }

  function objectLabel(o, index, all) {
    var base = '';
    try { base = o && (o.objName || o.name || o.shapeName || o.accType); } catch (_) {}
    if (!base) base = nameOf(o);
    var sameBefore = 0;
    for (var i = 0; i < index; i++) {
      var p = all[i], pb = '';
      try { pb = p && (p.objName || p.name || p.shapeName || p.accType); } catch (_) {}
      if (!pb) pb = nameOf(p);
      if (pb === base) sameBefore++;
    }
    var total = 0;
    for (var j = 0; j < all.length; j++) {
      var q = all[j], qb = '';
      try { qb = q && (q.objName || q.name || q.shapeName || q.accType); } catch (_) {}
      if (!qb) qb = nameOf(q);
      if (qb === base) total++;
    }
    return total > 1 ? base + ' #' + (sameBefore + 1) : base;
  }

  function nameOf(o) {
    return o && o.constructor && o.constructor.name ? o.constructor.name : 'Object';
  }

  function isHamster(o) { return nameOf(o).toLowerCase().indexOf('1062') >= 0 || nameOf(o).toLowerCase() === 'z1062'; }
  function isBedding(o) { return nameOf(o) === 'Bedding' || (o && o.floorY != null && o.pieces && o.resetHeights); }


  // ---- Hamster discovery / global gravity -------------------------------
  function getHamsters(app) {
    var H = z('z1062'), list = [];
    if (H && Array.isArray(H.activeObjects)) {
      H.activeObjects.forEach(function (h) {
        if (h && list.indexOf(h) === -1) list.push(h);
      });
    }
    if (!list.length && app) {
      getObjects(app).forEach(function (o) { if (isHamster(o)) list.push(o); });
    }
    return list;
  }

  function getControlledHamster(app) {
    var hs = getHamsters(app);
    return hs[0] || null;
  }

  function readGravityFromWorld(app) {
    var world = app && app.world;
    if (!world || !world.gravity) return false;
    var x=Number(world.gravity.x)||0, y=Number(world.gravity.y)||0, zc=Number(world.gravity.z)||0;
    var mag=Math.sqrt(x*x+y*y+zc*zc);
    if (!isFinite(mag) || mag < 1e-8) {
      state.mods.gravityStrength=0;
      state.mods.gravityX=0; state.mods.gravityY=-1; state.mods.gravityZ=0;
    } else {
      state.mods.gravityStrength=mag;
      state.mods.gravityX=x/mag; state.mods.gravityY=y/mag; state.mods.gravityZ=zc/mag;
    }
    state.mods.gravityInitialized=true;
    return true;
  }

  function applyGravityToWorld(app) {
    var world = app && app.world;
    if (!world || !world.gravity) return false;
    var x=Number(state.mods.gravityX), y=Number(state.mods.gravityY), zc=Number(state.mods.gravityZ);
    if (!isFinite(x)) x=0; if (!isFinite(y)) y=-1; if (!isFinite(zc)) zc=0;
    var len=Math.sqrt(x*x+y*y+zc*zc);
    if (!isFinite(len) || len < 1e-8) { x=0; y=-1; zc=0; len=1; state.mods.gravityX=0;state.mods.gravityY=-1;state.mods.gravityZ=0; }
    var strength=Math.max(0,Math.min(500,Number(state.mods.gravityStrength)||0));
    world.gravity.x=x/len*strength;
    world.gravity.y=y/len*strength;
    world.gravity.z=zc/len*strength;
    state.mods.gravityInitialized=true;
    return true;
  }

  function gravityText(app) {
    var world=app&&app.world;
    if (!world||!world.gravity) return 'Physics world not initialized yet';
    var x=Number(world.gravity.x)||0,y=Number(world.gravity.y)||0,z=Number(world.gravity.z)||0;
    var mag=Math.sqrt(x*x+y*y+z*z);
    return 'Live gravity: ('+fmt(x)+', '+fmt(y)+', '+fmt(z)+') | strength '+fmt(mag);
  }

  function readGravityFields(mods, strength, gx, gy, gz) {
    var sval=String(strength.value).trim();
    var xv=String(gx.value).trim(), yv=String(gy.value).trim(), zv=String(gz.value).trim();
    if (sval !== '') {
      var sn=Number(sval);
      if (isFinite(sn)) mods.gravityStrength=Math.max(0,Math.min(500,sn));
    }
    if (xv !== '') { var xn=Number(xv); if (isFinite(xn)) mods.gravityX=Math.max(-1,Math.min(1,xn)); }
    if (yv !== '') { var yn=Number(yv); if (isFinite(yn)) mods.gravityY=Math.max(-1,Math.min(1,yn)); }
    if (zv !== '') { var zn=Number(zv); if (isFinite(zn)) mods.gravityZ=Math.max(-1,Math.min(1,zn)); }
  }

  function setPouchCapacity(h, value) {
    var cap = Math.max(1, Math.min(999, Math.floor(Number(value) || 1)));
    state.mods.pouchCapacity = cap;
    if (!h) {
      getHamsters(getRoot() && getRoot().app).forEach(function (ham) { ham._maxPouchedFood = cap; });
      return;
    }
    h._maxPouchedFood = cap;
  }

  function applyPouchCapacityToAll(app) {
    var cap = Math.max(1, Math.min(999, Math.floor(Number(state.mods.pouchCapacity) || 6)));
    state.mods.pouchCapacity = cap;
    getHamsters(app).forEach(function (h) { h._maxPouchedFood = cap; });
  }

  function getStoredFoodCount(h) {
    return h && Array.isArray(h.pouchedFood) ? h.pouchedFood.length : 0;
  }

  function updatePouchVisualState(h) {
    if (!h) return;
    var cap = Math.max(1, Number(h._maxPouchedFood) || 6);
    h._pouchFilledFracLeft = Math.min(1, (Number(h._numPouchedFoodLeft) || 0) / cap);
    h._pouchFilledFracRight = Math.min(1, (Number(h._numPouchedFoodRight) || 0) / cap);
  }

  function setStoredFoodCount(h, target, app) {
    if (!h) return {count:0, added:0, removed:0};
    var desired = Math.max(0, Math.min(250, Math.floor(Number(target) || 0)));
    var fm = app && app.foodManager;
    var current = getStoredFoodCount(h), added = 0, removed = 0;
    if (!fm || typeof fm.getRandomInactive !== 'function') return {count:current, added:0, removed:0};

    while (current > desired && h.pouchedFood.length) {
      var out = typeof h.removeFoodFromPouch === 'function' ? h.removeFoodFromPouch() : h.pouchedFood.pop();
      if (!out) break;
      out.owner = null; out.unpouching = false; out.pouchSide = 0;
      safeCall(out.removeFromAccessories, out);
      safeCall(out.removeFromScene, out);
      safeCall(out.removeFromTracker, out);
      safeCall(out.disablePhysics, out);
      safeCall(fm.recycle, fm, out);
      current--; removed++;
    }

    while (current < desired) {
      var food = safeCall(fm.getRandomInactive, fm);
      if (!food) break;
      // Match the game's normal food-creation path so recycled food has all
      // of its runtime state initialized before it enters a pouch.
      safeCall(food.init, food, {skipAddToScene:true, rz:Math.PI*Math.random()});
      safeCall(food.removeFromScene, food);
      safeCall(food.removeFromAccessories, food);
      safeCall(food.removeFromTracker, food);
      food.owner = h;
      food.unpouching = false;
      food.pouchSide = (Number(h._numPouchedFoodLeft) || 0) <= (Number(h._numPouchedFoodRight) || 0) ? -1 : 1;
      if (typeof h.addFoodToPouch === 'function') h.addFoodToPouch(food);
      else h.pouchedFood.push(food);
      current++; added++;
    }
    if (current > Number(h._maxPouchedFood) || !h._maxPouchedFood) h._maxPouchedFood = Math.max(6, current);
    updatePouchVisualState(h);
    return {count:getStoredFoodCount(h), added:added, removed:removed};
  }

  function pouchText(h) {
    if (!h) return 'No hamster found';
    var count = getStoredFoodCount(h);
    var cap = Number(h._maxPouchedFood) || 0;
    return count + ' / ' + cap + ' food bits currently stored';
  }


  function currentScale(o) {
    if (isHamster(o) && o.mesh && o.mesh.scaling) return o.mesh.scaling;
    return o && o.scaling ? o.scaling : null;
  }

  function applyTransform(o, fields) {
    if (!o) return;
    var p = fields.pos, r = fields.rot, s = fields.scale;
    if (typeof o.setPosition === 'function' && p) safeCall(o.setPosition, o, p.x, p.y, p.z);
    else if (o.position && p) { o.position.x=p.x;o.position.y=p.y;o.position.z=p.z; }
    if (typeof o.setRotation === 'function' && r) safeCall(o.setRotation, o, rad(r.x), rad(r.y), rad(r.z));
    else if (o.rotation && r) { o.rotation.x=rad(r.x);o.rotation.y=rad(r.y);o.rotation.z=rad(r.z); }
    if (s) {
      if (o.setScale && !isHamster(o)) safeCall(o.setScale, o, s.x, s.y, s.z);
      var sc = currentScale(o);
      if (sc) { sc.x=s.x;sc.y=s.y;sc.z=s.z; }
    }
    if (isHamster(o) && o.physics && o.physics.setPosition && p) safeCall(o.physics.setPosition, o.physics, p.x, p.y, p.z);
    if (o.onChangeObservable && o.onChangeObservable.notifyObservers) safeCall(o.onChangeObservable.notifyObservers, o.onChangeObservable, o);
  }

  function buildPanel() {
    if (document.getElementById('hamDebug')) return document.getElementById('hamDebug');
    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    var panel = el('div',{id:'hamDebug'});
    var head = el('div',{className:'hdHead'});
    head.appendChild(el('div',{className:'hdTitle',text:'HamsterEdit — v1.0'}));
    var status = el('span',{className:'hdBadge',id:'hdStatus',text:'waiting'}); head.appendChild(status);
    var collapse = el('button',{title:'Toggle panel',text:'×'}); head.appendChild(collapse);
    panel.appendChild(head);
    var body = el('div',{className:'hdBody',id:'hdBody'}); panel.appendChild(body);
    (document.documentElement || document.body).appendChild(panel);
    collapse.addEventListener('click',function(){ body.classList.toggle('hdHidden'); });

    // Make the debug panel actually draggable.  The app uses pointer events on
    // the canvas, so capture the pointer on the header and move the fixed panel
    // itself instead of allowing the canvas to interpret the gesture as camera
    // input.
    (function installPanelDrag(){
      var dragState = null;
      function finishDrag(ev){
        if (!dragState) return;
        if (ev && dragState.pointerId != null && ev.pointerId != null && ev.pointerId !== dragState.pointerId) return;
        dragState = null;
        panel.classList.remove('hdDragging');
        try { head.releasePointerCapture(ev.pointerId); } catch (_) {}
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', finishDrag, true);
        document.removeEventListener('pointercancel', finishDrag, true);
      }
      function onMove(ev){
        if (!dragState || ev.pointerId !== dragState.pointerId) return;
        var left = dragState.left + (ev.clientX - dragState.x);
        var top = dragState.top + (ev.clientY - dragState.y);
        var maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
        var maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
        left = Math.max(0, Math.min(maxLeft, left));
        top = Math.max(0, Math.min(maxTop, top));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        ev.preventDefault();
      }
      head.addEventListener('pointerdown', function(ev){
        // Keep the close button clickable and don't start a drag from controls.
        if (ev.button !== 0 || (ev.target && ev.target.closest && ev.target.closest('button'))) return;
        var rect = panel.getBoundingClientRect();
        dragState = {pointerId:ev.pointerId,x:ev.clientX,y:ev.clientY,left:rect.left,top:rect.top};
        panel.classList.add('hdDragging');
        try { head.setPointerCapture(ev.pointerId); } catch (_) {}
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', finishDrag, true);
        document.addEventListener('pointercancel', finishDrag, true);
        ev.preventDefault();
        ev.stopPropagation();
      }, true);
    })();
    return panel;
  }


  function ensurePanelMounted() {
    var panel = document.getElementById('hamDebug');
    if (panel && panel.parentNode !== document.documentElement && panel.parentNode !== document.body) {
      (document.documentElement || document.body).appendChild(panel);
    }
    return panel;
  }


  function renderGlobalControls(app, body) {
    var mods=state.mods;
    var activeHam=getControlledHamster(app);
    if (app && app.world && app.world.gravity && !mods.gravityInitialized) readGravityFromWorld(app);

    body.appendChild(el('div',{className:'hdMini hdOk',text:'HamsterEdit v1.0 — global gravity + food pouch'}));
    body.appendChild(el('div',{className:'hdSection',text:'Global Gravity'}));

    var strength=el('input',{type:'number',step:'0.01',min:'0',max:'500',value:fmt(mods.gravityStrength),id:'hdGravityStrength',name:'gravityStrength'});
    var gx=el('input',{type:'number',step:'0.01',min:'-1',max:'1',value:fmt(mods.gravityX),id:'hdGravityX',name:'gravityDirectionX'});
    var gy=el('input',{type:'number',step:'0.01',min:'-1',max:'1',value:fmt(mods.gravityY),id:'hdGravityY',name:'gravityDirectionY'});
    var gz=el('input',{type:'number',step:'0.01',min:'-1',max:'1',value:fmt(mods.gravityZ),id:'hdGravityZ',name:'gravityDirectionZ'});
    body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Strength',for:'hdGravityStrength'}),strength]));
    body.appendChild(el('div',{className:'hdMini',text:'Direction X / Y / Z. The vector is normalized automatically. Gravity updates as you edit; Apply gravity also commits it explicitly.'}));
    body.appendChild(el('div',{className:'hdTriple'},[
      el('label',{text:'X',for:'hdGravityX'}),gx,
      el('label',{text:'Y',for:'hdGravityY'}),gy,
      el('label',{text:'Z',for:'hdGravityZ'}),gz
    ]));

    var apply=el('button',{text:'Apply gravity',id:'hdApplyGravity'});
    var reset=el('button',{text:'Reset default gravity',id:'hdResetGravity'});
    body.appendChild(el('div',{className:'hdBtns'},[apply,reset]));
    body.appendChild(el('div',{className:'hdMini',text:'Direction presets'}));
    var presets=[
      ['Normal',39.2266,0,-1,0],
      ['Moon',1.62,0,-1,0],
      ['Jupiter',24.79,0,-1,0],
      ['Sun',274,0,-1,0],
      ['Pluto',0.62,0,-1,0],
      ['Zero-G',0,0,-1,0]
    ];
    body.appendChild(el('div',{className:'hdMini',text:'Gravity Presets'}));
    presets.forEach(function(p,i){
      var b=el('button',{text:p[0],id:'hdGravityPreset'+i});
      b.type='button';
      b.onclick=function(){strength.value=fmt(p[1]);gx.value=fmt(p[2]);gy.value=fmt(p[3]);gz.value=fmt(p[4]);apply.click();};
      body.appendChild(b);
      if(i===2) body.appendChild(el('span',{text:''}));
    });
    // Move preset buttons into the normal button row for consistent layout.
    var presetNodes=[];
    for (var pi=0;pi<presets.length;pi++){var node=document.getElementById('hdGravityPreset'+pi);if(node)presetNodes.push(node);}
    var pwrap=el('div',{className:'hdBtns'});
    presetNodes.forEach(function(n){if(n.parentNode) n.parentNode.removeChild(n);pwrap.appendChild(n);});
    body.appendChild(pwrap);
    body.appendChild(el('div',{className:'hdMini',text:'Direction Presets'}));
    var dirPresets=[['Down',0,-1,0],['Up',0,1,0],['Left',-1,0,0],['Right',1,0,0],['Forward',0,0,1],['Back',0,0,-1]];
    var dwrap=el('div',{className:'hdBtns'});
    dirPresets.forEach(function(p){
      var b=el('button',{text:p[0]});
      b.type='button';
      b.onclick=function(){gx.value=fmt(p[1]);gy.value=fmt(p[2]);gz.value=fmt(p[3]);commitGravityFields();};
      dwrap.appendChild(b);
    });
    body.appendChild(dwrap);
    body.appendChild(el('div',{className:'hdMini hdOk',id:'hdGravityStatus',text:gravityText(app)}));

    apply.type='button'; reset.type='button';
    function commitGravityFields(){
      readGravityFields(mods,strength,gx,gy,gz);
      applyGravityToWorld(app);
      var s=document.getElementById('hdGravityStatus');if(s)s.textContent=gravityText(app);
    }
    [strength,gx,gy,gz].forEach(function(field){
      field.addEventListener('input',function(){
        readGravityFields(mods,strength,gx,gy,gz);
        applyGravityToWorld(app);
        var s=document.getElementById('hdGravityStatus');if(s)s.textContent=gravityText(app);
      });
      field.addEventListener('change',commitGravityFields);
    });
    apply.onclick=commitGravityFields;
    reset.onclick=function(){
      mods.gravityStrength=39.2266;mods.gravityX=0;mods.gravityY=-1;mods.gravityZ=0;
      strength.value=fmt(mods.gravityStrength);gx.value='0';gy.value='-1';gz.value='0';
      applyGravityToWorld(app);
      var s=document.getElementById('hdGravityStatus');if(s)s.textContent=gravityText(app);
    };

    body.appendChild(el('div',{className:'hdSection',text:'Hamster food storage'}));
    var stored=el('input',{type:'number',step:'1',min:'0',max:'250',value:String(activeHam?getStoredFoodCount(activeHam):0),id:'hdPouchStored',name:'storedFoodBits'});
    var cap=el('input',{type:'number',step:'1',min:'1',max:'250',value:String(activeHam?Math.max(Number(activeHam._maxPouchedFood)||6,getStoredFoodCount(activeHam)):6),id:'hdPouchCap',name:'foodBitsCapacity'});
    body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Stored food bits',for:'hdPouchStored'}),stored]));
    body.appendChild(el('div',{className:'hdBtns'},[el('button',{text:'Apply stored amount',id:'hdApplyPouch'}),el('button',{text:'Empty pouch',id:'hdEmptyPouch'})]));
    body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Food bits capacity',for:'hdPouchCap'}),cap]));
    body.appendChild(el('div',{className:'hdMini hdOk',id:'hdPouchStatus',text:pouchText(activeHam)}));

    cap.onchange=function(){
      var c=Math.max(1,Math.min(250,Math.floor(Number(this.value)||6)));
      state.mods.pouchCapacity=c;
      getHamsters(app).forEach(function(h){h._maxPouchedFood=Math.max(c,getStoredFoodCount(h));updatePouchVisualState(h);});
      var s=document.getElementById('hdPouchStatus');if(s)s.textContent=pouchText(getControlledHamster(app));
    };
    body.querySelector('#hdApplyPouch').onclick=function(){
      var h=getControlledHamster(app);if(!h){renderPanel(app);return;}
      var result=setStoredFoodCount(h,Number(stored.value)||0,app);
      stored.value=String(result.count);
      if(result.count>Number(h._maxPouchedFood)||!h._maxPouchedFood)h._maxPouchedFood=Math.max(6,result.count);
      cap.value=String(Math.max(Number(h._maxPouchedFood)||6,result.count));
      var s=document.getElementById('hdPouchStatus');if(s)s.textContent=pouchText(h);
      renderPanel(app);
    };
    body.querySelector('#hdEmptyPouch').onclick=function(){var h=getControlledHamster(app);if(h)setStoredFoodCount(h,0,app);renderPanel(app);};

    fixPanelFormAccessibility();
  }

  function fixPanelFormAccessibility() {
    var panel = document.getElementById('hamDebug');
    if (!panel) return;
    var seq = 0;
    panel.querySelectorAll('input,select,textarea').forEach(function(field){
      if (!field.id) field.id = 'hamDebugField' + (++seq);
      if (!field.name) field.name = field.id;
    });
    panel.querySelectorAll('.hdRow1,.hdRow').forEach(function(row){
      var label = row.querySelector('label');
      var field = row.querySelector('input,select,textarea');
      if (!label || !field) return;
      if (!field.id) field.id = 'hamDebugField' + (++seq);
      if (!field.name) field.name = field.id;
      label.setAttribute('for', field.id);
    });
  }

  function renderPanel(app) {
    var panel = buildPanel(), body = document.getElementById('hdBody'), status = document.getElementById('hdStatus');
    if (!body || !app) return;
    status.textContent = state.selected ? 'selected' : 'ready';
    body.innerHTML = '';

    applyPouchCapacityToAll(app);
    renderGlobalControls(app, body);
    var objs = getObjects(app);
    var select = el('select',{id:'hdSelect',name:'selectedObject'});
    select.appendChild(el('option',{value:'',text:'— Select an item / hamster —'}));    objs.forEach(function(o,i){
      var label = objectLabel(o, i, objs);
      var op=el('option',{value:String(i),text:label});
      if (o===state.selected) op.selected=true;
      select.appendChild(op);
    });
    body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Object'}),select]));
    select.addEventListener('change',function(){state.selected = objs[Number(this.value)] || null;renderPanel(app);});

    body.appendChild(el('div',{className:'hdMini',text:objs.length+' objects currently visible. Click an object in the scene or choose one above.'}));

    if (!state.selected) {
      body.appendChild(el('div',{className:'hdSection',text:'Global'}));
      body.appendChild(el('div',{className:'hdBtns'},[
        el('button',{text:'Refresh list',id:'hdRefresh'})
      ]));
      body.appendChild(el('div',{className:'hdMini hdOk',text:'Camera modes and camera hotkeys have been removed. Gravity controls stay on screen without being re-rendered while you edit.'}));
      body.querySelector('#hdRefresh').onclick=function(){renderPanel(app);};
      fixPanelFormAccessibility();
      return;
    }

    var o=state.selected;
    body.appendChild(el('div',{className:'hdSection',text:nameOf(o)+(o.rodentName?' — '+o.rodentName:'')}));
    body.appendChild(el('div',{className:'hdBtns'},[
      el('button',{text:'Refresh'}), el('button',{text:'Delete / recycle',id:'hdRecycle'})
    ]));
    body.lastChild.children[0].onclick=function(){renderPanel(app);};
    body.lastChild.children[1].onclick=function(){
      if (o.recycle) safeCall(o.recycle,o);
      state.selected=null; renderPanel(app);
    };

    var pos = o.position || {x:0,y:0,z:0};
    var rotObj = o.rotation || {x:0,y:0,z:0};
    var sc = currentScale(o) || {x:1,y:1,z:1};
    var f={pos:{x:pos.x,y:pos.y,z:pos.z},rot:{x:deg(rotObj.x),y:deg(rotObj.y),z:deg(rotObj.z)},scale:{x:sc.x,y:sc.y,z:sc.z}};
    var inputs={};
    function numRow(title, key, value){
      var input=el('input',{type:'number',step:'0.01',value:fmt(value),id:'hdField_'+key,name:'field_'+key}); inputs[key]=input;
      return el('div',{className:'hdRow'},[el('label',{text:title,for:'hdField_'+key}),input,el('span',{className:'hdMini',text:key.toUpperCase()}),el('span',{className:'hdMini',text:''})]);
    }
    body.appendChild(el('div',{className:'hdSection',text:'Transform'}));
    body.appendChild(el('div',{className:'hdMini',text:'Position'}));
    ['x','y','z'].forEach(function(k){body.appendChild(numRow('Pos '+k,k,f.pos[k]));});
    body.appendChild(el('div',{className:'hdMini',text:'Rotation (degrees)'}));
    ['x','y','z'].forEach(function(k){body.appendChild(numRow('Rot '+k,'r'+k,f.rot[k]));});
    body.appendChild(el('div',{className:'hdMini',text:'Scale'}));
    ['x','y','z'].forEach(function(k){body.appendChild(numRow('Scale '+k,'s'+k,f.scale[k]));});
    body.appendChild(el('div',{className:'hdBtns'},[
      el('button',{text:'Apply transform',id:'hdApply'}),el('button',{text:'Reset rotation',id:'hdResetRot'}),el('button',{text:'Scale ×2',id:'hdScale2'}),el('button',{text:'Scale ÷2',id:'hdScaleHalf'})
    ]));
    body.querySelector('#hdApply').onclick=function(){
      f.pos={x:Number(inputs.x.value),y:Number(inputs.y.value),z:Number(inputs.z.value)};
      f.rot={x:Number(inputs.rx.value),y:Number(inputs.ry.value),z:Number(inputs.rz.value)};
      f.scale={x:Number(inputs.sx.value),y:Number(inputs.sy.value),z:Number(inputs.sz.value)};
      applyTransform(o,f); renderPanel(app);
    };
    body.querySelector('#hdResetRot').onclick=function(){if(o.setRotation)safeCall(o.setRotation,o,0,0,0);renderPanel(app);};
    body.querySelector('#hdScale2').onclick=function(){var cur=currentScale(o)||{x:1,y:1,z:1};f.scale={x:cur.x*2,y:cur.y*2,z:cur.z*2};applyTransform(o,f);renderPanel(app);};
    body.querySelector('#hdScaleHalf').onclick=function(){var cur=currentScale(o)||{x:1,y:1,z:1};f.scale={x:cur.x*.5,y:cur.y*.5,z:cur.z*.5};applyTransform(o,f);renderPanel(app);};

    if (isHamster(o)) {
      body.appendChild(el('div',{className:'hdSection',text:'Hamster size'}));
      var sizeVal = Number(o.size || 0);
      var sizeInput = el('input',{type:'number',step:'0.01',value:fmt(sizeVal),id:'hdHSize'});
      body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Physics size',for:'hdHSize'}),sizeInput]));
      sizeInput.addEventListener('change',function(){o.size=Number(this.value)||o.size; if(o.physics&&o.physics.setPosition&&o.position)safeCall(o.physics.setPosition,o.physics,o.position.x,o.position.y,o.position.z);});
      body.appendChild(el('div',{className:'hdMini hdWarn',text:'Physics size affects behavior placement; the visible mesh scale above is independent and can be edited freely.'}));
      body.appendChild(el('div',{className:'hdMini hdOk',text:pouchText(o)}));
    }

    var colors = typeof o.getColors === 'function' ? safeCall(o.getColors,o) : o._colors;
    if (colors && typeof colors === 'object') {
      body.appendChild(el('div',{className:'hdSection',text:isHamster(o)?'Fur / color / pattern':'Color'}));
      Object.keys(colors).forEach(function(key){
        var c=normalizeColorValue(colors[key]);
        var input=el('input',{type:'color',value:toHex(c),id:'hdColor_'+String(key).replace(/[^A-Za-z0-9_]/g,'_')});
        input.addEventListener('input',function(){setColor(o,key,this.value);});
        body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:key,for:input.id||''}),input]));
      });
    }

    var options = typeof o.getOptions === 'function' ? safeCall(o.getOptions,o) : o._options;
    if (options && typeof options === 'object') {
      body.appendChild(el('div',{className:'hdSection',text:isHamster(o)?'Fur pattern / features':'Options'}));
      Object.keys(options).forEach(function(key){
        var opt=options[key]||{};
        if(opt.inputType==='text'){
          var t=el('input',{type:'text',value:opt.value==null?'':opt.value,id:'hdOpt_'+String(key).replace(/[^A-Za-z0-9_]/g,'_')});
          t.addEventListener('change',function(){if(o.setOption)safeCall(o.setOption,o,key,this.value);});
          body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:opt.labelName||key,for:t.id||''}),t]));
        } else {
          var cb=el('input',{type:'checkbox',checked:String(opt.value)==='1',id:'hdOpt_'+String(key).replace(/[^A-Za-z0-9_]/g,'_')});
          cb.addEventListener('change',function(){if(o.setOption)safeCall(o.setOption,o,key,this.checked?'1':'0');});
          body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:opt.labelName||key,for:cb.id||''}),cb]));
        }
      });
    }

    if (isBedding(o)) {
      body.appendChild(el('div',{className:'hdSection',text:'Bedding'}));
      ['padding','minHeight','maxHeight'].forEach(function(key){
        if (o[key] == null) return;
        var input=el('input',{type:'number',step:'0.01',value:fmt(o[key])});
        input.addEventListener('change',function(){o[key]=Number(this.value);if(o.forceUpdateAll)safeCall(o.forceUpdateAll,o);});
        body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:key,for:input.id||''}),input]));
      });
      body.appendChild(el('div',{className:'hdBtns'},[
        el('button',{text:'Reset bedding heights',id:'hdBedReset'}),
        el('button',{text:'Update bedding',id:'hdBedUpdate'})
      ]));
      body.querySelector('#hdBedReset').onclick=function(){if(o.resetHeights)safeCall(o.resetHeights,o,true);};
      body.querySelector('#hdBedUpdate').onclick=function(){if(o.forceUpdateAll)safeCall(o.forceUpdateAll,o);};
    }

    body.appendChild(el('div',{className:'hdSection',text:'Debug info'}));
    var props={};
    try { props = typeof o.getProps==='function' ? o.getProps() : {}; } catch(_){ props={}; }
    var ta=el('textarea',{readonly:'readonly'}); ta.value=JSON.stringify(props,null,2);
    body.appendChild(ta);
    fixPanelFormAccessibility();
  }

  function installScenePicking(app) {
    if (!app || !app.scene || app.__hamDebugPickInstalled) return;
    var canvas=app.engine && app.engine.getRenderingCanvas ? app.engine.getRenderingCanvas() : document.getElementById('mainCanvas');
    if(!canvas) return;
    canvas.addEventListener('pointerdown',function(ev){
      var panel=document.getElementById('hamDebug');
      if(panel && panel.contains(ev.target)) return;
      var rect=canvas.getBoundingClientRect();
      var x=(ev.clientX-rect.left)*(canvas.width/rect.width);
      var y=(ev.clientY-rect.top)*(canvas.height/rect.height);
      var pick;
      try { pick=app.scene.pick(x,y); } catch(_){ pick=null; }
      if(!pick||!pick.hit) return;
      var found=null;
      if(app.graphicsHelper&&app.graphicsHelper.getObjectByPickInfo) found=safeCall(app.graphicsHelper.getObjectByPickInfo,app.graphicsHelper,pick);
      if(!found && pick.pickedMesh){
        var mesh=pick.pickedMesh, loops=0;
        while(mesh&&loops++<8&&!found){found=mesh.metadata&&mesh.metadata.obj||null;mesh=mesh.parent;}
      }
      if(found){state.selected=found;renderPanel(app);}
    },true);
    app.__hamDebugPickInstalled=true;
  }

  window.HammyDebug = window.HammyDebug || {};
  window.HammyDebug.getState=function(){return state.mods;};
  window.HammyDebug.getApp=function(){var r=getRoot();return r&&r.app;};
  window.HammyDebug.applyGravity=function(strength,x,y,z){
    state.mods.gravityStrength=Math.max(0,Math.min(500,Number(strength)||0));
    state.mods.gravityX=Number(x)||0;state.mods.gravityY=Number(y)||0;state.mods.gravityZ=Number(z)||0;
    var r=getRoot(),app=r&&r.app;return applyGravityToWorld(app);
  };


  function boot() {
    var panel = buildPanel();
    panel.style.display = 'block';
    panel.addEventListener('pointerdown',function(e){e.stopPropagation();});
    try {
      var observer = new MutationObserver(function(){ ensurePanelMounted(); });
      observer.observe(document.documentElement,{childList:true,subtree:false});
    } catch (_) {}
    var initialized = false;
    function showError(e){
      console.warn('[Hammy Debug] startup/update error',e);
      var status=document.getElementById('hdStatus');
      if(status){status.textContent='error';status.title=e&&e.message?e.message:String(e);}
    }
    var timer=setInterval(function(){
      var r=getRoot();
      var app=r&&r.app;
      ensurePanelMounted();
      if(!app) return;
      try {
        if(!initialized){
          patchRestrictions();
          initialized=true;
        }
        patchInstanceState(app);
        installScenePicking(app);
        if (!state.mods.gravityInitialized) readGravityFromWorld(app);
        applyGravityToWorld(app);
        var main=document.getElementById('main');
        if(main&&main.style.visibility==='visible')panel.style.display='block';
        if(!state.__rendered){
          renderPanel(app);
          state.__rendered=true;
        }
      } catch(e){ showError(e); }
    },250);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
