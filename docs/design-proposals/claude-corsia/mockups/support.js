// Mini runtime per aprire i mockup .dc.html fuori dal canvas Artifact.
// Supporta solo ciò che usano questi file: {{hole}}, <sc-for>, <sc-if>, <dc-import>, <helmet>.
// Va servito via HTTP (es. `npx serve .`), perché <dc-import> carica i file fratelli con fetch.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(s) { Object.assign(this.state, s); }
    forceUpdate() {}
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const lookup = (ctx, path) => {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx);
  };
  const interp = (str, ctx) => str.replace(HOLE, (_, p) => { const v = lookup(ctx, p); return v == null ? '' : v; });
  const raw = (str, ctx) => { const m = str.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/); return m ? lookup(ctx, m[1]) : str; };

  function componentFrom(doc, props) {
    const script = doc.querySelector('script[data-dc-script]');
    const Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    return new Component(props).renderVals();
  }

  async function renderChildren(src, ctx, out) {
    for (const child of Array.from(src.childNodes)) await renderNode(child, ctx, out);
  }

  async function renderNode(node, ctx, out) {
    if (node.nodeType === Node.TEXT_NODE) { out.appendChild(document.createTextNode(interp(node.textContent, ctx))); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'helmet') { for (const h of Array.from(node.children)) document.head.appendChild(h.cloneNode(true)); return; }
    if (tag === 'sc-for') {
      const list = raw(node.getAttribute('list'), ctx) || [];
      const as = node.getAttribute('as') || 'item';
      for (let i = 0; i < list.length; i++) await renderChildren(node, { ...ctx, [as]: list[i], $index: i }, out);
      return;
    }
    if (tag === 'sc-if') { if (raw(node.getAttribute('value'), ctx)) await renderChildren(node, ctx, out); return; }
    if (tag === 'dc-import') {
      const props = {};
      for (const a of Array.from(node.attributes)) {
        if (a.name === 'name' || a.name.startsWith('hint-')) continue;
        props[a.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = raw(a.value, ctx);
      }
      const html = await (await fetch(node.getAttribute('name') + '.dc.html')).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      await renderChildren(doc.querySelector('x-dc'), componentFrom(doc, props), out);
      return;
    }
    const clone = document.createElementNS(node.namespaceURI, node.localName);
    for (const a of Array.from(node.attributes)) {
      if (a.name.startsWith('hint-')) continue;
      const v = raw(a.value, ctx);
      if (typeof v === 'function') continue;
      clone.setAttribute(a.name, typeof v === 'string' ? interp(v, ctx) : v);
    }
    out.appendChild(clone);
    await renderChildren(node, ctx, clone);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.querySelector('x-dc');
    if (!root) return;
    root.style.display = 'none';
    const out = document.createElement('div');
    root.after(out);
    await renderChildren(root, componentFrom(document, {}), out);
    root.remove();
    document.documentElement.dataset.rendered = 'true';
  });
})();
