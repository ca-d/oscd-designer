import { isBusBar } from './connectivity.js';
import { attributes } from './sld-attributes.js';
import { canPlaceAt, canResizeTo, canResizeToTL } from './sld-placement.js';

import type { InteractionState } from './interaction-mode.js';

/**
 * The semantic read-out for the active interaction gesture: the label to show
 * (`text`), whether the gesture would be illegal (`invalid`), and whether there
 * is anything to show at all (`hidden`). It is a pure view-model — no DOM, no
 * tooltip — so any surface (tooltip, status bar, test) can render it.
 */
export type InteractionReadout = {
  text: string;
  invalid: boolean;
  hidden: boolean;
};

const hidden: InteractionReadout = { text: '', invalid: false, hidden: true };

/**
 * Projects the current interaction gesture onto its {@link InteractionReadout}.
 * It reads the {@link InteractionState} union directly and branches on its
 * `mode`, so the caller cannot supply an illegal mix of gestures (e.g. placing
 * *and* resizing). Only the three coordinate-bearing modes produce visible text
 * — placement emits coordinates, resize emits dimensions; every other mode,
 * including `placingLabel` and `connectingFrom`, is hidden.
 */
export function interactionReadout({
  substation,
  interaction,
  mouseX,
  mouseY,
}: {
  substation: Element;
  interaction: InteractionState;
  mouseX: number;
  mouseY: number;
}): InteractionReadout {
  switch (interaction.mode) {
    case 'placing': {
      const placing = interaction.element;
      const {
        dim: [w0, h0],
      } = attributes(placing);
      const [offsetX, offsetY] = interaction.offset;
      const x = mouseX - offsetX;
      const y = mouseY - offsetY;

      return {
        text: `${x},${y}`,
        invalid: !canPlaceAt(substation, placing, x, y, w0, h0),
        hidden: false,
      };
    }

    case 'resizingBR': {
      const resizingBR = interaction.element;
      if (isBusBar(resizingBR)) {
        return hidden;
      }
      const {
        pos: [x, y],
      } = attributes(resizingBR);
      const newW = Math.max(1, mouseX - x + 1);
      const newH = Math.max(1, mouseY - y + 1);

      return {
        text: `${newW}×${newH}`,
        invalid: !canResizeTo(substation, resizingBR, newW, newH),
        hidden: false,
      };
    }

    case 'resizingTL': {
      const resizingTL = interaction.element;
      if (isBusBar(resizingTL)) {
        return hidden;
      }
      const {
        pos: [x, y],
        dim: [resW, resH],
      } = attributes(resizingTL);
      const newW = Math.max(1, x + resW - mouseX);
      const newH = Math.max(1, y + resH - mouseY);
      const newX = Math.min(mouseX, x + resH - 1);
      const newY = Math.min(mouseY, y + resW - 1);

      return {
        text: `${newW}×${newH}`,
        invalid: !canResizeToTL(substation, resizingTL, newX, newY, newW, newH),
        hidden: false,
      };
    }

    default:
      return hidden;
  }
}
