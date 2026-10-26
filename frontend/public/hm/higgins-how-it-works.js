// <higgins-how-it-works src="machine-a.js" poster="poster-a.svg" ratio="1.71">
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
    // Reserve the card's space so nothing below jumps when it fills in.
    this.shadowRoot.innerHTML = `<div style="aspect-ratio:${ratio};width:100%;border-radius:16px;background:var(--hm-surface)"></div>`;
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
      const text = await (await fetch(new URL(this.getAttribute("poster"), document.baseURI))).text();
      if (this.narrow === false && this.live) return;
      this.shadowRoot.innerHTML = text;
    } catch {
      /* keep the reserved space; the <noscript> image covers no-JS visitors */
    }
  }
}
if (!customElements.get("higgins-how-it-works")) customElements.define("higgins-how-it-works", HowItWorks);
