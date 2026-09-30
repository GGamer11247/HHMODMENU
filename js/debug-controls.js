/* Hammy Home local debugging controls.
 * Loaded before the app's window.onload handler so it can patch restrictions
 * before the scene starts, then exposes a live editor once the app is ready.
 */
(function () {
  'use strict';

  var root = window.z0;
  var MAX_DEBUG_OBJECTS = 1000000;
  var DEFAULT_BUFFER_CAPACITY = 256;
  var state = { selected: null, open: true };

  function z(name) {
    if (!root) return null;
    if (root[name]) return root[name];
    if (root.z2 && root.z2[name]) return root.z2[name];
    return null;
  }

  function getPool() {
    return root && root.z2 && root.z2.Helpers ? root.z2.Helpers.ObjectPool : null;
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
      forEachCtor(root, function (ctor) {
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

    // Lift camera translation and zoom limits.
    if (z('z3') && z('z3').prototype) {
      // Camera bounds are instance properties, cleared after the app exists.
      // We also remove the border-based movement gate here.
      z('z3').prototype.checkDragCamera = (function (original) {
        return function () {
          var gh = this;
          try {
            gh.moveCameraBorder = 0;
            gh.camBoundsMin = null;
            gh.camBoundsMax = null;
          } catch (_) {}
          return original ? original.apply(this, arguments) : undefined;
        };
      })(z('z3').prototype.checkDragCamera);
    }

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
    '#hamDebug button{background:#2b2f38;color:#fff;border:1px solid #525866;border-radius:5px;padding:4px 7px;cursor:pointer}',
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
    head.appendChild(el('div',{className:'hdTitle',text:'Hammy Debug Controls'}));
    var status = el('span',{className:'hdBadge',id:'hdStatus',text:'waiting'}); head.appendChild(status);
    var collapse = el('button',{title:'Toggle panel',text:'×'}); head.appendChild(collapse);
    panel.appendChild(head);
    var body = el('div',{className:'hdBody',id:'hdBody'}); panel.appendChild(body);
    document.body.appendChild(panel);
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

  function renderPanel(app) {
    var panel = buildPanel(), body = document.getElementById('hdBody'), status = document.getElementById('hdStatus');
    if (!body || !app) return;
    status.textContent = state.selected ? 'selected' : 'ready';
    body.innerHTML = '';

    var objs = getObjects(app);
    var select = el('select',{id:'hdSelect'});
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
        el('button',{text:'Unlock camera',id:'hdUnlockCam'}),
        el('button',{text:'Center camera',id:'hdCenterCam'}),
        el('button',{text:'Refresh list',id:'hdRefresh'})
      ]));
      body.appendChild(el('div',{className:'hdMini hdOk',text:'Restrictions bypassed: object counts, placement validation, grid snapping, camera bounds and zoom limits.'}));
      body.querySelector('#hdUnlockCam').onclick=function(){patchInstanceState(app);};
      body.querySelector('#hdCenterCam').onclick=function(){
        var c=app.scene && app.scene.activeCamera; if(c){c.position.x=0;c.position.y=0;c.position.z=-30;}
      };
      body.querySelector('#hdRefresh').onclick=function(){renderPanel(app);};
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
      var input=el('input',{type:'number',step:'0.01',value:fmt(value)}); inputs[key]=input;
      return el('div',{className:'hdRow'},[el('label',{text:title}),input,el('span',{className:'hdMini',text:key.toUpperCase()}),el('span',{className:'hdMini',text:''})]);
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
      body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:'Physics size'}),sizeInput]));
      sizeInput.addEventListener('change',function(){o.size=Number(this.value)||o.size; if(o.physics&&o.physics.setPosition&&o.position)safeCall(o.physics.setPosition,o.physics,o.position.x,o.position.y,o.position.z);});
      body.appendChild(el('div',{className:'hdMini hdWarn',text:'Physics size affects behavior placement; the visible mesh scale above is independent and can be edited freely.'}));
    }

    var colors = typeof o.getColors === 'function' ? safeCall(o.getColors,o) : o._colors;
    if (colors && typeof colors === 'object') {
      body.appendChild(el('div',{className:'hdSection',text:isHamster(o)?'Fur / color / pattern':'Color'}));
      Object.keys(colors).forEach(function(key){
        var c=normalizeColorValue(colors[key]);
        var input=el('input',{type:'color',value:toHex(c)});
        input.addEventListener('input',function(){setColor(o,key,this.value);});
        body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:key}),input]));
      });
    }

    var options = typeof o.getOptions === 'function' ? safeCall(o.getOptions,o) : o._options;
    if (options && typeof options === 'object') {
      body.appendChild(el('div',{className:'hdSection',text:isHamster(o)?'Fur pattern / features':'Options'}));
      Object.keys(options).forEach(function(key){
        var opt=options[key]||{};
        if(opt.inputType==='text'){
          var t=el('input',{type:'text',value:opt.value==null?'':opt.value});
          t.addEventListener('change',function(){if(o.setOption)safeCall(o.setOption,o,key,this.value);});
          body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:opt.labelName||key}),t]));
        } else {
          var cb=el('input',{type:'checkbox',checked:String(opt.value)==='1'});
          cb.addEventListener('change',function(){if(o.setOption)safeCall(o.setOption,o,key,this.checked?'1':'0');});
          body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:opt.labelName||key}),cb]));
        }
      });
    }

    if (isBedding(o)) {
      body.appendChild(el('div',{className:'hdSection',text:'Bedding'}));
      ['padding','minHeight','maxHeight'].forEach(function(key){
        if (o[key] == null) return;
        var input=el('input',{type:'number',step:'0.01',value:fmt(o[key])});
        input.addEventListener('change',function(){o[key]=Number(this.value);if(o.forceUpdateAll)safeCall(o.forceUpdateAll,o);});
        body.appendChild(el('div',{className:'hdRow1'},[el('label',{text:key}),input]));
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

  function setupKeyboard(app){
    if(window.__hamDebugKeys) return; window.__hamDebugKeys=true;
    document.addEventListener('keydown',function(ev){
      var panel=document.getElementById('hamDebug');
      if(ev.key==='F8'){ev.preventDefault();if(panel)panel.style.display=panel.style.display==='none'?'block':'none';return;}
      if(!state.selected) return;
      var tag=(document.activeElement&&document.activeElement.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
      var o=state.selected,p=o.position||{x:0,y:0,z:0},step=0.2;
      if(ev.shiftKey) step=1;
      if(ev.key==='ArrowLeft') {safeCall(o.setPosition,o,p.x-step,p.y,p.z);ev.preventDefault();}
      else if(ev.key==='ArrowRight'){safeCall(o.setPosition,o,p.x+step,p.y,p.z);ev.preventDefault();}
      else if(ev.key==='ArrowUp'){safeCall(o.setPosition,o,p.x,p.y,p.z-step);ev.preventDefault();}
      else if(ev.key==='ArrowDown'){safeCall(o.setPosition,o,p.x,p.y,p.z+step);ev.preventDefault();}
      else if(ev.key==='PageUp'){safeCall(o.setPosition,o,p.x,p.y+step,p.z);ev.preventDefault();}
      else if(ev.key==='PageDown'){safeCall(o.setPosition,o,p.x,p.y-step,p.z);ev.preventDefault();}
      else if(ev.key==='['||ev.key===']'){
        var sc=currentScale(o)||{x:1,y:1,z:1}, mul=ev.key==='['?.9:1.1;
        if(o.setScale&&!isHamster(o))safeCall(o.setScale,o,sc.x*mul,sc.y*mul,sc.z*mul);
        if(currentScale(o)){currentScale(o).x*=mul;currentScale(o).y*=mul;currentScale(o).z*=mul;} ev.preventDefault();
      }
      else if(ev.key.toLowerCase()==='r'){
        var r=o.rotation||{x:0,y:0,z:0};safeCall(o.setRotation,o,r.x,r.y+5*Math.PI/180,r.z);ev.preventDefault();
      }
    });
  }

  function boot() {
    patchRestrictions();
    var panel=buildPanel();
    panel.style.display='none';
    panel.addEventListener('pointerdown',function(e){e.stopPropagation();});
    var timer=setInterval(function(){
      var app=root && root.app;
      if(!app) return;
      patchInstanceState(app);
      var main = document.getElementById('main');
      if (main && main.style.visibility === 'visible') panel.style.display = 'block';
      installScenePicking(app);
      setupKeyboard(app);
      if(!state.__rendered || state.selected===null){renderPanel(app);state.__rendered=true;}
      if(main && main.style.visibility==='visible') { clearInterval(timer); }
    },250);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
