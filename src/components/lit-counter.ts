import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Lit-based counter web component rendering into light DOM with keyboard support and listener disposal.
 */
@customElement("lit-counter")
export class LitCounter extends LitElement {
  /** Current counter value. */
  @property({ type: Number }) count = 0;

  /**
   * Renders template content directly into the host element's light DOM.
   *
   * @returns Host `HTMLElement` acting as the render root.
   */
  protected override createRenderRoot(): HTMLElement {
    this.replaceChildren();
    return this;
  }

  /**
   * Initialises ARIA button semantics, keyboard focusability, and event listeners on mount.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "button");
    this.setAttribute("aria-live", "polite");
    this.tabIndex = 0;
    if (!this.classList.contains("counter")) {
      this.classList.add("counter");
    }
    this.addEventListener("click", this.handleActivate);
    this.addEventListener("keydown", this.handleKeyDown);
  }

  /**
   * Cleans up event listeners when the element is removed from the DOM.
   */
  override disconnectedCallback(): void {
    this.removeEventListener("click", this.handleActivate);
    this.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleActivate = (): void => {
    this.count++;
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleActivate();
    }
  };

  /**
   * Renders the current counter label.
   *
   * @returns Lit template result displaying the active count.
   */
  protected override render(): unknown {
    return html`Count is ${this.count}`;
  }
}
