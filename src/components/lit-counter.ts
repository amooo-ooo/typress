import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Example Lit-based counter web component.
 * Renders into light DOM to inherit host page styles,
 * matching the existing vanilla component convention.
 *
 * To use this component:
 * 1. Install lit: `bun add lit`
 * 2. Enable the optional lit plugin in `vite.config.ts`:
 *    `import { lit } from "./scripts/plugins/vite";`
 *    `plugins: [..., lit()]`
 * 3. Import in your Typst page:
 *    `#let lit-counter = component("/src/components/lit-counter.ts", "lit-counter")`
 */
@customElement("lit-counter")
export class LitCounter extends LitElement {
  @property({ type: Number }) count = 0;

  constructor() {
    super();
    this.addEventListener("click", this.handleClick.bind(this));
  }

  protected override createRenderRoot(): HTMLElement {
    this.replaceChildren();
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "button");
    this.tabIndex = 0;
    if (!this.classList.contains("counter")) {
      this.classList.add("counter");
    }
  }

  private handleClick(): void {
    this.count++;
  }

  protected override render(): unknown {
    return html`Count is ${this.count}`;
  }
}
