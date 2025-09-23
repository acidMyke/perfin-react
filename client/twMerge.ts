import { extendTailwindMerge } from 'tailwind-merge';

const themeColors = ['neutral', 'primary', 'secondary'];
const statusColors = ['accent', 'info', 'success', 'warning', 'error'];
const fullColors = [...themeColors, ...statusColors];
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'];
const alignments = ['start', 'center', 'end'];
const placements = ['top', 'bottom', 'left', 'right'];
const style = ['outline', 'dash', 'soft'];

export const twMerge = extendTailwindMerge<string, string>({
  extend: {
    classGroups: {
      /* -------------------- BUTTON -------------------- */
      'btn-color': [{ btn: fullColors }],
      'btn-style': [{ btn: [...style, 'ghost', 'link'] }],
      'btn-size': [{ btn: sizes }],
      'btn-shape': [{ btn: ['square', 'circle'] }],

      /* -------------------- DROPDOWN -------------------- */
      'dropdown-alignment': [{ dropdown: alignments }],
      'dropdown-placement': [{ dropdown: placements }],
      'dropdown-modifier': [{ dropdown: ['hover', 'open'] }],

      /* -------------------- BADGE -------------------- */
      'badge-style': [{ badge: [...style, 'ghost'] }],
      'badge-color': [{ badge: fullColors }],
      'badge-size': [{ badge: sizes }],

      /* -------------------- CHAT BUBBLE -------------------- */
      'chat-alignment': [{ chat: alignments }],
      'chat-bubble-color': [{ 'chat-bubble': fullColors }],

      /* -------------------- STATUS -------------------- */
      'status-color': [{ status: fullColors }],
      'status-size': [{ status: sizes }],

      /* -------------------- ALERT -------------------- */
      'alert-style': [{ alert: style }],
      'alert-color': [{ alert: statusColors }],
      'alert-direction': [{ alert: ['vertical', 'horizontal'] }],

      /* -------------------- LOADING -------------------- */
      'loading-style': [{ loading: ['spinner', 'dots', 'ring', 'ball', 'bars', 'infinity'] }],
      'loading-size': [{ loading: sizes }],

      /* -------------------- TOOLTIP -------------------- */
      'tooltip-placement': [{ tooltip: placements }],
      'tooltip-color': [{ tooltip: fullColors }],

      /* -------------------- CHECKBOX -------------------- */
      'checkbox-color': [{ input: fullColors }],
      'checkbox-size': [{ input: sizes }],

      /* -------------------- INPUT -------------------- */
      'input-color': [{ input: fullColors }],
      'input-size': [{ input: sizes }],

      /* -------------------- INPUT -------------------- */
      'file-input-color': [{ 'file-input': fullColors }],
      'file-input-size': [{ 'file-input': sizes }],

      /* -------------------- RADIO -------------------- */
      'radio-color': [{ radio: fullColors }],
      'radio-size': [{ radio: sizes }],

      /* -------------------- RANGE -------------------- */
      'range-color': [{ range: fullColors }],
      'range-size': [{ range: sizes }],

      /* -------------------- SELECT -------------------- */
      'select-color': [{ select: fullColors }],
      'select-size': [{ select: sizes }],

      /* -------------------- TEXTAREA -------------------- */
      'textarea-color': [{ textarea: fullColors }],
      'textarea-size': [{ textarea: sizes }],

      /* -------------------- TOGGLE -------------------- */
      'toggle-color': [{ toggle: fullColors }],
      'toggle-size': [{ toggle: sizes }],
    },
  },
});
