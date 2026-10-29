/* ---------- VASL counter palettes ----------
   Reads a VASL module (.vmod, a zip) chosen by the user, lists the O/B counters by nationality
   and draws counter FRONTS the way VASL layers them (base image + active image layers).
   Everything stays in this browser: the module file and the catalogue go into IndexedDB. */
const VASL = (() => {
  const CAT_FMT = 2;   /* bump when the catalogue gains something, so a stored one is rebuilt from the saved module */
  /* VASSAL SequenceEncoder: split on a delimiter unless it is escaped with a backslash */
  function tok(s, d) {
    const out = []; let cur = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && s[i + 1] === d) { cur += d; i++; continue; }
      if (c === d) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur); return out;
  }
  /* "outer\tinner..." → [outer, inner, ...]; each nesting level adds one escape before the tab */
  function chain(s) {
    const res = [];
    for (let guard = 0; guard < 200; guard++) {
      let i = 0, cut = -1;
      for (; i < s.length; i++) if (s[i] === "\t" && s[i - 1] !== "\\") { cut = i; break; }
      if (cut < 0) { res.push(s); return res; }
      res.push(s.slice(0, cut));
      s = s.slice(cut + 1).replace(/\\\t/g, "\t");
    }
    return res;
  }
  function pieceParts(text) {
    const top = tok((text || "").trim(), "/");
    return { type: top[2] || "", state: top[3] || "" };
  }
  /* expand prototypes so every trait is listed, outermost first, with its state */
  function traitsOf(type, state, protos, depth = 0) {
    const ts = chain(type), ss = chain(state), out = [];
    ts.forEach((t, i) => {
      const id = t.split(";")[0];
      if (id === "prototype" && depth < 12) {
        const p = protos.get(t.slice(10));
        if (p) { const pp = pieceParts(p); const inner = traitsOf(pp.type, pp.state, protos, depth + 1); out.push(...inner.filter(x => x.id !== "piece")); }
        return;
      }
      out.push({ id, t, s: ss[i] ?? "" });
    });
    return out;
  }
  const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  /* the image layers that show on the front, bottom first */
  function layersOf(traits, force) {   /* force: Map(trait index -> level) to show another face, e.g. dismantled */
    const props = {};
    for (const tr of traits) {
      if (tr.id === "mark") { const names = tok(tok(tr.t, ";")[1] || "", ","), vals = tok(tr.s, ","); names.forEach((n, i) => props[n] = vals[i] ?? ""); }
      else if (tr.id === "PROP") { const f = tok(tr.t, ";"); props[f[1]] = tok(tr.s, ";")[0]; }
      else if (tr.id === "emb2") {
        const f = tok(tr.t, ";"), name = f[19] || ""; const v = num(tr.s, 1);
        if (name) { props[name + "_Level"] = String(Math.abs(v)); props[name + "_Active"] = String(v > 0); }
      }
    }
    const layers = []; let label = "";
    for (let i = traits.length - 1; i >= 0; i--) {
      const tr = traits[i];
      if (tr.id === "piece") {
        const img = (tok(tr.t, ";")[3] || "").trim();
        if (img) layers.push({ img, x: 0, y: 0 });
      } else if (tr.id === "emb2") {
        const f = tok(tr.t, ";");
        const imgs = tok(f[16] || "", ",").map(x => x.trim());
        const follow = f[22] === "true", prop = f[23] || "", first = num(f[24], 1);
        let level, active;
        if (follow) { const pv = num(props[prop], NaN); level = Number.isFinite(pv) ? pv - first + 1 : 1; active = true; }
        else { const v = num(tr.s, 1); level = Math.abs(v); active = v > 0; }
        if (force && force.has(i)) { level = force.get(i); active = true; }
        /* newer modules can tie a layer's on/off to a property (e.g. the class badge shows only when BRK_Active) */
        if (f[33] === "true" && f[32]) active = active && props[f[32]] === "true";
        /* a layer switched on by a command (Activate…) only shows when its state says so */
        if (!active) continue;
        const img = imgs[level - 1];
        if (img) layers.push({ img, x: num(f[14]), y: num(f[15]) });
        /* the level's own name (e.g. "10-2" on a leader) is a better label than a generic piece name */
        const nm = (tok(f[17] || "", ",")[level - 1] || "").replace(/\\/g, "").trim();
        if (img && nm && !nm.includes("+")) label = nm;
      }
    }
    layers.label = label;
    return layers;
  }
  /* ---- catalogue ---- */
  const tag = (e) => e.tagName.split(".").pop();
  function buildCatalog(xmlText, version) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const protos = new Map();
    for (const p of doc.getElementsByTagName("VASSAL.build.module.PrototypeDefinition")) protos.set(p.getAttribute("name"), p.textContent);
    const win = [...doc.getElementsByTagName("VASSAL.build.module.PieceWindow")].find(w => w.getAttribute("name") === "VASL Counters");
    const nations = [], seen = new Set();
    if (!win) return { version, nations };
    const boxes = [...win.getElementsByTagName("VASSAL.build.widget.BoxWidget")].filter(b => /O\/B/.test(b.getAttribute("entryName") || ""));
    for (const box of boxes) {
      const side = /Axis/.test(box.getAttribute("entryName")) ? "Axis" : "Allied";
      for (const tab of [...box.children].filter(c => tag(c) === "TabWidget")) {
        const name = tab.getAttribute("entryName"); if (!name || seen.has(name)) continue; seen.add(name);
        const counters = [];
        const walk = (el, path) => {
          for (const c of el.children) {
            const t = tag(c);
            if (t === "PieceSlot") {
              const { type, state } = pieceParts(c.textContent);
              const traits = traitsOf(type, state, protos);
              const layers = layersOf(traits);
              if (!layers.length) continue;
              const en = c.getAttribute("entryName") || "";
              const name = layers.label && layers.label !== en ? layers.label : en;
              counters.push({ n: name, a: en, g: path.join(" › "), id: c.getAttribute("gpid") || "", L: layers.map(l => ({ ...l })) });
              /* a machine gun (or other SW) that can be dismantled: also offer its dismantled face, "dm HMG" */
              traits.forEach((tr, ti) => {
                if (tr.id !== "emb2") return;
                const f = tok(tr.t, ";"), names = tok(f[17] || "", ",").map(x => x.replace(/\\/g, "").trim());
                const k = names.findIndex(x => /^dm\b/i.test(x)); if (k < 0) return;
                const v = num(tr.s, 1); if (Math.abs(v) === k + 1 && v > 0) return;
                const dm = layersOf(traits, new Map([[ti, k + 1]])); if (!dm.length) return;
                counters.push({ n: "dm " + name, a: en + " dismantled", g: path.join(" › "), id: (c.getAttribute("gpid") || "") + "dm", L: dm.map(l => ({ ...l })) });
              });
            } else if (/Widget$/.test(t)) {
              const en = (c.getAttribute("entryName") || "").replace(/^<\s*/, "").trim();
              walk(c, en && en !== "?" ? [...path, en] : path);
            }
          }
        };
        walk(tab, []);
        /* drop repeats (a dismantled face VASL also lists as its own piece) */
        const seenN = new Set();
        nations.push({ name, side, counters: counters.filter(c => { const k = c.n + "|" + c.g; if (seenN.has(k)) return false; seenN.add(k); return true; }) });
      }
    }
    return { version, nations, fmt: CAT_FMT };
  }
  /* ---- module file ---- */
  let zipP = null, zipOf = null;
  async function zip(blob) {
    if (zipOf !== blob) { zipOf = blob; zipP = JSZip.loadAsync(blob); }
    return zipP;
  }
  async function load(file) {
    const z = await zip(file);
    const bf = z.file("buildFile.xml") || z.file("buildFile"); if (!bf) throw new Error("That file doesn't look like a VASL module (no buildFile inside).");
    const xml = await bf.async("string");
    let version = (xml.match(/<VASSAL\.build\.GameModule[^>]*\sversion="([^"]+)"/) || [])[1] || "";
    const name = (xml.match(/<VASSAL\.build\.GameModule[^>]*\sname="([^"]+)"/) || [])[1] || "";
    if (name && !/VASL/i.test(name)) throw new Error(`That is the "${name}" module, not VASL.`);
    const cat = buildCatalog(xml, version);
    if (!cat.nations.length) throw new Error("No O/B counters were found in that module.");
    return cat;
  }
  /* ---- drawing ---- */
  const fileCache = new Map();
  const norm = (p) => { const out = []; for (const s of p.split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return out.join("/"); };
  const mime = (p) => /\.svg$/i.test(p) ? "image/svg+xml" : /\.png$/i.test(p) ? "image/png" : /\.gif$/i.test(p) ? "image/gif" : /\.jpe?g$/i.test(p) ? "image/jpeg" : /\.ttf$/i.test(p) ? "font/ttf" : "application/octet-stream";
  async function b64(z, path) { const f = z.file(path); return f ? f.async("base64") : null; }
  /* an SVG with its fonts and linked images folded in, so it can be drawn on its own */
  async function svgData(z, path, depth = 0) {
    const key = "svg:" + path; if (fileCache.has(key)) return fileCache.get(key);
    const p = (async () => {
      const f = z.file(path); if (!f) return null;
      let txt = await f.async("string");
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const refs = new Set();
      txt.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (m, u) => { if (!/^(data:|#|https?:)/.test(u)) refs.add(u); return m; });
      txt.replace(/(?:xlink:)?href\s*=\s*["']([^"'#][^"']*)["']/g, (m, u) => { if (!/^(data:|https?:)/.test(u)) refs.add(u); return m; });
      const map = {};
      for (const u of refs) {
        const full = norm(dir + u);
        if (/\.svg$/i.test(full) && depth < 4) { const d = await svgData(z, full, depth + 1); if (d) map[u] = d; }
        else { const d = await b64(z, full); if (d) map[u] = `data:${mime(full)};base64,${d}`; }
      }
      txt = txt.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (m, u) => map[u] ? `url("${map[u]}")` : m)
               .replace(/((?:xlink:)?href\s*=\s*["'])([^"'#][^"']*)(["'])/g, (m, a, u, b) => map[u] ? a + map[u] + b : m)
               .replace(/format\(\s*["']ttf["']\s*\)/g, 'format("truetype")');
      return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(txt)));
    })();
    fileCache.set(key, p); return p;
  }
  async function imgSrc(z, rel) {
    let path = norm("images/" + rel);
    /* older pieces name an image without its extension; use the sharpest file that exists */
    if (!/\.[a-z0-9]{3,4}$/i.test(path) || !z.file(path)) {
      const base = path.replace(/\.(gif|png|svg|jpe?g)$/i, "");
      path = [".svg", ".png", ".gif", ".jpg"].map(e => base + e).find(q => z.file(q)) || path;
    }
    if (/\.svg$/i.test(path)) return svgData(z, path);
    const key = "raw:" + path; if (!fileCache.has(key)) fileCache.set(key, b64(z, path).then(d => d ? `data:${mime(path)};base64,${d}` : null));
    return fileCache.get(key);
  }
  const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  /* draw one counter front; returns { url, w, h } with w/h in VASL pixels (48 = ½", 60 = ⅝") */
  async function render(blob, layers, scale = 4) {
    const z = await zip(blob);
    const ims = [];
    for (const L of layers) { const src = await imgSrc(z, L.img); const im = src && await loadImg(src); if (im) ims.push({ im, x: L.x, y: L.y }); }
    if (!ims.length) return null;
    const base = ims[0].im, w = base.naturalWidth || base.width, h = base.naturalHeight || base.height;
    const cv = document.createElement("canvas"); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    const g = cv.getContext("2d"); g.imageSmoothingQuality = "high";
    for (const { im, x, y } of ims) {
      const iw = (im.naturalWidth || im.width) * scale, ih = (im.naturalHeight || im.height) * scale;
      g.drawImage(im, cv.width / 2 + x * scale - iw / 2, cv.height / 2 + y * scale - ih / 2, iw, ih);
    }
    return { url: cv.toDataURL("image/png"), w, h };
  }
  return { tok, chain, pieceParts, traitsOf, layersOf, buildCatalog, load, render, CAT_FMT };
})();
