import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Lit-based counter web component.
 * Renders into light DOM to inherit host page styles,
 * matching the existing vanilla component convention.
 */
@customElement("lit-counter")
export class LitCounter extends LitElement {
  @property({ type: Number }) count = 0;

  protected override createRenderRoot(): HTMLElement {
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
    return html`<span @click=${this.handleClick}>Count is ${this.count}</span>`;
  }
}
