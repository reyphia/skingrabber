(() => {
  if (globalThis.__skinGrab) return;

  /* ================= CODEC ================= */
  const encoder = new TextEncoder();
  const bytes = v => ArrayBuffer.isView(v) && v.BYTES_PER_ELEMENT === 1 && v.byteLength > 0 && v.byteLength <= 65535 ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
  const asBytes = v => {
    const b = bytes(v);
    if (b) return b;
    if (Array.isArray(v) && v.length > 0 && v.length <= 65535) {
      for (let i = 0; i < Math.min(20, v.length); i++) { const x = v[i]; if (!Number.isInteger(x) || x < 0 || x > 255) return null; }
      return new Uint8Array(v);
    }
    return null;
  };
  const validLook = v => { const b = asBytes(v); return Boolean(b && b.length >= 2 && [25, 26, 27].includes(b[0] >>> 2)); };
  const safeName = v => (typeof v === 'string' ? v : '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim().slice(0, 160) || 'Pony';
  const filename = v => 'skingrab-' + (safeName(v).replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 72) || 'Pony') + '.ptc';
  const b64 = v => btoa(Array.from(v, b => String.fromCharCode(b)).join(''));

  function toy(v) {
    if (Number.isInteger(v) && v >= 0 && v <= 65535) return v;
    const d = asBytes(v);
    return d ? new Uint8Array(d) : undefined;
  }
  function readToy(pony) {
    const extra = Array.isArray(pony?.options) ? pony.options.find(x => x?.type === 0) : pony?.options;
    if (extra?.type === 0) return toy(extra.toy);
    if (pony?.options?.toy !== undefined) return toy(pony.options.toy);
    return undefined;
  }
  function plain(data, encrypted, key) {
    const raw = asBytes(data);
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
    const look = asBytes(snapshot?.look);
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

  /* ================= ORIGINALS ================= */
  const origArrayPush = Array.prototype.push;
  const origArrayUnshift = Array.prototype.unshift;
  const origMapSet = Map.prototype.set;

  /* ================= ANGULAR ================= */
  let restore, timer;
  const providers = new Set();
  const looksLikeLView = v =>
    Array.isArray(v) && v.length >= 20 &&
    v[1] && typeof v[1] === 'object' &&
    typeof v[1].type === 'number' &&
    (Array.isArray(v[1].blueprint) || Array.isArray(v[1].data));

  function release() { clearTimeout(timer); restore?.(); restore = undefined; }
  const own = (v, k) => v && typeof v === 'object' ? Object.getOwnPropertyDescriptor(v, k)?.value : undefined;

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
    return [...out];
  }

  /* ================= STATE ================= */
  let looks = new Map(), components = new WeakMap();
  let game, mapGame, map, mapId, mapInstance, connection;
  let format, formatURL = '', loadingFormat = false, nextFormatAttempt = 0;
  let nextScan = 0, mapGeneration = 0;
  let lastPatrol = 0, patrolHits = 0;
  let rootLView = null;
  const eventsHooked = new WeakSet();
  const selections = new WeakMap();

  function entityID(v) { return v?.j ?? v?.U ?? v?.id; }

  function syncMap() {
    if (mapGame === game && map === game?.map && mapId === game?.map?.mapId && mapInstance === game?.map?.mapInstance && connection === game?.R) return;
    mapGame = game; map = game?.map; mapId = game?.map?.mapId; mapInstance = game?.map?.mapInstance; connection = game?.R;
    looks = new Map(); components = new WeakMap();
    nextScan = 0; mapGeneration++;
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

  function decodeLookObj(obj) {
    if (!obj || typeof obj !== 'object') return null;
    let ra; try { ra = obj.Ra; } catch {}
    if (!ra && format) try { ra = obj[format.field]; } catch {}
    const b = asBytes(ra);
    if (!b) return null;
    const encrypted = obj.Pc === true || (format && obj[format.encrypted] === true);
    return validLook(b) && !encrypted ? new Uint8Array(b) : plain(b, encrypted, format.key);
  }

  function storePonyLook(pony, value) {
    const id = entityID(pony);
    if (id === undefined || id === null) return false;
    Reflect.apply(origMapSet, looks, [String(id), { id, value }]);
    return true;
  }

  /* ================= CORE: look resolution via yb.Xi ================= */
  function resolveLookForPony(pony) {
    if (!format || !pony) return null;
    const id = entityID(pony);
    const yb = game?.yb;
    if (!yb?.Xi) return null;
    const Xi = yb.Xi;
    const size = Xi.length;
    if (!size) return null;

    const candidates = [];

    for (let i = 0; i < size; i++) {
      const entry = Xi[i];
      if (!entry) continue;
      const zh = entry.Zh;
      if (!zh) continue;
      const list = Array.isArray(zh) ? zh : Object.values(zh);
      for (const pair of list) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const meta = pair[0];
        const lookObj = pair[1];
        if (!lookObj || typeof lookObj !== 'object') continue;
        const dec = decodeLookObj(lookObj);
        if (!dec) continue;

        let score = 0;
        if (meta === pony) score = 100;
        else if (meta === id) score = 50;
        else if (meta && typeof meta === 'object') {
          if (meta.pony === pony) score = 100;
          else if (meta.j === id || meta.U === id || meta.id === id) score = 50;
          else if (meta.J === pony.J) score = 30;
          else if (meta.B === pony.B) score = 20;
        } else if (meta === pony.J) score = 30;
        else if (meta === pony.B) score = 20;

        candidates.push({ dec, score, slot: i, meta });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    if (best.score >= 20) { storePonyLook(pony, best.dec); return best.dec; }
    if (candidates.length === 1) { storePonyLook(pony, best.dec); return best.dec; }

    // Если несколько без совпадения — берём самый длинный как наиболее вероятный
    candidates.sort((a, b) => b.dec.length - a.dec.length);
    if (candidates.length >= 1) {
      storePonyLook(pony, candidates[0].dec);
      return candidates[0].dec;
    }
    return null;
  }

  /* ================= EVENTS ================= */
  function tryCaptureFromArg(a) {
    if (!a || typeof a !== 'object') return;
    try {
      if (a.pony && a.look && typeof a.look === 'object') {
        const dec = decodeLookObj(a.look);
        if (dec) storePonyLook(a.pony, dec);
      }
    } catch {}
  }

  Array.prototype.push = function(...args) {
    if (format && args.length) for (let i = 0; i < args.length; i++) tryCaptureFromArg(args[i]);
    return Reflect.apply(origArrayPush, this, args);
  };
  Array.prototype.unshift = function(...args) {
    if (format && args.length) for (let i = 0; i < args.length; i++) tryCaptureFromArg(args[i]);
    return Reflect.apply(origArrayUnshift, this, args);
  };
  Map.prototype.set = function(k, v) {
    try {
      if (format && v && typeof v === 'object') tryCaptureFromArg(v);
      if (v && typeof v === 'object' && Object.hasOwn(v, 'factory') && Object.hasOwn(v, 'value') && Object.hasOwn(v, 'multi') && (typeof k === 'function' || k?.ngMetadataName === 'InjectionToken')) providers.add(this);
    } catch {}
    return Reflect.apply(origMapSet, this, [k, v]);
  };
  restore = () => {
    Array.prototype.push = origArrayPush;
    Array.prototype.unshift = origArrayUnshift;
    Map.prototype.set = origMapSet;
  };
  timer = setTimeout(release, 120000);

  function hookEvents() {
    if (!game?.events) return 0;
    let count = 0;
    for (const k of Object.keys(game.events)) {
      const ev = game.events[k];
      if (!ev || typeof ev !== 'object' || eventsHooked.has(ev) || typeof ev.subscribe !== 'function') continue;
      eventsHooked.add(ev);
      try {
        ev.subscribe((...args) => { for (let i = 0; i < args.length; i++) tryCaptureFromArg(args[i]); });
        count++;
      } catch {}
    }
    return count;
  }

  /* ================= MAP ================= */
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

  /* ================= LVIEW ================= */
  function findRootLView() {
    if (!game) return null;
    const paths = [
      () => game.bc?.changeDetector?.ta,
      () => game.bc?.changeDetector?._lView,
      () => game.bc?._lView,
      () => game._a?.changeDetector?.ta,
    ];
    for (const get of paths) {
      try { const v = get(); if (looksLikeLView(v)) return v; } catch {}
    }
    return null;
  }
  function walkLViewTree(root, element) {
    if (!looksLikeLView(root)) return null;
    const seen = new Set([root]);
    const queue = [root];
    let processed = 0;
    while (queue.length && processed < 20000) {
      const lv = queue.shift();
      processed++;
      if (lv[1]?.type === 1 && lv[0] === element) return lv[8] || null;
      for (let i = 0; i < lv.length; i++) {
        const c = lv[i];
        if (!Array.isArray(c) || seen.has(c)) continue;
        seen.add(c);
        if (looksLikeLView(c)) queue.push(c);
        else for (const x of c) if (looksLikeLView(x) && !seen.has(x)) { seen.add(x); queue.push(x); }
      }
    }
    return null;
  }
  function resolveComponent(element) {
    if (!element) return null;
    if (!rootLView) rootLView = findRootLView();
    if (rootLView) {
      const comp = walkLViewTree(rootLView, element);
      if (comp) return comp;
    }
    const ng = window.ng;
    if (ng?.getComponent) { try { const c = ng.getComponent(element); if (c) return c; } catch {} }
    return null;
  }

  function findPonyByName(name) {
    if (!name || !game) return null;
    if (game.C && (game.C.B === name || game.C.name === name)) return game.C;
    for (const region of regions(game.map)) {
      if (!Array.isArray(region.entities)) continue;
      const found = region.entities.find(v => v && (v.B === name || v.name === name));
      if (found) return found;
    }
    return null;
  }

  function componentOf(box) {
    const cached = components.get(box);
    if (cached) return cached;
    const direct = resolveComponent(box);
    if (direct?.pony) { components.set(box, direct); return direct; }
    return null;
  }

  function scan() { if (Date.now() < nextScan) return; nextScan = Date.now() + 250; }

  function selection(boxId, full) {
    syncMap();
    const box = document.querySelector(`[data-skingrab-box="${boxId}"]`);
    if (!box || !box.getClientRects().length) return { ready: false, reason: 'no-box' };
    if (game?.R?.isConnected !== true) return { ready: false, reason: 'no-game' };

    let selected = null, comp = null;
    comp = componentOf(box);
    if (comp?.pony) selected = comp.pony;
    else {
      const name = box.querySelector('.pony-box-name-text')?.textContent?.trim();
      if (name) selected = findPonyByName(name);
    }
    if (!selected) return { ready: false, reason: 'no-pony', hasComp: !!comp };

    const id = entityID(selected);
    if (!(typeof id === 'number' && Number.isSafeInteger(id) || typeof id === 'string' && id.length < 80)) {
      return { ready: false, reason: 'bad-id', id: String(id) };
    }

    const sel = selections.get(selected);
    if (sel !== undefined && sel !== mapGeneration) return { ready: false, reason: 'stale-map' };
    selections.set(selected, mapGeneration);

    scan();

    let look = null;
    const cached = looks.get(String(id));
    if (cached?.id === id) look = cached.value;

    if (!look) look = resolveLookForPony(selected);
    if (look) patrolHits++;

    if (!look) {
      return {
        ready: false,
        reason: format ? 'no-look' : 'no-format',
        id: String(id),
        cachedLooks: looks.size,
        lastPatrolCount: 0,
        patrolHits,
      };
    }

    const name = safeName(box.querySelector('.pony-box-name-text')?.textContent || selected.B || selected.name);
    return { ready: true, id: String(id), name, ...(full ? { look: new Uint8Array(look), toy: readToy(selected) } : {}) };
  }

  /* ================= UI ================= */
  let btn, grabbing = false, timer2, stopped = false, lastBox = null;
  const POS_KEY = 'skingrab:btn-pos';

  document.addEventListener('pointerdown', e => {
    const box = e.target?.closest?.('pony-box, .pony-box');
    if (box) lastBox = box;
  }, true);

  function scanBoxes() {
    for (const t of document.querySelectorAll('pony-box [title="Player options"], .pony-box [title="Player options"]')) {
      const box = t.closest('pony-box') || t.closest('.pony-box');
      if (!box) continue;
      box.dataset.skingrabBox ||= crypto.randomUUID();
    }
  }

  function findTargetBox() {
    const open = [...document.querySelectorAll('[data-skingrab-box]')].filter(b => {
      if (!b.getClientRects().length) return false;
      for (const dd of b.querySelectorAll('.dropdown')) {
        if (dd.classList.contains('show') || dd.classList.contains('open')) return true;
        if (dd.querySelector('[aria-expanded="true"]')) return true;
      }
      return false;
    });
    if (open.length) return open[0];
    if (lastBox && lastBox.isConnected && lastBox.dataset.skingrabBox) return lastBox;
    return [...document.querySelectorAll('[data-skingrab-box]')].find(b => b.getClientRects().length) || null;
  }

  async function grab() {
    if (grabbing) return;
    grabbing = true;
    const orig = btn.textContent;
    btn.textContent = '…';
    try {
      const box = findTargetBox();
      if (!box) { console.warn('[SkinGrab] no pony-box'); return; }
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
        setTimeout(() => { window.removeEventListener('message', h); resolve(null); }, 5000);
      });
      if (!value?.ready) { console.warn('[SkinGrab] not ready:', value); return; }
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
    try { v = selection(d.boxId, true); } catch (err) { v = { ready: false, reason: 'exception', error: String(err?.message || err) }; }
    window.postMessage({ type: 'skingrab:read-result', requestId: d.requestId, value: v }, location.origin);
  }

  function tick() {
    if (stopped) return;
    try {
      if (!format) readFormat();
      if (!game) {
        const list = roots();
        const found = list.find(v => v?.map && v?.playerCamera?.camera);
        if (found) { game = found; rootLView = findRootLView(); syncMap(); }
      }
      if (game) {
        if (!rootLView) rootLView = findRootLView();
        hookEvents();
        scan();
      }
      scanBoxes();
    } catch {}
    timer2 = setTimeout(tick, 300);
  }

  function loadPos() {
    try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p; } catch {}
    return null;
  }
  function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} }
  function placeBtn(x, y) {
    const w = btn.offsetWidth || 80, h = btn.offsetHeight || 36;
    const maxX = Math.max(8, innerWidth - w - 8), maxY = Math.max(8, innerHeight - h - 8);
    btn.style.left = Math.max(8, Math.min(maxX, x)) + 'px';
    btn.style.top = Math.max(8, Math.min(maxY, y)) + 'px';
  }

  function buildUI() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⬇ skin';
    Object.assign(btn.style, {
      position: 'fixed', left: '0px', top: '0px', zIndex: '2147483647',
      padding: '10px 14px', background: '#e2b714', color: '#111418',
      border: 'none', borderRadius: '8px', fontWeight: '700',
      fontFamily: 'system-ui, sans-serif', fontSize: '13px',
      cursor: 'grab', boxShadow: '0 6px 16px rgba(0,0,0,.4)',
      userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
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
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      placeBtn(drag.ox + dx, drag.oy + dy);
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) { suppress = true; const r = btn.getBoundingClientRect(); savePos({ x: r.left, y: r.top }); }
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
    addEventListener('resize', () => { const r = btn.getBoundingClientRect(); placeBtn(r.left, r.top); });
  }

  window.addEventListener('message', receive);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildUI(); tick(); }, { once: true });
  } else {
    buildUI(); tick();
  }

  globalThis.__skinGrab = {
    stop() {
      stopped = true; clearTimeout(timer2); clearTimeout(timer); restore?.();
      window.removeEventListener('message', receive);
    },
    debug() {
      return {
        hasGame: !!game, gameRConnected: game?.R?.isConnected,
        hasFormat: !!format, formatURL, rootLView: !!rootLView,
        providers: providers.size, boxes: document.querySelectorAll('[data-skingrab-box]').length,
        cachedLooks: looks.size, lookIds: [...looks.keys()].slice(0, 20),
        patrolHits,
      };
    },
    resolve() {
      const box = [...document.querySelectorAll('[data-skingrab-box]')].find(b => b.getClientRects().length);
      const comp = box ? componentOf(box) : null;
      const pony = comp?.pony;
      const r = pony ? resolveLookForPony(pony) : null;
      return {
        ponyId: pony ? entityID(pony) : null,
        resolved: r ? { len: r.length, first: r[0] } : null,
      };
    },
    probe() {
      if (!game) return { error: 'no game' };
      const box = [...document.querySelectorAll('[data-skingrab-box]')].find(b => b.getClientRects().length);
      const comp = box ? resolveComponent(box) : null;
      const pony = comp?.pony;
      const id = pony ? entityID(pony) : null;
      const yb = game.yb;
      const slots = [];
      if (yb?.Xi) {
        for (let i = 0; i < yb.Xi.length; i++) {
          const entry = yb.Xi[i];
          if (!entry?.Zh) continue;
          const zh = entry.Zh;
          const list = Array.isArray(zh) ? zh : Object.values(zh);
          const pairs = list.slice(0, 5).map(pair => {
            if (!Array.isArray(pair)) return { bad: true };
            const meta = pair[0];
            return {
              metaType: typeof meta,
              metaIsPony: meta === pony,
              metaValue: typeof meta === 'number' || typeof meta === 'string' ? meta : null,
              metaKeys: meta && typeof meta === 'object' ? Object.getOwnPropertyNames(meta).slice(0, 8) : null,
              metaId: meta && typeof meta === 'object' ? (meta.j ?? meta.U ?? meta.id) : null,
              metaJ: meta && typeof meta === 'object' ? meta.J : null,
              metaB: meta && typeof meta === 'object' ? meta.B : null,
              lookLen: asBytes(pair[1]?.Ra)?.length,
              pc: pair[1]?.Pc,
            };
          });
          slots.push({ slot: i, entryKeys: Object.getOwnPropertyNames(entry).slice(0, 8), zhLen: list.length, pairs });
        }
      }
      return {
        ponyId: id,
        ponyJ: pony?.J,
        ponyB: pony?.B,
        xiSlots: slots,
        resolved: pony ? (() => { const r = resolveLookForPony(pony); return r ? { len: r.length, first: r[0] } : null; })() : null,
      };
    },
  };
})();