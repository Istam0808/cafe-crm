import iconv from 'iconv-lite';

export interface PrinterProfile {
  codepage: 'cp866' | 'cp1251';
  /** ESC t n — the number differs between vendors (Xprinter cp866 = 17, cp1251 = 46). */
  codepageId: number;
  width: 58 | 80;
}

const ESC = 0x1b;
const GS = 0x1d;

// Characters missing from cp866/cp1251 (Uzbek Cyrillic, typography) mapped to the closest printable ones.
const REPLACEMENTS: Record<string, string> = {
  'ў': 'у', 'Ў': 'У', 'қ': 'к', 'Қ': 'К', 'ғ': 'г', 'Ғ': 'Г', 'ҳ': 'х', 'Ҳ': 'Х',
  '×': 'x', '—': '-', '–': '-', '«': '"', '»': '"', '“': '"', '”': '"', '‘': "'", '’': "'", 'ʻ': "'", 'ʼ': "'",
  ' ': ' ', ' ': ' ',
};

export function sanitize(text: string): string {
  return text.replace(/[^\x20-\x7eЀ-џ№]/g, (ch) => REPLACEMENTS[ch] ?? '?');
}

export type Align = 'left' | 'center' | 'right';
export type Size = 'normal' | 'tall' | 'wide' | 'big';

const SIZE_BYTE: Record<Size, number> = { normal: 0x00, tall: 0x01, wide: 0x10, big: 0x11 };
const ALIGN_BYTE: Record<Align, number> = { left: 0, center: 1, right: 2 };

/**
 * Builds raw ESC/POS bytes and, in parallel, a plain-text preview of the same ticket
 * (used for the emulator mode and for showing the ticket on screen).
 */
export class Ticket {
  private chunks: Buffer[] = [];
  private previewLines: string[] = [];
  private size: Size = 'normal';
  private align: Align = 'left';
  readonly profile: PrinterProfile;

  constructor(profile: PrinterProfile) {
    this.profile = profile;
    this.raw(ESC, 0x40, ESC, 0x74, profile.codepageId);
  }

  /** Characters per line for the current text size (font A). */
  get cols(): number {
    const base = this.profile.width === 80 ? 48 : 32;
    return this.size === 'wide' || this.size === 'big' ? Math.floor(base / 2) : base;
  }

  private raw(...bytes: number[]) {
    this.chunks.push(Buffer.from(bytes));
  }

  setAlign(align: Align) {
    this.align = align;
    this.raw(ESC, 0x61, ALIGN_BYTE[align]);
    return this;
  }

  setSize(size: Size) {
    this.size = size;
    this.raw(GS, 0x21, SIZE_BYTE[size]);
    return this;
  }

  bold(on: boolean) {
    this.raw(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** One printed line; long text is wrapped by words. */
  line(text = '') {
    for (const part of wrap(sanitize(text), this.cols)) {
      this.chunks.push(iconv.encode(part + '\n', this.profile.codepage));
      this.previewLines.push(this.previewAlign(part));
    }
    return this;
  }

  /** Left text and right-aligned value on one line, e.g. "Плов x2 ....... 70 000". */
  row(left: string, right: string) {
    const cols = this.cols;
    const r = sanitize(right);
    const lines = wrap(sanitize(left), Math.max(cols - r.length - 1, 8));
    lines.forEach((l, i) => {
      const text = i === lines.length - 1 ? l + ' '.repeat(Math.max(cols - l.length - r.length, 1)) + r : l;
      this.chunks.push(iconv.encode(text + '\n', this.profile.codepage));
      this.previewLines.push(text);
    });
    return this;
  }

  divider(ch = '-') {
    return this.line(ch.repeat(this.cols));
  }

  feed(lines = 1) {
    this.raw(ESC, 0x64, lines);
    for (let i = 0; i < lines; i++) this.previewLines.push('');
    return this;
  }

  cut() {
    this.feed(3);
    this.raw(GS, 0x56, 0x42, 0x00);
    this.previewLines.push('✂'.repeat(8));
    return this;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }

  preview(): string {
    return this.previewLines.join('\n');
  }

  private previewAlign(text: string): string {
    const pad = Math.max(this.cols - text.length, 0);
    const scale = this.cols < (this.profile.width === 80 ? 48 : 32) ? 2 : 1;
    let s = text;
    if (this.align === 'center') s = ' '.repeat(Math.floor(pad / 2)) + text;
    if (this.align === 'right') s = ' '.repeat(pad) + text;
    // wide text in the preview: spread letters so the width matches paper
    return scale === 2 ? s.split('').join(' ') : s;
  }
}

export function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    let w = word;
    while (w.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!current) current = w;
    else if (current.length + 1 + w.length <= width) current += ' ' + w;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function money(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
