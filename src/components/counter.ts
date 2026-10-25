/**
 * Interactive counter web component with keyboard accessibility and clean listener disposal.
 */
export class TypressCounter extends HTMLElement {
  private count = 0;

  /**
   * Initialises ARIA button semantics, keyboard focusability, and event listeners on mount.
   */
  connectedCallback(): void {
    this.setAttribute("role", "button");
    this.setAttribute("aria-live", "polite");
    this.tabIndex = 0;
    if (!this.classList.contains("counter")) {
      this.classList.add("counter");
    }
    this.addEventListener("click", this.handleActivate);
    this.addEventListener("keydown", this.handleKeyDown);
    this.render();
  }

  /**
   * Removes attached event listeners when the element is disconnected from the DOM.
   */
  disconnectedCallback(): void {
    this.removeEventListener("click", this.handleActivate);
    this.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleActivate = (): void => {
    this.count++;
    this.render();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleActivate();
    }
  };

  private render(): void {
    this.textContent = `Count is ${this.count}`;
  }
}

if (!customElements.get("typress-counter")) {
  customElements.define("typress-counter", TypressCounter);
}
