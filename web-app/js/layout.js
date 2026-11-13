// Real67 fiziksel dizilimi. İndeksler satır sırasıyla (0–66) ve cihazda doğrulandı:
// PrtSc=14, Tab=15, sağ medya=43, Sol Shift=44, Ctrl=58, Space=61, Sağ ok=66.
// [etiket, genişlik(u), boşluk-öncesi(u), KeyboardEvent.code]
const ROWS = [
  [['Esc', 1, 0, 'Escape'], ['1', 1, 0, 'Digit1'], ['2', 1, 0, 'Digit2'], ['3', 1, 0, 'Digit3'], ['4', 1, 0, 'Digit4'],
   ['5', 1, 0, 'Digit5'], ['6', 1, 0, 'Digit6'], ['7', 1, 0, 'Digit7'], ['8', 1, 0, 'Digit8'], ['9', 1, 0, 'Digit9'],
   ['0', 1, 0, 'Digit0'], ['-', 1, 0, 'Minus'], ['=', 1, 0, 'Equal'], ['Backspace', 2, 0, 'Backspace'], ['PrtSc', 1, 0, 'PrintScreen']],
  [['Tab', 1.5, 0, 'Tab'], ['Q', 1, 0, 'KeyQ'], ['W', 1, 0, 'KeyW'], ['E', 1, 0, 'KeyE'], ['R', 1, 0, 'KeyR'],
   ['T', 1, 0, 'KeyT'], ['Y', 1, 0, 'KeyY'], ['U', 1, 0, 'KeyU'], ['I', 1, 0, 'KeyI'], ['O', 1, 0, 'KeyO'],
   ['P', 1, 0, 'KeyP'], ['[', 1, 0, 'BracketLeft'], [']', 1, 0, 'BracketRight'], ['\\', 1.5, 0, 'Backslash'], ['Del', 1, 0, 'Delete']],
  [['⏯', 1.75, 0, 'CapsLock'], ['A', 1, 0, 'KeyA'], ['S', 1, 0, 'KeyS'], ['D', 1, 0, 'KeyD'], ['F', 1, 0, 'KeyF'],
   ['G', 1, 0, 'KeyG'], ['H', 1, 0, 'KeyH'], ['J', 1, 0, 'KeyJ'], ['K', 1, 0, 'KeyK'], ['L', 1, 0, 'KeyL'],
   [';', 1, 0, 'Semicolon'], ["'", 1, 0, 'Quote'], ['Enter', 2.25, 0, 'Enter'], ['⏮', 1, 0, 'MediaTrackPrevious']],
  [['Shift', 2.25, 0, 'ShiftLeft'], ['Z', 1, 0, 'KeyZ'], ['X', 1, 0, 'KeyX'], ['C', 1, 0, 'KeyC'], ['V', 1, 0, 'KeyV'],
   ['B', 1, 0, 'KeyB'], ['N', 1, 0, 'KeyN'], ['M', 1, 0, 'KeyM'], [',', 1, 0, 'Comma'], ['.', 1, 0, 'Period'],
   ['/', 1, 0, 'Slash'], ['Shift', 1.75, 0, 'ShiftRight'], ['↑', 1, 0, 'ArrowUp'], ['⏭', 1, 0, 'MediaTrackNext']],
  [['Ctrl', 1.25, 0, 'ControlLeft'], ['Win', 1.25, 0, 'MetaLeft'], ['Alt', 1.25, 0, 'AltLeft'], ['', 6.25, 0, 'Space'],
   ['Alt', 1.25, 0, 'AltRight'], ['Fn', 1.25, 0, 'Fn'], ['←', 1, 0.5, 'ArrowLeft'], ['↓', 1, 0, 'ArrowDown'], ['→', 1, 0, 'ArrowRight']],
];

export const WIDTH_U = 16;
export const HEIGHT_U = 5;

export const KEYS = [];
{
  let idx = 0;
  ROWS.forEach((row, r) => {
    let x = 0;
    for (const [label, w, gap, code] of row) {
      x += gap;
      KEYS.push({ i: idx++, label, w, x, y: r, row: r, code, cx: x + w / 2, cy: r + 0.5 });
      x += w;
    }
  });
}

export const KEY_BY_CODE = new Map(KEYS.map((k) => [k.code, k]));

// Sütun benzeri kova (ses görselleştirici vb. için): 0..15
export const colOf = (k) => Math.min(WIDTH_U - 1, Math.floor(k.cx));
