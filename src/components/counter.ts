export class TypressCounter extends HTMLElement {
  private count = 0;

  constructor() {
    super();
    this.addEventListener("click", this.handleClick.bind(this));
  }

  connectedCallback() {
    this.setAttribute("role", "button");
    this.tabIndex = 0;
    if (!this.classList.contains("counter")) {
      this.classList.add("counter");
    }
    this.render();
  }

  private handleClick() {
    this.count++;
    this.render();
  }

  private render() {
    this.textContent = `Count is ${this.count}`;
  }
}

if (!customElements.get("typress-counter")) {
  customElements.define("typress-counter", TypressCounter);
}
