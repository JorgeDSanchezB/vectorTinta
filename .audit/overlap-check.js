(() => {
  // ── Detector determinista de colisiones de texto ──
  // Recorre todos los nodos de texto visibles y mide la intersección REAL
  // de sus cajas. Cero VLM, cero subjetividad: geometría pura.
  // Si hay un overlay modal abierto (Sheet/Dialog), solo se audita su
  // contenido: el resto queda oculto tras el backdrop (falsos positivos).
  const openOverlay = [...document.querySelectorAll('[data-state=open][role=dialog], [data-state=open][data-slot=sheet-content], [data-state=open][data-slot=dialog-content]')].pop();
  const scope = openOverlay ?? document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const raw = (t.textContent ?? "").trim();
    if (raw === "") continue;
    const el = t.parentElement;
    if (el === null) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    // Las notificaciones flotantes (sonner) flotan SOBRE el contenido por
    // diseño: no se auditan contra el flujo de la página.
    if (el.closest("[data-sonner-toaster]")) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    nodes.push({ text: raw.slice(0, 28), x: r.left, y: r.top, w: r.width, h: r.height, el });
  }
  // Oclusión: si un nodo está completamente bajo un ancestro sticky/fixed
  // opaco del OTRO nodo (p.ej. contenido que scrollea tras el header), no
  // es una colisión visible.
  const coveredBySticky = (cover, under) => {
    let p = cover.el;
    while (p && p !== document.body) {
      const st = getComputedStyle(p);
      if ((st.position === 'sticky' || st.position === 'fixed') && Number(st.zIndex || 0) >= 10) {
        const pr = p.getBoundingClientRect();
        const bg = st.backgroundColor;
        const opaque = bg && !/rgba\(.*,\s*0\)/.test(bg) && bg !== 'transparent';
        if (opaque
          && under.x >= pr.left - 1 && under.x + under.w <= pr.right + 1
          && under.y >= pr.top - 1 && under.y + under.h <= pr.bottom + 1) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const clippedByScroll = (n) => {
    let p = n.el.parentElement;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      const yClip = /(auto|scroll|hidden)/.test(ps.overflowY) && ps.overflowY !== 'visible';
      const xClip = /(auto|scroll|hidden)/.test(ps.overflowX) && ps.overflowX !== 'visible';
      if (yClip || xClip) {
        const pr = p.getBoundingClientRect();
        if (yClip && (n.y + n.h - pr.bottom > 2 || pr.top - n.y > 2)) return true;
        if (xClip && (n.x + n.w - pr.right > 2 || pr.left - n.x > 2)) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const clashes = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (coveredBySticky(a, b) || coveredBySticky(b, a)) continue;
      // Contenido scrolleable recortado: si un nodo queda FUERA del rect
      // visible de un ancestro con overflow auto/scroll (en su eje), está
      // recortado por scroll — no es una colisión visible.
      if (clippedByScroll(a) || clippedByScroll(b)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) {
        clashes.push({
          a: a.text, b: b.text,
          aRect: [Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)],
          bRect: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)],
          overlap: [Math.round(ox), Math.round(oy)],
        });
      }
    }
  }
  // inputs: su VALOR no crea nodo de texto — se miden como cajas propias
  scope.querySelectorAll('input:not([type=hidden]), textarea').forEach((inp) => {
    if (inp.offsetParent === null) return;
    const raw = (inp.value || inp.placeholder || '').trim();
    if (raw === '') return;
    const r = inp.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    nodes.push({ text: '[' + raw.slice(0, 20) + ']', x: r.left, y: r.top, w: r.width, h: r.height, el: inp });
  });
  const hOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const clipped = [];
  for (const n of nodes) {
    let p = n.el.parentElement;
    while (p !== null && p !== document.body) {
      const ps = window.getComputedStyle(p);
      if ((ps.overflowY === "hidden" || ps.overflowX === "hidden" || ps.overflow === "hidden")) {
        const pr = p.getBoundingClientRect();
        if (n.y + n.h - pr.bottom > 3 || n.x + n.w - pr.right > 3) {
          clipped.push({ text: n.text, parent: p.tagName + "." + String(p.className).slice(0, 40), by: [Math.round(n.y + n.h - pr.bottom), Math.round(n.x + n.w - pr.right)] });
          break;
        }
      }
      p = p.parentElement;
    }
    if (clipped.length >= 8) break;
  }
  return JSON.stringify({
    textNodes: nodes.length,
    clashes: clashes.length,
    clashList: clashes.slice(0, 12),
    hOverflowPx: hOverflow,
    clippedCount: clipped.length,
    clippedList: clipped,
  }, null, 1);
})()
