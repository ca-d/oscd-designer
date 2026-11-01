import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdDivider } from '@omicronenergy/oscd-ui/divider/OscdDivider.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdListItem } from '@omicronenergy/oscd-ui/list/OscdListItem.js';
import { OscdMenu } from '@omicronenergy/oscd-ui/menu/OscdMenu.js';
import { OscdMenuItem } from '@omicronenergy/oscd-ui/menu/OscdMenuItem.js';

import { OscdSldIcon } from '../oscd-sld-icon.js';
import { isBusBar } from '../foundations/connectivity.js';
import { isIedReferenceElement } from '../foundations/ied.js';
import { attributes } from '../foundations/sld-attributes.js';
import { createContextMenuItems } from './sld-context-menu-factory.js';
import { sldThemeStyles } from '../theme.js';

function renderSldStartIcon(icon: string): TemplateResult<1> {
  return html`<oscd-sld-icon slot="start">${icon}</oscd-sld-icon>`;
}

function transformerIconName(
  windings: 1 | 2 | 3,
  kind?: 'default' | 'auto' | 'earthing',
): string {
  return kind && kind !== 'default'
    ? `sld_ptr_${windings}_${kind}`
    : `sld_ptr_${windings}`;
}

function renderDivider(): TemplateResult {
  return html`<oscd-divider></oscd-divider>`;
}

/** Resolves on the next `type` event of `target`, or after a second at the latest. */
function nextEvent(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      target.removeEventListener(type, done);
      resolve();
    };
    const timer = setTimeout(done, 1000);
    target.addEventListener(type, done);
  });
}

/** The innermost element at a point, looking into shadow roots. */
function deepElementFromPoint(x: number, y: number): Element | null {
  let element = document.elementFromPoint(x, y);
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === element) {
      break;
    }
    element = inner;
  }
  return element;
}

function renderHeader({ element }: ContextMenuHeader): TemplateResult {
  let name = element.getAttribute('name') || element.tagName;
  let detail: string | null | TemplateResult<1> =
    element.getAttribute('desc');
  const type = element.getAttribute('type');

  if (type) {
    if (detail) {
      detail = html`${type} &mdash; ${detail}`;
    } else {
      detail = type;
    }
  }

  let footerGraphic = renderSldStartIcon('sld_conducting_equipment');
  if (element.tagName === 'PowerTransformer') {
    const windings = element.querySelectorAll('TransformerWinding').length;
    const { kind } = attributes(element);

    if (windings === 3) {
      footerGraphic = renderSldStartIcon(transformerIconName(3));
    } else if (windings === 2) {
      footerGraphic = renderSldStartIcon(transformerIconName(2, kind));
    } else {
      footerGraphic = renderSldStartIcon(transformerIconName(1, kind));
    }
  } else if (element.tagName === 'TransformerWinding') {
    footerGraphic = renderSldStartIcon('sld_ptr_1');
  } else if (element.tagName === 'ConductingEquipment') {
    footerGraphic = renderSldStartIcon(
      type ? `sld_equipment_${type}` : 'sld_conducting_equipment',
    );
  } else if (element.tagName === 'Bay' && isBusBar(element)) {
    footerGraphic = html`<oscd-icon slot="start">horizontal_rule</oscd-icon>`;
  } else if (element.tagName === 'Bay') {
    footerGraphic = renderSldStartIcon('sld_bay');
  } else if (element.tagName === 'VoltageLevel') {
    footerGraphic = renderSldStartIcon('sld_voltage_level');
  } else if (isIedReferenceElement(element)) {
    name = 'IED';
    footerGraphic = html`<oscd-icon slot="start">developer_board</oscd-icon>`;
  } else if (element.tagName === 'Text') {
    footerGraphic = html`<oscd-icon slot="start">title</oscd-icon>`;
    detail = element.textContent;
  }

  return html`<oscd-list-item type="text">
      <div slot="headline">${name}</div>
      ${detail
        ? html`<div
            slot="supporting-text"
            style="display: inline-block; max-width: 15em; overflow: hidden; text-overflow: ellipsis;"
          >
            ${detail}
          </div>`
        : nothing}
      ${footerGraphic}
    </oscd-list-item>`;
}


export type ContextMenuAction = {
  type?: 'action';
  handler: () => void;
  headline: string;
  icon: string;
  style?: string;
};

export type ContextMenuDivider = {
  type: 'divider';
};

export type ContextMenuHeader = {
  type: 'header';
  element: Element;
};

export type ContextMenuItem =
  | ContextMenuAction
  | ContextMenuDivider
  | ContextMenuHeader;

export type MenuContext = {
  element: Element;
  x: number;
  y: number;
  gridX: number;
  gridY: number;
};

export type MenuItemContext = MenuContext & {
  doc: XMLDocument;
  nsp: string;
  dispatch: (event: Event) => void;
};

function menuHeaderHeight(element: Element): number {
  return element.hasAttribute('desc') ||
    element.hasAttribute('type') ||
    (element.tagName === 'Text' && element.textContent)
    ? 73
    : 57;
}

export class SldContextMenu extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-divider': OscdDivider,
    'oscd-icon': OscdIcon,
    'oscd-list-item': OscdListItem,
    'oscd-menu': OscdMenu,
    'oscd-menu-item': OscdMenuItem,
    'oscd-sld-icon': OscdSldIcon,
  };

  @property({ attribute: false })
  doc!: XMLDocument;

  @property()
  nsp!: string;

  @state()
  private context?: MenuContext;

  @query('#ctx-anchor')
  private anchor!: HTMLDivElement;

  @query('oscd-menu')
  menu!: OscdMenu;

  /** The context of the latest request to open, which wins over earlier ones still opening. */
  private requested?: MenuContext;

  async open(context: MenuContext): Promise<void> {
    this.context = context;
    this.requested = context;
    await this.updateComplete;
    if (this.requested !== context) {
      return;
    }
    const { anchor, menu } = this;
    anchor.style.left = `${context.x}px`;
    anchor.style.top = `${context.y - menuHeaderHeight(context.element)}px`;
    menu.anchorElement = anchor;
    // Laid out unseen first, so that it can be placed by its full height.
    menu.style.visibility = 'hidden';
    const wasOpen = menu.open;
    const opened = nextEvent(menu, 'opened');
    menu.show();
    if (!wasOpen) {
      await opened;
    }
    if (this.context === context) {
      await this.place(context.y);
    }
    menu.style.visibility = '';
  }

  /**
   * Puts the first action at the cursor height `y`. A menu that does not fit
   * below that ends at the cursor instead, and one that does not fit above it
   * either starts at the top of the window and only scrolls once it is as high
   * as the window.
   */
  private async place(y: number): Promise<void> {
    const { anchor, menu } = this;
    const surface = menu.shadowRoot?.querySelector<HTMLElement>('.menu');
    const list = menu.shadowRoot?.querySelector<HTMLElement>('.items');
    if (!surface || !list) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const height = rect.height + list.scrollHeight - list.clientHeight;
    const firstAction = this.renderRoot.querySelector('oscd-menu-item');
    const lead = firstAction
      ? firstAction.getBoundingClientRect().top - rect.top
      : 0;
    const below = y - lead;
    const top =
      below + height <= window.innerHeight
        ? Math.max(0, below)
        : Math.max(0, y - height);
    anchor.style.top = `${top}px`;
    menu.reposition();
    await new Promise(requestAnimationFrame);
    await menu.updateComplete;
  }

  private handleClosed(): void {
    this.context = undefined;
  }

  /** Right-clicking outside the menu opens the menu of what is under the cursor instead. */
  private handleScrimContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const scrim = event.currentTarget as HTMLElement;
    scrim.style.pointerEvents = 'none';
    const target = deepElementFromPoint(event.clientX, event.clientY);
    scrim.style.pointerEvents = '';
    const requested = this.requested;
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 2,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
      }),
    );
    if (this.requested === requested) {
      this.menu.close();
    }
  }

  private buildItems(): ContextMenuItem[] {
    if (!this.context) {
      return [];
    }

    return createContextMenuItems({
      ...this.context,
      doc: this.doc,
      nsp: this.nsp,
      dispatch: event => this.dispatchEvent(event),
    });
  }

  private renderAction(item: ContextMenuAction): TemplateResult {
    return html`<oscd-menu-item
      style=${item.style ?? nothing}
      @click=${() => {
        item.handler();
        this.context = undefined;
      }}
    >
      <div slot="headline">${item.headline}</div>
      <oscd-sld-icon slot="start">${item.icon}</oscd-sld-icon>
    </oscd-menu-item>`;
  }

  private renderMenuItem(item: ContextMenuItem): TemplateResult {
    switch (item.type) {
      case 'divider':
        return renderDivider();
      case 'header':
        return renderHeader(item);
      default:
        return this.renderAction(item);
    }
  }

  protected override render(): TemplateResult {
    const items = this.context ? this.buildItems() : [];

    // The menu itself takes the keyboard; the scrim is only there for the mouse.
    /* eslint-disable lit-a11y/click-events-have-key-events */
    return html`
      <div id="ctx-anchor"></div>
      ${this.context
        ? html`<div
            id="scrim"
            @mousedown=${(event: MouseEvent) => event.preventDefault()}
            @click=${() => this.menu.close()}
            @wheel=${() => this.menu.close()}
            @contextmenu=${this.handleScrimContextMenu}
          ></div>`
        : nothing}
      <oscd-menu
        positioning="fixed"
        quick
        anchor-corner="start-start"
        no-vertical-flip
        stay-open-on-focusout
        @closed=${this.handleClosed}
      >
          ${items.map(item => this.renderMenuItem(item))}
      </oscd-menu>
    `;
    /* eslint-enable lit-a11y/click-events-have-key-events */
  }

  static styles = [
    sldThemeStyles,
    css`
      :host {
        display: contents;
        --md-divider-color: var(--oscd-base1);
      }

      #ctx-anchor {
        position: fixed;
        width: 0;
        height: 0;
        pointer-events: none;
      }

      /* Catches the click that closes the menu, just below the menu itself. */
      #scrim {
        position: fixed;
        inset: 0;
        z-index: 19;
      }
    `,
  ];
}
