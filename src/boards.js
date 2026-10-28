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
  async function thumbOf(im, maxW = 260) {
    const s = Math.min(1, maxW / im.naturalWidth), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
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
  /* files: the folder's File list. onProgress(done, total). Returns the number of boards kept. */
  async function loadFolder(files, onProgress) {
    const list = [...files].filter(f => {
      const rel = f.webkitRelativePath || f.name, parts = rel.split("/");
      if (parts.length > 2) return false;                       /* skip sub-folders such as overlays */
      return !/^\./.test(f.name) && !/\.(txt|md|pdf|xml|json|html?)$/i.test(f.name);
    });
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
      onProgress?.(++done, list.length);
    }
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
  return { getIndex, loadFolder, image, natCmp, urlSync };
})();

/* ---------- the board layout editor ---------- */
const BL = { target: null, layout: null, sel: null, scale: 1, drag: null, q: "" };
const blBox = (b, info) => { const r = (b.rot || 0) % 180 !== 0; return { w: r ? info.h : info.w, h: r ? info.w : info.h }; };
const blInfo = (key) => (BOARDS._idx || []).find(x => x.key === key);
function layoutPathFor(imgPath) { return imgPath === "board" ? "boardLayout" : imgPath.replace(/\.img$/, ".layout"); }
async function openBoards(imgPath) {
  BL.target = imgPath;
  const saved = get(layoutPathFor(imgPath));
  BL.layout = saved && Array.isArray(saved.boards) ? JSON.parse(JSON.stringify(saved)) : { boards: [], shades: [], labels: true };
  BL.sel = null; BL.note = false;
  BOARDS._idx = await BOARDS.getIndex();
  $("blDlg").hidden = false; document.body.classList.add("blopen");
  blDrawList(); blDraw();
}
function blClose() { $("blDlg").hidden = true; document.body.classList.remove("blopen"); }
function blDrawList() {
  const idx = BOARDS._idx || [];
  $("blCount").textContent = idx.length ? `${idx.length} boards` : "";
  $("blEmpty").hidden = !!idx.length; $("blListW").hidden = !idx.length;
  const q = BL.q.trim().toLowerCase();
  const list = idx.filter(b => !q || (b.label + " " + b.file).toLowerCase().includes(q));
  $("blList").innerHTML = list.map(b => `<button type="button" class="bltile" data-key="${esc(b.key)}" title="Add board ${esc(b.label)} (${b.cols}×${b.rows} hexes)"><img src="${b.thumb}" alt="" loading="lazy" draggable="false"><span>${esc(b.label)}</span></button>`).join("") || `<p class="palmsg">No boards match.</p>`;
}
/* place a new board to the right of the others, lined up with the top of the layout */
function blAdd(key, at) {
  const info = blInfo(key); if (!info) return;
  const L = BL.layout, b = { key, name: info.label, x: 0, y: 0, rot: 0 };
  if (at) { b.x = at.x - info.w / 2; b.y = at.y - info.h / 2; }
  else if (L.boards.length) {
    const ext = blExtent(); b.x = ext.x1; b.y = ext.y0;
  }
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
/* shaded areas snap to half hexes of the board underneath (standard boards: 56.25 × 64.5 px hexes) */
function blHexAt(x, y) {
  const L = BL.layout;
  for (const b of L.boards) { const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); if (x >= b.x - 1 && x <= b.x + bx.w + 1 && y >= b.y - 1 && y <= b.y + bx.h + 1) {
    const hw = info.w / Math.max(1, info.cols - 1), hh = info.h / Math.max(1, info.rows); const r = (b.rot || 0) % 180 !== 0;
    return { ox: b.x, oy: b.y, sx: (r ? hh : hw) / 2, sy: (r ? hw : hh) / 2 };
  } }
  return { ox: 0, oy: 0, sx: 28.125, sy: 32.25 };
}
const blSnapTo = (v, o, s) => o + Math.round((v - o) / s) * s;
function blFit() {
  const ws = $("blWs"), ext = blExtent(), pad = 40;
  const W = Math.max(1, ext.x1 - ext.x0 + pad * 2), H = Math.max(1, ext.y1 - ext.y0 + pad * 2);
  BL.scale = Math.min((ws.clientWidth - 8) / W, (ws.clientHeight - 8) / H, 0.6);
  BL.ox = ext.x0 - pad; BL.oy = ext.y0 - pad;
}
function blUsed() {
  return BL.layout.boards.map(b => b.name + (b.rot === 180 ? " (reversed)" : b.rot === 90 || b.rot === 270 ? " (turned)" : "")).join(", ");
}
async function blDraw() {
  blFit();
  const L = BL.layout, s = BL.scale, X = (v) => (v - BL.ox) * s, Y = (v) => (v - BL.oy) * s;
  const parts = [];
  L.boards.forEach((b, i) => {
    const info = blInfo(b.key);
    if (!info) { parts.push(`<div class="blb missing" data-i="${i}" style="left:${X(b.x)}px;top:${Y(b.y)}px;width:${1800 * s}px;height:${645 * s}px">Board ${esc(b.name)} isn't loaded</div>`); return; }
    const bx = blBox(b, info), sel = BL.sel?.t === "b" && BL.sel.i === i;
    parts.push(`<div class="blb${sel ? " sel" : ""}" data-i="${i}" style="left:${X(b.x)}px;top:${Y(b.y)}px;width:${bx.w * s}px;height:${bx.h * s}px">
      <img src="${BOARDS.urlSync(b.key) || info.thumb}" alt="" draggable="false" style="width:${info.w * s}px;height:${info.h * s}px;transform:translate(-50%,-50%) rotate(${b.rot || 0}deg)">
      ${L.labels ? `<span class="bll">${esc(b.name)}</span>` : ""}</div>`);
  });
  L.shades.forEach((r, i) => {
    const sel = BL.sel?.t === "s" && BL.sel.i === i;
    parts.push(`<div class="bls${sel ? " sel" : ""}" data-s="${i}" style="left:${X(r.x)}px;top:${Y(r.y)}px;width:${r.w * s}px;height:${r.h * s}px"><span class="blh" data-h="${i}"></span></div>`);
  });
  $("blWsIn").innerHTML = parts.join("") || `<p class="palmsg">Click a board on the left to start the layout. Boards snap together when their edges meet.</p>`;
  $("blUsed").textContent = L.boards.length ? "Boards in use: " + blUsed() : "No boards yet.";
  $("blRot").disabled = $("blRev").disabled = BL.sel?.t !== "b"; $("blDel").disabled = !BL.sel;
  $("blNote").hidden = BL.target !== "board"; $("blNote").disabled = !L.boards.length;
  $("blLabels").checked = !!L.labels;
}
/* pointer handling in the workspace: drag boards and shaded areas, resize shaded areas */
function blToLayout(e) { const r = $("blWsIn").getBoundingClientRect(); return { x: (e.clientX - r.left) / BL.scale + BL.ox, y: (e.clientY - r.top) / BL.scale + BL.oy }; }
function blPointerDown(e) {
  const h = e.target.closest(".blh"), sh = e.target.closest(".bls"), bd = e.target.closest(".blb");
  const p = blToLayout(e);
  if (h) { const i = +h.dataset.h; BL.sel = { t: "s", i }; BL.drag = { t: "resize", i, p }; }
  else if (sh) { const i = +sh.dataset.s, r = BL.layout.shades[i]; BL.sel = { t: "s", i }; BL.drag = { t: "s", i, dx: p.x - r.x, dy: p.y - r.y }; }
  else if (bd) { const i = +bd.dataset.i, b = BL.layout.boards[i]; BL.sel = { t: "b", i }; BL.drag = { t: "b", i, dx: p.x - b.x, dy: p.y - b.y }; }
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
  if (d.t === "b") { const b = L.boards[d.i]; b.x = p.x - d.dx; b.y = p.y - d.dy; }
  if (d.t === "s") { const s = L.shades[d.i]; s.x = p.x - d.dx; s.y = p.y - d.dy; }
  if (d.t === "resize") { const s = L.shades[d.i]; s.w = Math.max(20, p.x - s.x); s.h = Math.max(20, p.y - s.y); }
  const el = d.t === "b" ? $("blWsIn").querySelector(`.blb[data-i="${d.i}"]`) : $("blWsIn").querySelector(`.bls[data-s="${d.i}"]`);
  const o = d.t === "b" ? L.boards[d.i] : L.shades[d.i];
  if (el) { el.style.left = (o.x - d.ox) * d.scale + "px"; el.style.top = (o.y - d.oy) * d.scale + "px"; if (d.t === "resize") { el.style.width = o.w * d.scale + "px"; el.style.height = o.h * d.scale + "px"; } }
}
function blPointerUp() {
  const d = BL.drag; BL.drag = null; if (!d) return;
  const L = BL.layout;
  if (d.t === "b") blSnap(d.i);
  if (d.t === "s" || d.t === "resize") {
    const s = L.shades[d.i], g = blHexAt(s.x + 1, s.y + 1);
    const x1 = blSnapTo(s.x + s.w, g.ox, g.sx), y1 = blSnapTo(s.y + s.h, g.oy, g.sy);
    s.x = blSnapTo(s.x, g.ox, g.sx); s.y = blSnapTo(s.y, g.oy, g.sy); s.w = Math.max(g.sx, x1 - s.x); s.h = Math.max(g.sy, y1 - s.y);
  }
  blDraw();
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
  /* shading only darkens the boards, never the empty space around them */
  g.save(); g.beginPath();
  for (const b of L.boards) { const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info); g.rect((b.x - ext.x0) * s, (b.y - ext.y0) * s, bx.w * s, bx.h * s); }
  g.clip(); g.fillStyle = "rgba(40,40,40,.45)";
  for (const r of L.shades) g.fillRect((r.x - ext.x0) * s, (r.y - ext.y0) * s, r.w * s, r.h * s);
  g.restore();
  if (L.labels) {
    for (const b of L.boards) {
      const info = blInfo(b.key); if (!info) continue; const bx = blBox(b, info);
      const fs = Math.max(14, Math.round(Math.min(bx.w, bx.h) * s * 0.16));
      g.font = `700 ${fs}px Barlow, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      const cx = (b.x - ext.x0 + bx.w / 2) * s, cy = (b.y - ext.y0 + bx.h / 2) * s, tw = g.measureText(b.name).width;
      g.fillStyle = "rgba(255,255,255,.82)"; g.fillRect(cx - tw / 2 - fs * 0.3, cy - fs * 0.62, tw + fs * 0.6, fs * 1.24);
      g.fillStyle = "#111"; g.fillText(b.name, cx, cy + fs * 0.04);
    }
  }
  /* WebP keeps the see-through corners of odd-shaped layouts at a fraction of PNG's size (PNG where WebP isn't available) */
  const w = c.toDataURL("image/webp", 0.92);
  return /^data:image\/webp/.test(w) ? w : c.toDataURL("image/png");
}
async function blDone() {
  const t = BL.target; if (!t) return blClose();
  if (!BL.layout.boards.length) { set(t, null); set(layoutPathFor(t), null); blClose(); render(); queueSave(); return; }
  const url = await blRender();
  if (!url) { toast("The board pictures couldn't be drawn. Try loading the boards folder again."); return; }
  set(t, url); set(layoutPathFor(t), JSON.parse(JSON.stringify(BL.layout)));
  if (BL.note && t === "board") state.boardNote = esc("Boards " + blUsed());
  blClose(); render(); queueSave(); toast("Board layout placed: " + blUsed() + ".");
}
