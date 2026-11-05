import type { Page } from "@playwright/test";

/** Installs a click-driven HA selector stand-in for the standalone test page. */
export async function installHaSelectorFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (customElements.get("ha-selector")) return;

    class TestHaSelector extends HTMLElement {
      private _hass?: {
        states?: Record<string, { attributes?: { friendly_name?: unknown } }>;
      };
      private _open = false;
      private _selector?: {
        entity?: { filter?: { domain?: string | readonly string[] } };
        icon?: Record<string, never>;
      };
      private _value = "";

      public set hass(value: typeof this._hass) {
        this._hass = value;
        this._render();
      }

      public get hass(): typeof this._hass {
        return this._hass;
      }

      public set selector(value: typeof this._selector) {
        this._selector = value;
        this._render();
      }

      public get selector(): typeof this._selector {
        return this._selector;
      }

      public set value(value: string) {
        this._value = value;
        this._render();
      }

      public get value(): string {
        return this._value;
      }

      public connectedCallback(): void {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" });
        this._render();
      }

      private _render(): void {
        if (!this.shadowRoot) return;
        const label = this.getAttribute("label") || "Entity";
        const options = this._options();
        this.shadowRoot.replaceChildren();

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", String(this._open));
        trigger.textContent = this._value
          ? this._name(this._value)
          : `Choose ${label}`;
        trigger.addEventListener("click", () => {
          this._open = !this._open;
          this._render();
        });
        this.shadowRoot.append(trigger);

        if (!this._open) return;
        const list = document.createElement("div");
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", label);
        for (const optionValue of options) {
          const option = document.createElement("button");
          option.type = "button";
          option.setAttribute("role", "option");
          option.setAttribute(
            "aria-selected",
            String(optionValue === this._value),
          );
          option.textContent = this._name(optionValue);
          option.addEventListener("click", () => {
            this._value = optionValue;
            this._open = false;
            this.dispatchEvent(
              new CustomEvent("value-changed", {
                bubbles: true,
                composed: true,
                detail: { value: optionValue },
              }),
            );
            this._render();
          });
          list.append(option);
        }
        this.shadowRoot.append(list);
      }

      private _options(): string[] {
        if (this._selector?.icon) {
          return ["mdi:lightbulb-off-outline", "mdi:coach-lamp"];
        }
        const domain = this._selector?.entity?.filter?.domain;
        const domains = Array.isArray(domain)
          ? domain
          : typeof domain === "string"
            ? [domain]
            : [];
        return Object.keys(this._hass?.states ?? {}).filter((entityId) => {
          const entityDomain = entityId.split(".", 1)[0];
          return domains.length === 0 || domains.includes(entityDomain ?? "");
        });
      }

      private _name(entityId: string): string {
        if (entityId === "mdi:lightbulb-off-outline") return "Stateful bulb";
        if (entityId === "mdi:coach-lamp") return "Coach lamp";
        const name = this._hass?.states?.[entityId]?.attributes?.friendly_name;
        return typeof name === "string" && name.trim() ? name : entityId;
      }
    }

    customElements.define("ha-selector", TestHaSelector);
  });
}

/** Installs a visible HA icon stand-in while preserving the public icon API. */
export async function installHaIconFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (customElements.get("ha-icon")) return;

    class TestHaIcon extends HTMLElement {
      private _icon = "";

      public set icon(value: string) {
        this._icon = value;
        this._render();
      }

      public get icon(): string {
        return this._icon;
      }

      public connectedCallback(): void {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" });
        this._render();
      }

      private _render(): void {
        if (!this.shadowRoot) return;
        const off = this._icon === "mdi:lightbulb-off-outline";
        this.shadowRoot.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 21h6v-2H9v2Zm3-19a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2Zm2.85 11.1-.85.5V15h-4v-1.4l-.85-.5a5 5 0 1 1 5.7 0Z" />
          ${off ? '<path d="M4 3 3 4l17 17 1-1L4 3Z" />' : ""}
        </svg><style>:host,svg{display:block;width:100%;height:100%}path{fill:currentColor}</style>`;
      }
    }

    customElements.define("ha-icon", TestHaIcon);
  });
}

/** Installs a visual stand-in for Home Assistant's vertical control slider. */
export async function installHaControlSliderFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (customElements.get("ha-control-slider")) return;

    class TestHaControlSlider extends HTMLElement {
      private _value = 0;

      public set value(value: number) {
        this._value = value;
        this._render();
      }

      public get value(): number {
        return this._value;
      }

      public connectedCallback(): void {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" });
        this._render();
      }

      private _render(): void {
        if (!this.shadowRoot) return;
        this.shadowRoot.innerHTML = `<div class="track">
          <span class="fill" style="height:${this._value}%"></span>
          <span class="handle" style="bottom:calc(${this._value}% - .55rem)"></span>
        </div><style>
          :host{display:grid;place-items:center}
          .track{position:relative;width:2.4rem;height:100%;min-height:7rem;overflow:hidden;border-radius:1.2rem;background:var(--control-slider-background)}
          .fill{position:absolute;inset-inline:0;bottom:0;background:var(--control-slider-color)}
          .handle{position:absolute;left:50%;width:1.1rem;height:1.1rem;transform:translateX(-50%);border:2px solid white;border-radius:50%;background:var(--control-slider-color);box-shadow:0 1px 3px #0008}
        </style>`;
      }
    }

    customElements.define("ha-control-slider", TestHaControlSlider);
  });
}
