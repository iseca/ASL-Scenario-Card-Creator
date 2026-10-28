/* ---------- VASL board layouts ----------
   Reads the user's VASL "boards" folder (each board is a zip archive), keeps each board's image in this
   browser, and lets the user lay boards out (move, rotate, reverse, snap), shade parts that are out of play,
   then draws the result into the card's board-configuration box. */
const BOARDS = (() => {
  const idbKeyIndex = "boards_index", imgKey = (k) => "board_img:" + k;
  let index = null;                                  /* [{ key, name, file, w, h, cols, rows, version, thumb }] */
  const imgCache = new Map();                        /* key -> HTMLImageElement */

  async function getIndex() { if (!index) index = (await idb.get(idbKeyIndex)) || []; return index; }

  /* ---- reading the folder ---- */
  const attr = (tag, a) => { const m = tag.match(new RegExp("\\b" + a + "\\s*=\\s*\"([^\"]*)\"", "i")); return m ? m[1].trim() : ""; };
  async function openArchive(file) {
    let z = await JSZip.loadAsync(file);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    /* some downloads wrap the board archive in another zip */
    if (names.length === 1 && !/\.(gif|png|jpe?g|xml|txt)$/i.test(names[0])) {
      try { z = await JSZip.loadAsync(await z.file(names[0]).async("blob")); } catch (_) {}
    }
    return z;
  }
  const dims = (blob) => new Promise((res) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight, im }); }; im.onerror = () => res(null); im.src = u; });
  async function thumbOf(im, maxW = 260, png = false) {
    const s = Math.min(1, maxW / im.naturalWidth), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.8);
  }
  /* a download can bundle several board archives (e.g. FBboards.zip holds the four Festung Budapest boards) */
  async function readBoards(file) {
    const z = await JSZip.loadAsync(file);
    const inner = Object.keys(z.files).filter(n => !z.files[n].dir && /(^|\/)bd[^/.]+$/i.test(n));
    const hasImg = Object.keys(z.files).some(n => /(^|\/)bd[^/]*\.(gif|png|jpe?g)$/i.test(n));
    if (inner.length && !hasImg) {
      const out = [];
      for (const n of inner) {
        try { const blob = await z.file(n).async("blob"); const f = new File([blob], n.split("/").pop()); const b = await readBoard(f, await JSZip.loadAsync(blob)); if (b) out.push(b); } catch (_) {}
      }
      return out;
    }
    const b = await readBoard(file); return b ? [b] : [];
  }
  async function readBoard(file, zz) {
    const z = zz || await openArchive(file);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    const mdName = names.find(n => /^BoardMetadata(\.xml)?$/i.test(n.split("/").pop()));
    const md = mdName ? await z.file(mdName).async("string") : "";
    const tag = (md.match(/<boardMetadata[\s\S]*?>/i) || [""])[0];
    const base = file.name.replace(/\.zip$/i, "").replace(/^ap_/i, "");
    let name = attr(tag, "name") || base.replace(/^bd/i, "");
    if (/^0+\d+$/.test(name)) name = String(+name);            /* "01" → "1", as players say it */
    let imgName = attr(tag, "boardImageFileName");
    if (!imgName || !z.file(imgName)) {
      const want = ("bd" + name).toLowerCase();
      imgName = names.find(n => /\.(gif|png|jpe?g)$/i.test(n) && n.toLowerCase().replace(/\.(gif|png|jpe?g)$/, "") === want)
        || names.find(n => /^bd[^/]*\.(gif|png|jpe?g)$/i.test(n)) || "";
    }
    if (!imgName) return null;
    const blob = await z.file(imgName).async("blob");
    const typed = new Blob([blob], { type: /\.png$/i.test(imgName) ? "image/png" : /\.jpe?g$/i.test(imgName) ? "image/jpeg" : "image/gif" });
    const d = await dims(typed); if (!d) return null;
    const cols = +attr(tag, "width") || 33, rows = +attr(tag, "height") || 10;
    const ap = /^ap_/i.test(file.name);
    const thumb = await thumbOf(d.im); URL.revokeObjectURL(d.im.src);
    return { name, label: ap ? name + " (Action Pack)" : name, file: file.name, w: d.w, h: d.h, cols, rows, version: attr(tag, "version"), blob: typed, thumb };
  }
  /* ---- overlays: each archive (ovrX, ovrW …) holds several overlays, one picture per orientation a–f,
     and a "data" file giving each overlay's reference hex for each orientation ---- */
  const OVL_RX = /^ovr([a-z]*\d+)([a-f])?\.(gif|png)$/i;
  async function readOverlaySet(z, setName, out) {
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    const inner = names.filter(n => /(^|\/)ovr[^/.]+$/i.test(n));
    if (inner.length && !names.some(n => OVL_RX.test(n.split("/").pop()))) {
      for (const n of inner) { try { await readOverlaySet(await JSZip.loadAsync(await z.file(n).async("blob")), n.split("/").pop(), out); } catch (_) {} }
      return;
    }
    const dataF = names.find(n => n.split("/").pop() === "data");
    const anch = {};
    if (dataF) for (const line of (await z.file(dataF).async("string")).split(/\r?\n/)) {
      const t = line.trim().split(/\s+/); if (t.length < 2 || !t[1].includes(";")) continue;
      anch[t[0].toLowerCase()] = t[1].split(";").map(x => x.trim().toLowerCase());
    }
    for (const n of names) {
      const m = n.split("/").pop().match(OVL_RX); if (!m) continue;
      const id = m[1].toLowerCase(), ori = (m[2] || "a").toLowerCase();
      const o = out.get(id) || { key: id, name: id.toUpperCase(), set: setName, files: {} };
      o.files[ori] = n; o.z = z; if (anch[id]) o.anch = anch[id];
      out.set(id, o);
    }
  }
  async function storeOverlays(found) {
    const list = [];
    for (const o of found.values()) {
      const blobs = {}, oris = {};
      for (const [ori, n] of Object.entries(o.files)) {
        const raw = await o.z.file(n).async("blob");
        const b = new Blob([raw], { type: /\.png$/i.test(n) ? "image/png" : "image/gif" });
        const d = await dims(b); if (!d) continue;
        blobs[ori] = b; oris[ori] = { w: d.w, h: d.h };
        if (ori === "a" || !o.thumb) o.thumb = await thumbOf(d.im, 120, true);   /* PNG keeps the see-through parts */
        URL.revokeObjectURL(d.im.src);
      }
      if (!Object.keys(blobs).length) continue;
      await idb.set(ovlKey(o.key), blobs);
      list.push({ key: o.key, name: o.name, set: o.set, oris, anch: o.anch || null, thumb: o.thumb });
    }
    list.sort((a, b) => natCmp(a.name, b.name));
    ovlIndex = list; ovlCache.clear(); ovlNow.clear();
    await idb.set("ovl_index", list);
    return list.length;
  }
  /* files: the folder's File list. onProgress(done, total). Returns the number of boards kept. */
  async function loadFolder(files, onProgress) {
    const all = [...files].filter(f => !/^\./.test(f.name) && !/\.(txt|md|pdf|xml|json|html?)$/i.test(f.name));
    const isOvl = (f) => /(^|\/)overlays\//i.test(f.webkitRelativePath || "") || /^ovr/i.test(f.name) || /overlays/i.test(f.name);
    const ovlFiles = all.filter(isOvl);
    const list = all.filter(f => !isOvl(f) && (f.webkitRelativePath || f.name).split("/").length <= 2);
    const total = list.length + ovlFiles.length;
    const out = new Map(); let done = 0;
    for (const f of list) {
      try {
        for (const b of await readBoards(f)) {
          const key = b.label.toLowerCase();
          const prev = out.get(key);
          /* the same board twice (e.g. "bd1b" and "bd1b.zip"): keep the newer version */
          if (!prev || (parseFloat(b.version) || 0) > (parseFloat(prev.version) || 0)) {
            await idb.set(imgKey(key), b.blob);                 /* store the picture now; keep only the details in memory */
            out.set(key, { key, name: b.name, label: b.label, file: b.file, w: b.w, h: b.h, cols: b.cols, rows: b.rows, version: b.version, thumb: b.thumb });
          }
        }
      } catch (_) { /* not a board archive */ }
      onProgress?.(++done, total);
    }
    /* overlays: bundles first, so a loose archive of the same overlay wins */
    const found = new Map();
    for (const f of ovlFiles.sort((a, b) => (/\.zip$/i.test(b.name)) - (/\.zip$/i.test(a.name)))) {
      try { await readOverlaySet(await JSZip.loadAsync(f), f.name, found); } catch (_) {}
      onProgress?.(++done, total);
    }
    if (found.size) await storeOverlays(found);
    const next = [...out.values()];
    next.sort((a, b) => natCmp(a.label, b.label));
    index = next; imgCache.clear();
    await idb.set(idbKeyIndex, next);
    return next.length;
  }
  const natCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  /* a full-size picture for the editor, as an object URL */
  const urlCache = new Map();
  async function url(key) {
    if (urlCache.has(key)) return urlCache.get(key);
    const p = idb.get(imgKey(key)).then(b => b ? URL.createObjectURL(b) : null); urlCache.set(key, p); return p;
  }
  const urlNow = new Map();
  function urlSync(key) { if (urlNow.has(key)) return urlNow.get(key); url(key).then(u => { if (u && !urlNow.has(key)) { urlNow.set(key, u); if (!$("blDlg").hidden) blDraw(); } }); return null; }
  async function image(key) {
    if (imgCache.has(key)) return imgCache.get(key);
    const p = (async () => { const blob = await idb.get(imgKey(key)); if (!blob) return null; const d = await dims(blob); return d && d.im; })();
    imgCache.set(key, p); return p;
  }
  /* ---- overlay pictures ----
     VASL overlay pictures follow the board's hex convention: column "a" is centred on the picture's left edge,
     so (0, 32.25) is always a hex centre — that point is what snaps to the board's hexes.
     An orientation without its own picture is drawn by turning picture "a" in 60° steps. */
  let ovlIndex = null; const ovlCache = new Map(), ovlNow = new Map(), ovlKey = (k) => "ovl_img:" + k;
  async function getOverlays() { if (!ovlIndex) ovlIndex = (await idb.get("ovl_index")) || []; return ovlIndex; }
  const ORI = "abcdef";
  const hexCentre = (code) => {
    const m = /^([a-z]+)(\d+)$/.exec(code || ""); if (!m) return null;
    const i = m[1].length === 1 ? m[1].charCodeAt(0) - 97 : 26 + m[1].charCodeAt(0) - 97, r = +m[2];
    return [i * 56.25, (i % 2 ? 64.5 : 32.25) + (r - 1) * 64.5];
  };
  async function overlay(key, ori) {
    const ck = key + ":" + ori; if (ovlCache.has(ck)) return ovlCache.get(ck);
    const p = (async () => {
      const meta = (await getOverlays()).find(o => o.key === key); if (!meta) return null;
      const blobs = await idb.get(ovlKey(key)); if (!blobs) return null;
      const k = ORI.indexOf(ori);
      const ref = (o) => { const c = meta.anch && hexCentre(meta.anch[ORI.indexOf(o)]); return c || null; };
      if (blobs[ori]) {
        const d = await dims(blobs[ori]); if (!d) return null;
        const r = ref(ori) || [d.w / 2, d.h / 2];
        return { im: d.im, src: d.im.src, w: d.w, h: d.h, snap: [0, 32.25], ref: r };
      }
      const baseOri = blobs.a ? "a" : Object.keys(blobs)[0], d = await dims(blobs[baseOri]); if (!d) return null;
      const th = (k - ORI.indexOf(baseOri)) * Math.PI / 3, cs = Math.cos(th), sn = Math.sin(th);
      const W = Math.ceil(Math.abs(d.w * cs) + Math.abs(d.h * sn)), H = Math.ceil(Math.abs(d.w * sn) + Math.abs(d.h * cs));
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.translate(W / 2, H / 2); g.rotate(th); g.drawImage(d.im, -d.w / 2, -d.h / 2);
      const map = ([x, y]) => { const dx = x - d.w / 2, dy = y - d.h / 2; return [dx * cs - dy * sn + W / 2, dx * sn + dy * cs + H / 2]; };
      const src = c.toDataURL("image/png");
      return { im: c, src, w: W, h: H, snap: map([0, 32.25]), ref: map(ref(baseOri) || [d.w / 2, d.h / 2]) };
    })();
    p.then(o => { if (o) ovlNow.set(ck, o); });
    ovlCache.set(ck, p); return p;
  }
  function overlaySync(key, ori) {
    const ck = key + ":" + ori; if (ovlNow.has(ck)) return ovlNow.get(ck);
    overlay(key, ori).then(o => { if (o && !ovlNow.has(ck)) { ovlNow.set(ck, o); if (!$("blDlg").hidden) blDraw(); } });
    return null;
  }
  return { getIndex, loadFolder, image, natCmp, urlSync, getOverlays, overlay, overlaySync, ORI };
})();

/* ---------- the board layout editor ---------- */
const BL = { target: null, layout: null, sel: null, scale: 1, drag: null, q: "", tab: "boards" };
const blBox = (b, info) => { const r = (b.rot || 0) % 180 !== 0; return { w: r ? info.h : info.w, h: r ? info.w : info.h }; };
const blInfo = (key) => (BOARDS._idx || []).find(x => x.key === key);
const blOvlMeta = (key) => (BOARDS._ovl || []).find(x => x.key === key);
const blUid = () => "b" + Math.random().toString(36).slice(2, 9);
function layoutPathFor(imgPath) { return imgPath === "board" ? "boardLayout" : imgPath.replace(/\.img$/, ".layout"); }
async function openBoards(imgPath) {
  BL.target = imgPath;
  const saved = get(layoutPathFor(imgPath));
  BL.layout = saved && Array.isArray(saved.boards) ? JSON.parse(JSON.stringify(saved)) : { boards: [], shades: [], labels: true };
  BL.layout.overlays = BL.layout.overlays || [];
  BL.layout.boards.forEach(b => { if (!b.id) b.id = blUid(); });
  BL.sel = null; BL.note = false;
  BOARDS._idx = await BOARDS.getIndex(); BOARDS._ovl = await BOARDS.getOverlays();
  $("blDlg").hidden = false; document.body.classList.add("blopen");
  blDrawList(); blDraw();
}
function blClose() { $("blDlg").hidden = true; document.body.classList.remove("blopen"); }
function blDrawList() {
  const idx = BOARDS._idx || [], ovl = BOARDS._ovl || [];
  $("blCount").textContent = idx.length ? `${idx.length} boards, ${ovl.length} overlays` : "";
  $("blEmpty").hidden = !!idx.length; $("blListW").hidden = !idx.length;
  $("blTabB").setAttribute("aria-pressed", String(BL.tab === "boards")); $("blTabO").setAttribute("aria-pressed", String(BL.tab === "overlays"));
  $("blQ").placeholder = BL.tab === "boards" ? "Search boards, e.g. 24 or RB" : "Search overlays, e.g. X11 or W";
  const q = BL.q.trim().toLowerCase();
  if (BL.tab === "boards") {
    $("blList").className = "bllist";
    const list = idx.filter(b => !q || (b.label + " " + b.file).toLowerCase().includes(q));
    $("blList").innerHTML = list.map(b => `<button type="button" class="bltile" draggable="true" data-key="${esc(b.key)}" title="Add board ${esc(b.label)} (${b.cols}×${b.rows} hexes)"><img src="${b.thumb}" alt="" loading="lazy" draggable="false"><span>${esc(b.label)}</span></button>`).join("") || `<p class="palmsg">No boards match.</p>`;
  } else {
    $("blList").className = "bllist ovl";
    const list = ovl.filter(o => !q || (o.name + " " + o.set).toLowerCase().includes(q));
    $("blList").innerHTML = list.map(o => `<button type="button" class="bltile" draggable="true" data-ovl="${esc(o.key)}" title="Add overlay ${esc(o.name)} to the selected board"><img src="${o.thumb}" alt="" loading="lazy" draggable="false"><span>${esc(o.name)}</span></button>`).join("")
      || `<p class="palmsg">${ovl.length ? "No overlays match." : "No overlays were found. Load the boards folder again; its overlays folder is read too."}</p>`;
  }
}
/* place a new board to the right of the others, lined up with the top of the layout */
function blAdd(key, at) {
  const info = blInfo(key); if (!info) return;
  const L = BL.layout, b = { id: blUid(), key, name: info.label, x: 0, y: 0, rot: 0 };
  if (at) { b.x = at.x - info.w / 2; b.y = at.y - info.h / 2; }
  else if (L.boards.length) { const ext = blExtent(); b.x = ext.x1; b.y = ext.y0; }
  L.boards.push(b); BL.sel = { t: "b", i: L.boards.length - 1 };
  if (at) blSnap(BL.sel.i);
  blDraw();
}
function blExtent() {
  const L = BL.layout; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of L.boards) { const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + bx.w); y1 = Math.max(y1, b.y + bx.h); }
  for (const s of L.shades) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1800, y1: 645 };
  return { x0, y0, x1, y1 };
}
/* snap a board's edges to the edges of the other boards when they are close */
function blSnap(i) {
  const L = BL.layout, b = L.boards[i], info = blInfo(b.key); if (!info) return;
  const me = blBox(b, info), tol = 60;
  let bestX = null, bestY = null;
  L.boards.forEach((o, j) => {
    if (j === i) return; const oi = blInfo(o.key); if (!oi) return; const ob = blBox(o, oi);
    for (const cx of [o.x, o.x + ob.w - me.w, o.x + ob.w, o.x - me.w]) { const d = Math.abs(cx - b.x); if (d < tol && (!bestX || d < bestX.d)) bestX = { v: cx, d }; }
    for (const cy of [o.y, o.y + ob.h - me.h, o.y + ob.h, o.y - me.h]) { const d = Math.abs(cy - b.y); if (d < tol && (!bestY || d < bestY.d)) bestY = { v: cy, d }; }
  });
  if (bestX) b.x = bestX.v; if (bestY) b.y = bestY.v;
}
/* a board's hex size (standard boards: columns 56.25 px apart, hexes 64.5 px tall) */
function blHexSize(info) {
  let hw = info.w / Math.max(1, info.cols - 1), hh = info.h / Math.max(1, info.rows);
  if (Math.abs(hw - 56.25) > 6) hw = 56.25; if (Math.abs(hh - 64.5) > 7) hh = 64.5;
  return { hw, hh };
}
/* shaded areas snap to half hexes of the board underneath */
function blHexAt(x, y) {
  const L = BL.layout;
  for (const b of L.boards) { const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); if (x >= b.x - 1 && x <= b.x + bx.w + 1 && y >= b.y - 1 && y <= b.y + bx.h + 1) {
    const { hw, hh } = blHexSize(info); const r = (b.rot || 0) % 180 !== 0;
    return { ox: b.x, oy: b.y, sx: (r ? hh : hw) / 2, sy: (r ? hw : hh) / 2 };
  } }
  return { ox: 0, oy: 0, sx: 28.125, sy: 32.25 };
}
const blSnapTo = (v, o, s) => o + Math.round((v - o) / s) * s;
/* board-local (unturned) ⇄ layout coordinates */
function blToBoard(b, info, p) {
  const bx = blBox(b, info), a = -(b.rot || 0) * Math.PI / 180, dx = p.x - (b.x + bx.w / 2), dy = p.y - (b.y + bx.h / 2);
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + info.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + info.h / 2 };
}
function blFromBoard(b, info, p) {
  const bx = blBox(b, info), a = (b.rot || 0) * Math.PI / 180, dx = p.x - info.w / 2, dy = p.y - info.h / 2;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + b.x + bx.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + b.y + bx.h / 2 };
}
function blBoardAt(p) {
  const L = BL.layout;
  for (let i = L.boards.length - 1; i >= 0; i--) { const b = L.boards[i], info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); if (p.x >= b.x && p.x <= b.x + bx.w && p.y >= b.y && p.y <= b.y + bx.h) return b; }
  return null;
}
/* hex name on a board, e.g. "G4" (columns A–Z, then AA, BB … GG) */
function blHexName(info, p) {
  const { hw, hh } = blHexSize(info), n = Math.round(p.x / hw);
  const row = n % 2 ? Math.round(p.y / hh) : Math.round((p.y - hh / 2) / hh) + 1;
  const col = n < 0 ? "?" : n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(65 + n - 26).repeat(2);
  return col + Math.max(0, row);
}
/* move an overlay so its snap hex sits exactly on one of the board's hexes */
async function blSnapOverlay(o) {
  const b = BL.layout.boards.find(x => x.id === o.bid), info = b && blInfo(b.key), im = await BOARDS.overlay(o.key, o.ori); if (!info || !im) return;
  const { hw, hh } = blHexSize(info), px = o.x + im.snap[0], py = o.y + im.snap[1];
  const n = Math.round(px / hw), base = n % 2 ? 0 : hh / 2, k = Math.round((py - base) / hh);
  o.x = n * hw - im.snap[0]; o.y = base + k * hh - im.snap[1];
}
async function blAddOverlay(key, at) {
  const L = BL.layout; if (!L.boards.length) { toast("Add a board first, then put overlays on it."); return; }
  let b = at ? blBoardAt(at) : null;
  if (!b && BL.sel?.t === "b") b = L.boards[BL.sel.i];
  if (!b && BL.sel?.t === "o") b = L.boards.find(x => x.id === L.overlays[BL.sel.i].bid);
  b = b || L.boards[0];
  const info = blInfo(b.key), im = await BOARDS.overlay(key, "a"); if (!info || !im) { toast("That overlay's picture couldn't be read."); return; }
  const c = at ? blToBoard(b, info, at) : { x: info.w / 2, y: info.h / 2 };
  const o = { key, name: blOvlMeta(key)?.name || key.toUpperCase(), ori: "a", bid: b.id, x: c.x - im.w / 2, y: c.y - im.h / 2 };
  await blSnapOverlay(o); L.overlays.push(o); BL.sel = { t: "o", i: L.overlays.length - 1 }; blDraw();
}
/* turn an overlay in 60° steps about the hex it is snapped to */
async function blTurnOverlay(steps) {
  const o = BL.layout.overlays[BL.sel.i], before = await BOARDS.overlay(o.key, o.ori); if (!before) return;
  const cx = o.x + before.snap[0], cy = o.y + before.snap[1];
  o.ori = BOARDS.ORI[(BOARDS.ORI.indexOf(o.ori) + steps + 6) % 6];
  const after = await BOARDS.overlay(o.key, o.ori); if (!after) return;
  o.x = cx - after.snap[0]; o.y = cy - after.snap[1]; blDraw();
}
function blFit() {
  const ws = $("blWs"), ext = blExtent(), pad = 40;
  const W = Math.max(1, ext.x1 - ext.x0 + pad * 2), H = Math.max(1, ext.y1 - ext.y0 + pad * 2);
  BL.scale = Math.min((ws.clientWidth - 8) / W, (ws.clientHeight - 8) / H, 0.6);
  BL.ox = ext.x0 - pad; BL.oy = ext.y0 - pad;
}
/* where a board's number goes: the corner nearest the board's own printed ID
   (lower-left on an unturned geomorphic board), following the board as it is rotated or reversed */
function blLabelSpot(b, info) {
  const bx = blBox(b, info), ins = Math.min(info.w, info.h) * 0.025;
  const vx = -info.w / 2 + ins, vy = info.h / 2 - ins, a = (b.rot || 0) * Math.PI / 180;
  const rx = vx * Math.cos(a) - vy * Math.sin(a), ry = vx * Math.sin(a) + vy * Math.cos(a);
  return { x: b.x + bx.w / 2 + rx, y: b.y + bx.h / 2 + ry, ax: rx < 0 ? 0 : 1, ay: ry < 0 ? 0 : 1, short: Math.min(bx.w, bx.h) };
}
/* "X11 on 24G4 (b)": the overlay's reference hex (from VASL's data) on its board */
function blOvlWhere(o) {
  const b = BL.layout.boards.find(x => x.id === o.bid), info = b && blInfo(b.key), im = BOARDS.overlaySync(o.key, o.ori);
  if (!info || !im) return o.name;
  return `${o.name} on ${b.name}${blHexName(info, { x: o.x + im.ref[0], y: o.y + im.ref[1] })} (${o.ori})`;
}
function blUsed() {
  const L = BL.layout;
  const bds = L.boards.map(b => b.name + (b.rot === 180 ? " (reversed)" : b.rot === 90 || b.rot === 270 ? " (turned)" : "")).join(", ");
  return bds + (L.overlays?.length ? "; overlays " + L.overlays.map(blOvlWhere).join(", ") : "");
}
async function blDraw() {
  blFit();
  const L = BL.layout, s = BL.scale, X = (v) => (v - BL.ox) * s, Y = (v) => (v - BL.oy) * s;
  const parts = [], mid = [], top = [];
  L.boards.forEach((b, i) => {
    const info = blInfo(b.key);
    if (!info) { parts.push(`<div class="blb missing" data-i="${i}" style="left:${X(b.x)}px;top:${Y(b.y)}px;width:${1800 * s}px;height:${645 * s}px">Board ${esc(b.name)} isn't loaded</div>`); return; }
    const bx = blBox(b, info), sel = BL.sel?.t === "b" && BL.sel.i === i;
    const ovl = L.overlays.map((o, j) => [o, j]).filter(([o]) => o.bid === b.id).map(([o, j]) => {
      const im = BOARDS.overlaySync(o.key, o.ori); if (!im) return null;
      const osel = BL.sel?.t === "o" && BL.sel.i === j;
      return [`<img class="blo${osel ? " sel" : ""}" data-o="${j}" src="${im.src}" alt="" draggable="false" style="left:${o.x * s}px;top:${o.y * s}px;width:${im.w * s}px;height:${im.h * s}px">`,
        `<span class="blot${osel ? " sel" : ""}" data-o="${j}" style="left:${(o.x + im.ref[0]) * s}px;top:${(o.y + im.ref[1] - 30) * s}px;transform:translate(-50%,-50%) rotate(${-(b.rot || 0)}deg)">${esc(o.name)}</span>`];
    }).filter(Boolean);
    if (ovl.length) {
      /* layers: board, then its overlays, then red shading on top; the ID tags float above everything so they stay readable and clickable */
      const imgs = ovl.map(x => x[0]).join(""), tags = ovl.map(x => x[1]).join("");
      const box = (cls, html) => `<div class="${cls}" style="left:${X(b.x)}px;top:${Y(b.y)}px;width:${bx.w * s}px;height:${bx.h * s}px"><div class="blin" style="width:${info.w * s}px;height:${info.h * s}px;transform:translate(-50%,-50%) rotate(${b.rot || 0}deg)">${html}</div></div>`;
      mid.push(box("blovl", imgs)); top.push(box("blovl tags", tags));
    }
    parts.push(`<div class="blb${sel ? " sel" : ""}" data-i="${i}" style="left:${X(b.x)}px;top:${Y(b.y)}px;width:${bx.w * s}px;height:${bx.h * s}px">
      <div class="blin" style="width:${info.w * s}px;height:${info.h * s}px;transform:translate(-50%,-50%) rotate(${b.rot || 0}deg)"><img class="bimg" src="${BOARDS.urlSync(b.key) || info.thumb}" alt="" draggable="false"></div>
      ${L.labels ? (() => { const p = blLabelSpot(b, info); return `<span class="bll" style="left:${(p.x - b.x) * s}px;top:${(p.y - b.y) * s}px;transform:translate(${-p.ax * 100}%,${-p.ay * 100}%)">${esc(b.name)}</span>`; })() : ""}</div>`);
  });
  parts.push(...mid);
  L.shades.forEach((r, i) => {
    const sel = BL.sel?.t === "s" && BL.sel.i === i;
    parts.push(`<div class="bls${sel ? " sel" : ""}" data-s="${i}" style="left:${X(r.x)}px;top:${Y(r.y)}px;width:${r.w * s}px;height:${r.h * s}px"><span class="blh" data-h="${i}"></span></div>`);
  });
  $("blWsIn").innerHTML = (parts.join("") + top.join("")) || `<p class="palmsg">Click a board on the left to start the layout. Boards snap together when their edges meet.</p>`;
  $("blUsed").textContent = L.boards.length ? "In use: boards " + blUsed() : "No boards yet.";
  const t = BL.sel?.t;
  $("blRot").disabled = $("blRev").disabled = !(t === "b" || t === "o"); $("blDel").disabled = !BL.sel;
  $("blRot").textContent = t === "o" ? "Turn 60°" : "Rotate 90°";
  $("blRot").title = t === "o" ? "Turn the selected overlay one hexside (R)" : "Turn the selected board a quarter turn (R)";
  $("blNote").hidden = BL.target !== "board"; $("blNote").disabled = !L.boards.length;
  $("blLabels").checked = !!L.labels;
}
/* pointer handling in the workspace: drag boards, overlays and shaded areas; resize shaded areas */
function blToLayout(e) { const r = $("blWsIn").getBoundingClientRect(); return { x: (e.clientX - r.left) / BL.scale + BL.ox, y: (e.clientY - r.top) / BL.scale + BL.oy }; }
function blPointerDown(e) {
  const h = e.target.closest(".blh"), sh = e.target.closest(".bls"), ov = e.target.closest(".blo, .blot"), bd = e.target.closest(".blb");
  const p = blToLayout(e), L = BL.layout;
  if (h) { const i = +h.dataset.h; BL.sel = { t: "s", i }; BL.drag = { t: "resize", i, p }; }
  else if (sh) { const i = +sh.dataset.s, r = L.shades[i]; BL.sel = { t: "s", i }; BL.drag = { t: "s", i, dx: p.x - r.x, dy: p.y - r.y }; }
  else if (ov) {
    const j = +ov.dataset.o, o = L.overlays[j], b = L.boards.find(x => x.id === o.bid), info = b && blInfo(b.key); if (!info) return;
    const lp = blToBoard(b, info, p); BL.sel = { t: "o", i: j }; BL.drag = { t: "o", i: j, dx: lp.x - o.x, dy: lp.y - o.y, b, info };
  }
  else if (bd) { const i = +bd.dataset.i, b = L.boards[i]; BL.sel = { t: "b", i }; BL.drag = { t: "b", i, dx: p.x - b.x, dy: p.y - b.y }; }
  else { BL.sel = null; BL.drag = null; blDraw(); return; }
  BL.drag.moved = false; BL.drag.scale = BL.scale; BL.drag.ox = BL.ox; BL.drag.oy = BL.oy;
  $("blWsIn").setPointerCapture?.(e.pointerId);
  e.preventDefault(); blDraw();
}
function blPointerMove(e) {
  const d = BL.drag; if (!d) return;
  /* keep the view still while dragging */
  BL.scale = d.scale; BL.ox = d.ox; BL.oy = d.oy;
  const r = $("blWsIn").getBoundingClientRect(), p = { x: (e.clientX - r.left) / d.scale + d.ox, y: (e.clientY - r.top) / d.scale + d.oy };
  const L = BL.layout; d.moved = true;
  if (d.t === "o") {
    const o = L.overlays[d.i], lp = blToBoard(d.b, d.info, p); o.x = lp.x - d.dx; o.y = lp.y - d.dy;
    const ws = $("blWsIn"), im = ws.querySelector(`.blo[data-o="${d.i}"]`), tag = ws.querySelector(`.blot[data-o="${d.i}"]`), info = BOARDS.overlaySync(o.key, o.ori);
    if (im) { im.style.left = o.x * d.scale + "px"; im.style.top = o.y * d.scale + "px"; }
    if (tag && info) { tag.style.left = (o.x + info.ref[0]) * d.scale + "px"; tag.style.top = (o.y + info.ref[1] - 30) * d.scale + "px"; }
    return;
  }
  if (d.t === "b") { const b = L.boards[d.i]; b.x = p.x - d.dx; b.y = p.y - d.dy; }
  if (d.t === "s") { const s = L.shades[d.i]; s.x = p.x - d.dx; s.y = p.y - d.dy; }
  if (d.t === "resize") { const s = L.shades[d.i]; s.w = Math.max(20, p.x - s.x); s.h = Math.max(20, p.y - s.y); }
  const el = d.t === "b" ? $("blWsIn").querySelector(`.blb[data-i="${d.i}"]`) : $("blWsIn").querySelector(`.bls[data-s="${d.i}"]`);
  const o = d.t === "b" ? L.boards[d.i] : L.shades[d.i];
  if (el) { el.style.left = (o.x - d.ox) * d.scale + "px"; el.style.top = (o.y - d.oy) * d.scale + "px"; if (d.t === "resize") { el.style.width = o.w * d.scale + "px"; el.style.height = o.h * d.scale + "px"; } }
}
async function blPointerUp() {
  const d = BL.drag; BL.drag = null; if (!d) return;
  const L = BL.layout;
  if (d.t === "b") blSnap(d.i);
  if (d.t === "o") {
    /* an overlay dragged onto another board moves to that board */
    const o = L.overlays[d.i], im = await BOARDS.overlay(o.key, o.ori);
    if (im) {
      const at = blFromBoard(d.b, d.info, { x: o.x + im.snap[0], y: o.y + im.snap[1] }), nb = blBoardAt(at);
      if (nb && nb.id !== o.bid) { const ni = blInfo(nb.key), lp = blToBoard(nb, ni, at); o.bid = nb.id; o.x = lp.x - im.snap[0]; o.y = lp.y - im.snap[1]; }
      await blSnapOverlay(o);
    }
  }
  if (d.t === "s" || d.t === "resize") {
    const s = L.shades[d.i], g = blHexAt(s.x + 1, s.y + 1);
    const x1 = blSnapTo(s.x + s.w, g.ox, g.sx), y1 = blSnapTo(s.y + s.h, g.oy, g.sy);
    s.x = blSnapTo(s.x, g.ox, g.sx); s.y = blSnapTo(s.y, g.oy, g.sy); s.w = Math.max(g.sx, x1 - s.x); s.h = Math.max(g.sy, y1 - s.y);
  }
  blDraw();
}
function blTag(g, text, x, y, fs, ax = 0.5, ay = 0.5, alpha = 0.85) {
  g.font = `700 ${fs}px Barlow, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const bw = g.measureText(text).width + fs * 0.6, bh = fs * 1.24, x0 = x - ax * bw, y0 = y - ay * bh;
  g.fillStyle = `rgba(255,255,255,${alpha})`; g.fillRect(x0, y0, bw, bh);
  g.fillStyle = "#111"; g.fillText(text, x0 + bw / 2, y0 + bh / 2 + fs * 0.04);
}
/* draw the finished layout into an image for the card */
async function blRender(maxSide = 1600) {
  const L = BL.layout; if (!L.boards.length) return null;
  const ext = blExtent(), W = ext.x1 - ext.x0, H = ext.y1 - ext.y0, s = Math.min(1, maxSide / Math.max(W, H));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
  for (const b of L.boards) {
    const info = blInfo(b.key), im = info && await BOARDS.image(b.key); if (!im) continue;
    const bx = blBox(b, info), cx = (b.x - ext.x0 + bx.w / 2) * s, cy = (b.y - ext.y0 + bx.h / 2) * s;
    g.save(); g.translate(cx, cy); g.rotate((b.rot || 0) * Math.PI / 180); g.drawImage(im, -info.w * s / 2, -info.h * s / 2, info.w * s, info.h * s); g.restore();
  }
  /* overlays sit on the boards, under the red shading; drawn in their board's own frame so they turn with it */
  for (const b of L.boards) {
    const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info);
    for (const o of L.overlays.filter(o => o.bid === b.id)) {
      const oi = await BOARDS.overlay(o.key, o.ori); if (!oi) continue;
      g.save(); g.translate((b.x - ext.x0 + bx.w / 2) * s, (b.y - ext.y0 + bx.h / 2) * s); g.rotate((b.rot || 0) * Math.PI / 180);
      g.drawImage(oi.im, (o.x - info.w / 2) * s, (o.y - info.h / 2) * s, oi.w * s, oi.h * s); g.restore();
    }
  }
  /* shading only darkens the boards, never the empty space around them */
  g.save(); g.beginPath();
  for (const b of L.boards) { const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); g.rect((b.x - ext.x0) * s, (b.y - ext.y0) * s, bx.w * s, bx.h * s); }
  g.clip(); g.fillStyle = "rgba(205,25,25,.38)";
  for (const r of L.shades) g.fillRect((r.x - ext.x0) * s, (r.y - ext.y0) * s, r.w * s, r.h * s);
  g.restore();
  if (L.labels) {
    for (const b of L.boards) {
      const info = blInfo(b.key); if (!info) continue;
      const p = blLabelSpot(b, info), fs = Math.max(12, Math.round(p.short * s * 0.13));
      blTag(g, b.name, (p.x - ext.x0) * s, (p.y - ext.y0) * s, fs, p.ax, p.ay);
      for (const o of L.overlays.filter(o => o.bid === b.id)) {
        const oi = await BOARDS.overlay(o.key, o.ori); if (!oi) continue;
        /* on the top edge of the overlay's reference hex, so the tag doesn't hide a one-hex overlay */
        const q = blFromBoard(b, info, { x: o.x + oi.ref[0], y: o.y + oi.ref[1] - 30 });
        blTag(g, o.name, (q.x - ext.x0) * s, (q.y - ext.y0) * s, Math.max(9, Math.round(fs * 0.5)), 0.5, 0.5, 0.72);
      }
    }
  }
  /* WebP keeps the see-through corners of odd-shaped layouts at a fraction of PNG's size (PNG where WebP isn't available) */
  const w = c.toDataURL("image/webp", 0.92);
  return /^data:image\/webp/.test(w) ? w : c.toDataURL("image/png");
}
async function blDone() {
  const t = BL.target; if (!t) return blClose();
  if (!BL.layout.boards.length) { set(t, null); set(layoutPathFor(t), null); blClose(); render(); queueSave(); return; }
  /* make sure every overlay picture is ready so the board list can name its hexes */
  for (const o of BL.layout.overlays) await BOARDS.overlay(o.key, o.ori);
  const url = await blRender();
  if (!url) { toast("The board pictures couldn't be drawn. Try loading the boards folder again."); return; }
  set(t, url); set(layoutPathFor(t), JSON.parse(JSON.stringify(BL.layout)));
  if (BL.note && t === "board") state.boardNote = esc("Boards " + blUsed());
  blClose(); render(); queueSave(); toast("Board layout placed: " + blUsed() + ".");
}
