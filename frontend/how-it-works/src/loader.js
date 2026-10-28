// <higgins-how-it-works src="/hm/machine.js" poster="/hm/poster.html" ratio="0.8600">
// Narrow screens get the static poster. Wider screens reserve the space and import the
// live machine only when the section comes within 600px of the viewport.
const NARROW = "(max-width: 719px)";

class HowItWorks extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" });
    this.query = matchMedia(NARROW);
    this.onChange = () => this.render();
    this.query.addEventListener("change", this.onChange);
    this.render();
  }
  disconnectedCallback() {
    this.query?.removeEventListener("change", this.onChange);
    this.stop();
  }
  stop() {
    this.live?.destroy();
    this.live = null;
    this.watch?.disconnect();
  }
  render() {
    const narrow = this.query.matches;
    if (narrow === this.narrow) return;
    this.narrow = narrow;
    this.stop();
    const ratio = Number(this.getAttribute("ratio")) || 1.7;
    // Reserve the card's space so nothing below jumps when it fills in. Styled from script, not
    // markup, so a strict CSP (style-src 'self') allows it.
    const box = document.createElement("div");
    Object.assign(box.style, { aspectRatio: String(ratio), width: "100%", borderRadius: "16px", background: "var(--hm-surface)" });
    this.shadowRoot.replaceChildren(box);
    if (narrow) return this.poster();
    this.watch = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      this.watch.disconnect();
      import(new URL(this.getAttribute("src"), document.baseURI).href).then((m) => {
        if (this.narrow !== false || this.live) return;
        this.live = m.mount(this.shadowRoot, this);
      }, () => this.poster());
    }, { rootMargin: "600px 0px" });
    this.watch.observe(this);
  }
  async poster() {
    try {
      const url = new URL(this.getAttribute("poster"), document.baseURI);
      // machine.css sits next to the poster. A <link> inside the poster's markup would resolve
      // against the page, not the poster file, so it's built here; the poster goes in once it loads.
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("machine.css", url).href;
      const styled = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
      this.shadowRoot.append(link);
      const text = await (await fetch(url)).text();
      await styled;
      if (this.narrow === false && this.live) return;
      const art = document.createElement("template");
      art.innerHTML = text;
      // The frozen run's inline styles travel as data-style; applied from script, a CSP allows them.
      for (const el of art.content.querySelectorAll("[data-style]")) {
        el.style.cssText = el.dataset.style;
        el.removeAttribute("data-style");
      }
      this.shadowRoot.replaceChildren(link, art.content);
    } catch {
      /* keep the reserved space; the <noscript> image covers no-JS visitors */
    }
  }
}
if (!customElements.get("higgins-how-it-works")) customElements.define("higgins-how-it-works", HowItWorks);
