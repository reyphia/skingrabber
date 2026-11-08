(() => {
  if (globalThis.__skinGrab) return;

  /* ================= CODEC (.ptc) ================= */
  const encoder = new TextEncoder();
  const bytes = v => ArrayBuffer.isView(v) && v.BYTES_PER_ELEMENT === 1 && v.byteLength > 0 && v.byteLength <= 65535 ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
  const validLook = v => Boolean(bytes(v) && v.length >= 2 && [25, 26, 27].includes(v[0] >>> 2));
  const safeName = v => (typeof v === 'string' ? v : '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim().slice(0, 160) || 'Pony';
  const filename = v => 'copy-town-' + (safeName(v).replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 72) || 'Pony') + '.ptc';
  const b64 = v => btoa(Array.from(v, b => String.fromCharCode(b)).join(''));

  function toy(v) {
    if (Number.isInteger(v) && v >= 0 && v <= 65535) return v;
    const d = bytes(v);
    return d ? new Uint8Array(d) : undefined;
  }
  function readToy(pony) {
    const extra = Array.isArray(pony?.options) ? pony.options.find(x => x?.type === 0) : pony?.options;
    return extra?.type === 0 ? toy(extra.toy) : undefined;
  }
  function plain(data, encrypted, key) {
    const raw = bytes(data);
    if (!raw) return null;
    if (!encrypted && validLook(raw)) return new Uint8Array(raw);
    if (!Number.isInteger(key) || key < 1 || key > 0xffffffff) return null;
    const r = raw.map((b, i) => b ^ (key >>> ((i % 4) * 8) & 255));
    return validLook(r) ? r : null;
  }
  function spec(code) {
    if (typeof code !== 'string' || code.length > 12000000) return null;
    const getter = /function\s+[\w$]+\s*\(\s*([\w$]+)\s*\)\s*\{\s*return\s+\1\.([\w$]+)\s*&&\s*\(\s*([\w$]+)\s*\(\s*\1\.([\w$]+)\s*\)\s*,\s*\1\.\2\s*=\s*!1\s*\)\s*,\s*\1\.\4\s*\}/.exec(code);
    if (!getter) return null;
    const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decrypt = new RegExp('function\\s+' + esc(getter[3]) + '\\s*\\(\\s*[\\w$]+\\s*\\)\\s*\\{\\s*return\\s+[\\w$]+\\s*\\(\\s*[\\w$]+\\s*,\\s*([\\w$]+)\\s*\\)\\s*\\}').exec(code);
    if (!decrypt) return null;
    const token = decrypt[1];
    const literal = /^(0x[0-9a-fA-F]+|\d+)$/.test(token) ? token : new RegExp('[,;\\s{]' + esc(token) + '\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)').exec(code)?.[1];
    const key = literal ? Number(literal) : 0;
    return Number.isInteger(key) && key > 0 && key <= 0xffffffff ? { field: getter[4], encrypted: getter[2], key } : null;
  }
  function encode(snapshot) {
    const look = bytes(snapshot?.look);
    if (!validLook(look)) throw new Error('skin-data');
    const extra = toy(snapshot.toy), out = [];
    const u8 = v => out.push(v & 255);
    const u16 = v => { u8(v); u8(v >>> 8); };
    const u32 = v => { u16(v); u16(v >>> 16); };
    const raw = v => { for (const b of v) u8(b); };
    const length = v => { v++; while (v >= 128) { u8(v & 127 | 128); v >>>= 7; } u8(v); };
    const data = v => { length(v.length); raw(v); };
    u32(2786829884); u8(4); u8(look[0] >>> 2); length(1);
    u8(typeof extra === 'number' ? 16 : 0); data(encoder.encode(safeName(snapshot.name))); data(look);
    if (typeof extra === 'number') u16(extra);
    else if (extra) {
      const trailer = encoder.encode(JSON.stringify({ schema: 'copy-town-toys', version: 1, characters: [{ index: 0, toy: { kind: 'custom', codec: 'pony-town-plush', lookVersion: extra[0] >>> 2, lookBase64: b64(extra) } }] }));
      raw(encoder.encode('CTTOY001')); u32(trailer.length); raw(trailer);
    }
    return b64(Uint8Array.from(out));
  }

  /* ================= RUNTIME (Angular internals) ================= */
  let views, restore, timer;
  const providers = new Set();
  const isView = (v, id) => Array.isArray(v) && v.length >= 20 && v[19] === id && Number.isSafeInteger(id) && id >= 0 && [0, 1, 2].includes(v[1]?.type) && Array.isArray(v[1]?.blueprint) && Array.isArray(v[1]?.data);
  function release() { clearTimeout(timer); restore?.(); restore = undefined; }
  function hook() {
    if (views || restore) return;
    const desc = Object.getOwnPropertyDescriptor(Map.prototype, 'set');
    if (!desc?.configurable || typeof desc.value !== 'function') return;
    const orig = desc.value;
    function set(k, v) {
      const r = Reflect.apply(orig, this, [k, v]);
      try {
        if (restore && !views && isView(v, k)) {
          views = this; release(); document.removeEventListener('DOMContentLoaded', hook);
        } else if (restore && providers.size < 64 && v && typeof v === 'object' && Object.hasOwn(v, 'factory') && Object.hasOwn(v, 'value') && Object.hasOwn(v, 'multi') && (typeof k === 'function' || k?.ngMetadataName === 'InjectionToken')) {
          providers.add(this);
        }
      } catch {}
      return r;
    }
    restore = () => { if (Map.prototype.set === set) Object.defineProperty(Map.prototype, 'set', desc); };
    Object.defineProperty(Map.prototype, 'set', { ...desc, value: set });
    timer = setTimeout(release, 30000);
  }
  const own = (v, k) => v && typeof v === 'object' ? Object.getOwnPropertyDescriptor(v, k)?.value : undefined;
  const isApp = v => typeof v?.tick === 'function' && (Array.isArray(own(v, '_views')) || typeof v.attachView === 'function' && typeof v.detachView === 'function');
  function appViews(app) {
    const out = [];
    for (const d of Object.values(Object.getOwnPropertyDescriptors(app))) {
      const refs = d.value;
      if (!Array.isArray(refs) || refs.length > 1000) continue;
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
        for (const f of Object.values(Object.getOwnPropertyDescriptors(ref))) {
          const view = f.value;
          if (Array.isArray(view) && isView(view, view[19])) out.push(view);
        }
      }
    }
    return out;
  }
  function roots() {
    const out = new Set(), injectors = [], seen = new Set();
    const add = v => { if (v && typeof v === 'object' && !Array.isArray(v)) out.add(v); };
    for (const records of providers) {
      for (const r of records.values()) {
        const v = own(r, 'value');
        add(v);
        if (own(v, 'records') instanceof Map) injectors.push(v);
      }
    }
    for (const t of globalThis.getAllAngularTestabilities?.() || []) injectors.push(own(t, '_destroyRef'));
    const host = document.querySelector('pony-town-app, [ng-version]');
    const view = views?.get(host?.__ngContext__);
    if (view && isView(view, view[19])) {
      const ctx = view[8];
      add(ctx); add(own(ctx, 'game')); add(own(ctx, 'model'));
      injectors.push(view[9]);
    }
    for (let i = 0; i < injectors.length && i < 32; i++) {
      const inj = injectors[i];
      if (!inj || seen.has(inj)) continue;
      seen.add(inj);
      const records = own(inj, 'records');
      if (records instanceof Map) for (const r of records.values()) add(own(r, 'value'));
      for (const k of ['parent', 'parentInjector', 'injector']) {
        const p = own(inj, k);
        if (p && !seen.has(p)) injectors.push(p);
      }
    }
    const values = [...out];
    if (restore && values.some(v => v.map && v.playerCamera?.camera) && values.some(isApp)) {
      release(); document.removeEventListener('DOMContentLoaded', hook);
    }
    return values;
  }
  function component(element) {
    const id = element?.__ngContext__;
    const view = views?.get(id);
    if (!element) return null;
    const queue = isView(view, id) ? [view] : [];
    for (const app of roots()) if (isApp(app)) queue.push(...appViews(app));
    const seen = new Set();
    for (let i = 0; i < queue.length && i < 5000; i++) {
      const cur = queue[i];
      if (!Array.isArray(cur) || seen.has(cur)) continue;
      seen.add(cur);
      if (isView(cur, cur[19]) && cur[1].type === 1 && cur[0] === element) return cur[8];
      for (const c of cur) if (Array.isArray(c) && !seen.has(c) && queue.length < 5000) queue.push(c);
    }
    return null;
  }

  /* ================= GAME MAP ================= */
  const mapFields = new WeakMap();
  const isRegion = v => v && typeof v === 'object' && Number.isSafeInteger(v.x) && Number.isSafeInteger(v.y) && ArrayBuffer.isView(v.tiles) && v.tiles.BYTES_PER_ELEMENT === 1 && v.tiles.length === 64;
  function collectRegions(v) {
    if (!Array.isArray(v) || v.length > 16384) return null;
    const out = [];
    for (const e of v) { if (e == null) continue; if (!isRegion(e)) return null; out.push(e); }
    return out.length === v.length ? v : out;
  }
  function regions(map) {
    if (!map || typeof map !== 'object') return [];
    const cached = mapFields.get(map);
    if (cached) {
      const v = Object.getOwnPropertyDescriptor(map, cached)?.value;
      const r = collectRegions(v);
      if (r?.length) return r;
      mapFields.delete(map);
    }
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(map)).slice(0, 200)) {
      const r = collectRegions(d.value);
      if (r?.length) { mapFields.set(map, k); return r; }
    }
    return [];
  }

  /* ================= BRIDGE ================= */
  let rawLooks = new WeakMap(), looks = new WeakMap(), components = new WeakMap();
  let game, mapGame, map, mapId, mapInstance, connection;
  let format, formatURL = '', loadingFormat = false, nextFormatAttempt = 0;
  let discovery, nextDiscovery = 0, nextScan = 0, mapGeneration = 0;
  const sources = new Map(), subscriptions = new Map();
  const selections = new WeakMap();

  function entityID(v) { return v?.j ?? v?.U ?? v?.id; }

  function syncMap() {
    if (mapGame === game && map === game?.map && mapId === game?.map?.mapId && mapInstance === game?.map?.mapInstance && connection === game?.R) return;
    mapGame = game; map = game?.map; mapId = game?.map?.mapId; mapInstance = game?.map?.mapInstance; connection = game?.R;
    rawLooks = new WeakMap(); looks = new WeakMap(); components = new WeakMap();
    discovery = null; nextDiscovery = 0; nextScan = 0; mapGeneration++;
  }

  async function readFormat() {
    if (loadingFormat || Date.now() < nextFormatAttempt) return;
    const url = [...document.scripts].map(s => s.src).find(v => /^https:\/\/pony\.town\/assets\/scripts\/bootstrap-[\w-]+\.js$/.test(v));
    if (!url || url === formatURL) return;
    loadingFormat = true; nextFormatAttempt = Date.now() + 15000;
    try {
      const r = await fetch(url, { credentials: 'omit', cache: 'force-cache', signal: AbortSignal.timeout(10000) });
      if (!r.ok || Number(r.headers.get('content-length')) > 12000000) return;
      const s = spec(await r.text());
      if (s) { format = s; formatURL = url; }
    } catch {} finally { loadingFormat = false; }
  }

  function capture(pony, look) {
    if (!pony || typeof pony !== 'object' || !look || typeof look !== 'object') return;
    syncMap();
    looks.delete(pony);
    if (!format) {
      const copy = {};
      for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(look)).slice(0, 60)) {
        if (bytes(d.value)) copy[k] = new Uint8Array(d.value);
        else if (typeof d.value === 'boolean') copy[k] = d.value;
      }
      rawLooks.set(pony, { id: entityID(pony), look: copy }); return;
    }
    rawLooks.delete(pony);
    const v = plain(look[format.field], look[format.encrypted] === true, format.key);
    if (v) looks.set(pony, { id: entityID(pony), value: v });
  }

  function subscribe(source, method) {
    const ctor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(source), 'constructor')?.value;
    if (typeof ctor !== 'function') return;
    const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('\\.([\\w$]+)\\.subscribe\\(\\(\\s*([\\w$]+)\\s*,\\s*([\\w$]+)\\s*\\)\\s*=>\\s*\\{?\\s*this\\.' + esc(method) + '\\(\\s*\\2\\s*,\\s*\\3\\s*\\)');
    const m = pattern.exec(Function.prototype.toString.call(ctor));
    const event = m && game.events?.[m[1]];
    if (!event || subscriptions.has(event) || typeof event.subscribe !== 'function') return;
    const un = event.subscribe((pony, look) => { try { capture(pony, look); } catch {} });
    if (typeof un === 'function') subscriptions.set(event, un);
    else if (typeof un?.unsubscribe === 'function') subscriptions.set(event, () => un.unsubscribe());
  }

  function attach(source) {
    if (source.game !== game) return;
    if (sources.has(source)) { discovery?.found.add(source); subscribe(source, sources.get(source).method); return; }
    const proto = Object.getPrototypeOf(source);
    if (!proto) return;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const orig = Object.getOwnPropertyDescriptor(proto, key)?.value;
      if (typeof orig !== 'function') continue;
      const m = Function.prototype.toString.call(orig).match(/this\.([\w$]+)\.push\(\{\s*pony\s*:\s*[\w$]+,\s*look\s*:\s*[\w$]+\s*\}\)/);
      if (!m || !Array.isArray(source[m[1]])) continue;
      const ownDesc = Object.getOwnPropertyDescriptor(source, key), invoke = ownDesc?.value || orig;
      if (typeof invoke !== 'function') continue;
      const wrapped = function(pony, look) { try { capture(pony, look); } catch {} return Reflect.apply(invoke, this, arguments); };
      Object.defineProperty(source, key, { configurable: true, writable: true, value: wrapped });
      discovery?.found.add(source);
      sources.set(source, { field: m[1], method: key, restore() { if (source[key] === wrapped) { if (ownDesc) Object.defineProperty(source, key, ownDesc); else delete source[key]; } } });
      subscribe(source, key);
      return;
    }
  }

  function discover() {
    const list = roots();
    const current = list.find(v => v?.map && v?.playerCamera?.camera);
    if (current !== game) {
      for (const v of sources.values()) v.restore();
      for (const un of subscriptions.values()) un();
      sources.clear(); subscriptions.clear(); game = current; discovery = null;
      syncMap();
    }
    if (!game) return;
    if (!discovery) {
      discovery = { queue: [[game, 0]], index: 0, seen: new WeakSet(), found: new Set() };
      for (const d of Object.values(Object.getOwnPropertyDescriptors(game))) {
        const v = d.value;
        if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Node || ArrayBuffer.isView(v)) continue;
        for (const c of Object.values(Object.getOwnPropertyDescriptors(v)).slice(0, 160)) {
          if (!Array.isArray(c.value) || c.value.length > 160) continue;
          for (const src of c.value) if (src?.game === game) { try { attach(src); } catch {} }
        }
      }
    }
    const began = performance.now();
    for (let count = 0; discovery.index < discovery.queue.length && discovery.index < 12000 && count < 300 && performance.now() - began < 3; count++) {
      const [v, depth] = discovery.queue[discovery.index++];
      if (!v || typeof v !== 'object' || discovery.seen.has(v) || v instanceof Node || ArrayBuffer.isView(v) || v instanceof ArrayBuffer || v instanceof Map || v instanceof Set) continue;
      discovery.seen.add(v);
      if (!Array.isArray(v)) { try { attach(v); } catch {} }
      if (depth >= 5 || sources.has(v)) continue;
      for (const item of Object.values(Object.getOwnPropertyDescriptors(v)).slice(0, 160)) {
        const c = item.value;
        if (c && typeof c === 'object' && discovery.queue.length < 12000) discovery.queue.push([c, depth + 1]);
      }
    }
    if (discovery.index >= discovery.queue.length || discovery.index >= 12000) {
      for (const [src, info] of sources) if (!discovery.found.has(src)) { info.restore(); sources.delete(src); }
      discovery = null; nextDiscovery = Date.now() + (sources.size ? 10000 : 1500);
    }
  }

  function scan() {
    if (Date.now() < nextScan) return;
    nextScan = Date.now() + 250;
    for (const [src, info] of sources) {
      const refs = src[info.field];
      if (Array.isArray(refs)) for (const ref of refs.slice(0, 2000)) { try { capture(ref?.pony, ref?.look); } catch {} }
    }
  }

  function componentOf(box) {
    const cached = components.get(box);
    if (cached) return cached;
    const direct = component(box) || window.ng?.getComponent?.(box);
    if (direct?.pony) { components.set(box, direct); return direct; }
    return null;
  }

  function selection(boxId, full) {
    syncMap();
    const box = document.querySelector(`[data-skingrab-box="${boxId}"]`);
    if (!box || !box.getClientRects().length || game?.R?.isConnected !== true) return { ready: false };
    const selected = componentOf(box)?.pony;
    const id = entityID(selected);
    if (!selected || !(typeof id === 'number' && Number.isSafeInteger(id) || typeof id === 'string' && id.length < 80)) return { ready: false };
    const sel = selections.get(selected);
    if (sel !== undefined && sel !== mapGeneration) return { ready: false };
    selections.set(selected, mapGeneration);
    let pony = entityID(game.C) === id ? game.C : null;
    if (!pony) {
      for (const region of regions(game.map)) {
        pony = Array.isArray(region.entities) && region.entities.find(v => entityID(v) === id);
        if (pony) break;
      }
    }
    if (!pony) return { ready: false };
    scan();
    if (format && rawLooks.has(pony)) {
      const p = rawLooks.get(pony); rawLooks.delete(pony);
      if (p.id === id) capture(pony, p.look);
    }
    const cached = looks.get(pony);
    const look = cached?.id === id ? cached.value : null;
    const name = safeName(box.querySelector('.pony-box-name-text')?.textContent || pony.B || pony.name);
    return { ready: Boolean(look), id: String(id), name, ...(full && look ? { look: new Uint8Array(look), toy: readToy(pony) } : {}) };
  }

  /* ================= UI ================= */
  let btn, grabbing = false, timer2, stopped = false;
  const POS_KEY = 'skingrab:btn-pos';

  function scanBoxes() {
    for (const t of document.querySelectorAll('pony-box [title="Player options"], .pony-box [title="Player options"]')) {
      const box = t.closest('pony-box') || t.closest('.pony-box');
      if (!box) continue;
      box.dataset.skingrabBox ||= crypto.randomUUID();
    }
  }

  function findTargetBox() {
    const all = [...document.querySelectorAll('[data-skingrab-box]')].filter(b => b.getClientRects().length && b.querySelector('[title="Player options"]'));
    for (const b of all) {
      for (const dd of b.querySelectorAll('.dropdown')) {
        if (dd.classList.contains('show') || dd.classList.contains('open')) return b;
        if (dd.querySelector('[aria-expanded="true"]')) return b;
      }
    }
    return all[0] || null;
  }

  async function grab() {
    if (grabbing) return;
    grabbing = true;
    const orig = btn.textContent;
    btn.textContent = '…';
    try {
      const box = findTargetBox();
      if (!box) return;
      const requestId = crypto.randomUUID();
      const value = await new Promise(resolve => {
        const h = e => {
          if (e.data?.type === 'skingrab:read-result' && e.data.requestId === requestId) {
            window.removeEventListener('message', h);
            resolve(e.data.value);
          }
        };
        window.addEventListener('message', h);
        window.postMessage({ type: 'skingrab:read', requestId, boxId: box.dataset.skingrabBox }, location.origin);
        setTimeout(() => { window.removeEventListener('message', h); resolve(null); }, 4000);
      });
      if (!value?.ready) return;
      const data = encode({ look: value.look, name: value.name, toy: value.toy });
      const bin = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bin], { type: 'application/octet-stream' }));
      a.download = filename(value.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } finally {
      setTimeout(() => { btn.textContent = orig; grabbing = false; }, 400);
    }
  }

  function receive(e) {
    const d = e.data;
    if (e.source !== window || e.origin !== location.origin || d?.type !== 'skingrab:read' || typeof d.requestId !== 'string' || typeof d.boxId !== 'string') return;
    let v = { ready: false };
    try { v = selection(d.boxId, true); } catch {}
    window.postMessage({ type: 'skingrab:read-result', requestId: d.requestId, value: v }, location.origin);
  }

  function tick() {
    if (stopped) return;
    try {
      if (!format) readFormat();
      syncMap();
      if (discovery || Date.now() >= nextDiscovery) discover();
      if (!document.hidden) scan();
      scanBoxes();
    } catch {}
    timer2 = setTimeout(tick, discovery || !sources.size ? 50 : 250);
  }

  function loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
    } catch {}
    return null;
  }

  function savePos(p) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
  }

  function placeBtn(x, y) {
    const w = btn.offsetWidth || 80;
    const h = btn.offsetHeight || 36;
    const maxX = Math.max(8, innerWidth - w - 8);
    const maxY = Math.max(8, innerHeight - h - 8);
    const nx = Math.max(8, Math.min(maxX, x));
    const ny = Math.max(8, Math.min(maxY, y));
    btn.style.left = nx + 'px';
    btn.style.top = ny + 'px';
    return { x: nx, y: ny };
  }

  function buildUI() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⬇ skin';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      zIndex: '2147483647',
      padding: '10px 14px',
      background: '#e2b714',
      color: '#111418',
      border: 'none',
      borderRadius: '8px',
      fontWeight: '700',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      cursor: 'grab',
      boxShadow: '0 6px 16px rgba(0,0,0,.4)',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      touchAction: 'none',
    });

    let drag = null, suppress = false;

    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = btn.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
      suppress = false;
      btn.style.cursor = 'grabbing';
      try { btn.setPointerCapture(e.pointerId); } catch {}
    });

    btn.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      placeBtn(drag.ox + dx, drag.oy + dy);
    });

    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        suppress = true;
        const r = btn.getBoundingClientRect();
        savePos({ x: r.left, y: r.top });
      }
      drag = null;
      btn.style.cursor = '';
      if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    };
    btn.addEventListener('pointerup', endDrag);
    btn.addEventListener('pointercancel', endDrag);
    btn.addEventListener('lostpointercapture', endDrag);

    btn.addEventListener('click', e => {
      if (suppress && e.detail !== 0) { suppress = false; return; }
      grab();
    });

    document.body.appendChild(btn);

    const saved = loadPos();
    if (saved) placeBtn(saved.x, saved.y);
    else placeBtn(innerWidth - btn.offsetWidth - 16, innerHeight - btn.offsetHeight - 16);

    addEventListener('resize', () => {
      const r = btn.getBoundingClientRect();
      placeBtn(r.left, r.top);
    });
  }

  window.addEventListener('message', receive);
  hook();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildUI(); tick(); }, { once: true });
  } else {
    buildUI(); tick();
  }

  globalThis.__skinGrab = { stop() { stopped = true; clearTimeout(timer2); window.removeEventListener('message', receive); } };
})();