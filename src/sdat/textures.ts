import { CanvasTexture, SRGBColorSpace } from 'three';
import type { DeckStatus } from './deck';
import type { Track } from './tracks';

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/* ---------------------------------------------------------------- LCD */

const INK = 'rgba(20, 24, 22, 0.92)';
const GHOST = 'rgba(20, 24, 22, 0.07)';
const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
  '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};

function hSeg(ctx: CanvasRenderingContext2D, x1: number, x2: number, cy: number, hw: number) {
  ctx.moveTo(x1, cy);
  ctx.lineTo(x1 + hw, cy - hw);
  ctx.lineTo(x2 - hw, cy - hw);
  ctx.lineTo(x2, cy);
  ctx.lineTo(x2 - hw, cy + hw);
  ctx.lineTo(x1 + hw, cy + hw);
  ctx.closePath();
}

function vSeg(ctx: CanvasRenderingContext2D, cx: number, y1: number, y2: number, hw: number) {
  ctx.moveTo(cx, y1);
  ctx.lineTo(cx + hw, y1 + hw);
  ctx.lineTo(cx + hw, y2 - hw);
  ctx.lineTo(cx, y2);
  ctx.lineTo(cx - hw, y2 - hw);
  ctx.lineTo(cx - hw, y1 + hw);
  ctx.closePath();
}

function segPath(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number, t: number) {
  const hw = t / 2;
  const g = t * 0.22;
  const mid = y + h / 2;
  switch (name) {
    case 'a': return hSeg(ctx, x + hw + g, x + w - hw - g, y + hw, hw);
    case 'g': return hSeg(ctx, x + hw + g, x + w - hw - g, mid, hw);
    case 'd': return hSeg(ctx, x + hw + g, x + w - hw - g, y + h - hw, hw);
    case 'f': return vSeg(ctx, x + hw, y + hw + g, mid - g, hw);
    case 'b': return vSeg(ctx, x + w - hw, y + hw + g, mid - g, hw);
    case 'e': return vSeg(ctx, x + hw, mid + g, y + h - hw - g, hw);
    case 'c': return vSeg(ctx, x + w - hw, mid + g, y + h - hw - g, hw);
  }
}

/** Italic seven-segment digit with the faint "off" segments real LCDs show. */
function digit(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, t: number) {
  ctx.save();
  ctx.transform(1, 0, -0.1, 1, 0.1 * (y + h), 0);
  ctx.fillStyle = GHOST;
  ctx.beginPath();
  for (const s of 'abcdefg') segPath(ctx, s, x, y, w, h, t);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const s of SEGS[ch] ?? '') segPath(ctx, s, x, y, w, h, t);
  ctx.fill();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, on = true, align: CanvasTextAlign = 'left') {
  ctx.save();
  ctx.transform(1, 0, -0.1, 1, 0.1 * y, 0);
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.textAlign = align;
  ctx.fillStyle = on ? INK : GHOST;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface LCDState {
  status: DeckStatus;
  pgm: number | null;
  title: string;
  seconds: number;
  levels: [number, number];
  clock: number;
}

export const LCD_SIZE = { w: 640, h: 360 };

export function drawLCD(ctx: CanvasRenderingContext2D, s: LCDState) {
  const { w, h } = LCD_SIZE;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#aab3a0');
  bg.addColorStop(1, '#949e8c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const blink = Math.floor(s.clock * 2.5) % 2 === 0;
  const hasTape = s.pgm !== null && s.status !== 'empty' && s.status !== 'ejecting';
  const showNum = hasTape && s.status !== 'loading' && s.status !== 'reading';

  label(ctx, 'PGM NO.', 36, 46, 26);
  const pgm = showNum ? String(s.pgm).padStart(2, '0') : s.status === 'reading' && blink ? '--' : '  ';
  digit(ctx, pgm[0], 36, 64, 104, 180, 22);
  digit(ctx, pgm[1], 160, 64, 104, 180, 22);

  // Transport indicator + word.
  ctx.fillStyle = INK;
  const iy = 300;
  if (s.status === 'playing') {
    ctx.beginPath();
    ctx.moveTo(40, iy - 17);
    ctx.lineTo(68, iy);
    ctx.lineTo(40, iy + 17);
    ctx.fill();
  } else if (s.status === 'paused' && blink) {
    ctx.fillRect(40, iy - 17, 10, 34);
    ctx.fillRect(58, iy - 17, 10, 34);
  } else if (s.status === 'stopped') {
    ctx.fillRect(40, iy - 15, 30, 30);
  }
  const word: Record<DeckStatus, string> = {
    empty: 'NO TAPE', loading: 'LOAD', reading: 'READ TOC', playing: 'PLAY',
    paused: 'PAUSE', stopped: 'STOP', ejecting: 'OPEN',
  };
  const blinkWord = s.status === 'empty' || s.status === 'loading' || s.status === 'ejecting';
  label(ctx, word[s.status], 88, iy + 10, 28, !blinkWord || blink);

  // Elapsed time: 00H 00M 00S.
  label(ctx, 'TIME', 606, 58, 24, true, 'right');
  const t = Math.floor(s.seconds);
  const parts = showNum
    ? [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(Math.min(n, 99)).padStart(2, '0'))
    : ['  ', '  ', '  '];
  'HMS'.split('').forEach((unit, i) => {
    const x = 286 + i * 107;
    digit(ctx, parts[i][0], x, 78, 36, 76, 10);
    digit(ctx, parts[i][1], x + 41, 78, 36, 76, 10);
    label(ctx, unit, x + 82, 154, 20);
  });

  // Scrolling title.
  ctx.save();
  ctx.beginPath();
  ctx.rect(280, 180, 330, 40);
  ctx.clip();
  ctx.font = `700 26px ${SANS}`;
  const text = hasTape ? s.title.toUpperCase() : 'SDAT · DIGITAL AUDIO TAPE';
  const width = ctx.measureText(text).width;
  const span = width + 80;
  const offset = width > 320 ? (s.clock * 50) % span : 0;
  ctx.fillStyle = INK;
  ctx.fillText(text, 286 - offset, 210);
  if (width > 320) ctx.fillText(text, 286 - offset + span, 210);
  ctx.restore();

  // L/R segmented peak meters.
  const segs = 22;
  s.levels.forEach((lv, row) => {
    const y = 250 + row * 42;
    label(ctx, row === 0 ? 'L' : 'R', 286, y + 22, 22);
    const lit = Math.round(lv * segs);
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i < lit ? INK : GHOST;
      ctx.fillRect(312 + i * 13.5, y, 10, i > 17 ? 26 : 22);
    }
  });
}

/* ----------------------------------------------------------- cassette */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Hub centres on the face canvas (512x372), mirrored by the 3D hubs. */
export const HUB_UV = [
  [150, 288],
  [362, 288],
] as const;

export function cassetteFace(track: Track) {
  return canvasTexture(512, 372, (ctx) => {
    // Coloured shell, like the changer's tapes, with a paper label on top.
    ctx.fillStyle = track.color;
    ctx.fillRect(0, 0, 512, 372);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, 212, 512, 160);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < 512; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 212);
      ctx.lineTo(x, 372);
      ctx.stroke();
    }

    // Label.
    ctx.save();
    roundRect(ctx, 20, 18, 472, 188, 14);
    ctx.clip();
    ctx.fillStyle = '#f3ede0';
    ctx.fillRect(20, 18, 472, 188);
    ctx.fillStyle = '#15131a';
    ctx.fillRect(20, 18, 472, 34);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? track.color : 'rgba(0,0,0,0)';
      ctx.beginPath();
      ctx.moveTo(380 + i * 12, 206);
      ctx.lineTo(392 + i * 12, 206);
      ctx.lineTo(404 + i * 12, 184);
      ctx.lineTo(392 + i * 12, 184);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#f3ede0';
    ctx.font = `800 20px ${SANS}`;
    ctx.fillText('DAT', 36, 43);
    ctx.textAlign = 'right';
    ctx.fillText('120 min · 48kHz', 478, 43);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#15131a';
    ctx.font = `900 108px ${SANS}`;
    ctx.fillText(String(track.pgm), 34, 172);
    ctx.font = `700 15px ${SANS}`;
    ctx.fillText('PGM', 38, 74);

    ctx.font = `800 31px ${SANS}`;
    const words = track.title.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const wd of words) {
      const next = line ? `${line} ${wd}` : wd;
      if (ctx.measureText(next).width > 250 && line) {
        lines.push(line);
        line = wd;
      } else line = next;
    }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 196, 92 + i * 34));
    ctx.font = `600 17px ${SANS}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(track.subtitle.toUpperCase(), 196, 196);
    ctx.globalAlpha = 1;

    // Window with tape packs.
    const win = ctx.createLinearGradient(0, 226, 0, 350);
    win.addColorStop(0, '#0d0c12');
    win.addColorStop(1, '#050408');
    ctx.fillStyle = win;
    roundRect(ctx, 64, 226, 384, 124, 24);
    ctx.fill();
    ctx.fillStyle = '#3a2a20';
    ctx.beginPath();
    ctx.arc(HUB_UV[0][0], HUB_UV[0][1], 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(HUB_UV[1][0], HUB_UV[1][1], 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(HUB_UV[0][0], 340, HUB_UV[1][0] - HUB_UV[0][0], 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, 72, 230, 368, 14, 7);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [x, y] of [[10, 362], [502, 362], [36, 214], [476, 214]]) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function cassetteSpine(track: Track) {
  return canvasTexture(512, 48, (ctx) => {
    ctx.fillStyle = track.color;
    ctx.fillRect(0, 0, 512, 48);
    ctx.fillStyle = '#15131a';
    ctx.font = `800 26px ${SANS}`;
    ctx.fillText(`PGM ${track.pgm}`, 16, 34);
    ctx.textAlign = 'right';
    ctx.font = `700 22px ${SANS}`;
    ctx.fillText(track.title.toUpperCase(), 496, 33);
  });
}

/** Outer short end of the cassette: what faces you on the changer. */
export function cassetteEnd(track: Track) {
  return canvasTexture(64, 384, (ctx) => {
    ctx.fillStyle = track.color;
    ctx.fillRect(0, 0, 64, 384);
    ctx.fillStyle = '#f3ede0';
    ctx.fillRect(8, 40, 48, 304);
    ctx.translate(32, 192);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#15131a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 40px ${SANS}`;
    ctx.fillText(String(track.pgm), 0, 2);
  });
}

/* ------------------------------------------------------------ carousel */

/**
 * Brushed platter top, drawn in platter space: canvas x = +x, canvas y = +z.
 * `angleOf(i)` gives each slot's angle (from +z towards +x).
 */
export function platterTexture(slots: number, angleOf: (i: number) => number, radius: number, inner: number, outer: number) {
  const S = 1024;
  const k = S / 2 / radius;
  return canvasTexture(S, S, (ctx) => {
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#b9b9c0';
    ctx.beginPath();
    ctx.arc(0, 0, S / 2, 0, Math.PI * 2);
    ctx.fill();
    for (let r = 4; r < S / 2; r += 1.5) {
      const v = 165 + Math.random() * 50;
      ctx.strokeStyle = `rgba(${v},${v},${v + 6},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Slot guides: a darker pad with two rails for each cassette.
    for (let i = 0; i < slots; i++) {
      const a = angleOf(i);
      ctx.save();
      ctx.rotate(-a + Math.PI / 2);
      ctx.fillStyle = 'rgba(30,30,40,0.18)';
      ctx.fillRect(inner * k, -0.2 * k, (outer - inner) * k, 0.4 * k);
      ctx.fillStyle = 'rgba(20,20,28,0.55)';
      ctx.fillRect(inner * k, -0.2 * k, (outer - inner) * k, 3);
      ctx.fillRect(inner * k, 0.2 * k - 3, (outer - inner) * k, 3);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(40,40,50,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, S / 2 - 3, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Centre dial with slot numbers, same mapping as `platterTexture`. */
export function dialTexture(slots: number, angleOf: (i: number) => number) {
  const S = 512;
  return canvasTexture(S, S, (ctx) => {
    ctx.translate(S / 2, S / 2);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, S / 2);
    g.addColorStop(0, '#e9e9ee');
    g.addColorStop(1, '#a9a9b2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, S / 2, 0, Math.PI * 2);
    ctx.fill();
    for (let r = 6; r < S / 2; r += 2) {
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#1d1b24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${SANS}`;
    for (let i = 0; i < slots; i++) {
      const rot = -angleOf(i) + Math.PI / 2;
      ctx.save();
      ctx.rotate(rot);
      ctx.fillRect(S / 2 - 26, -2, 20, 4);
      ctx.translate(S / 2 - 62, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(String(i + 1), 0, 0);
      ctx.restore();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a2833';
    ctx.beginPath();
    ctx.arc(0, 0, S / 2 - 96, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/* ---------------------------------------------------------- body print */

const PRINT = '#c9c2e6';

/** The SDAT wordmark: bold italic with the crossbar-less A from the anime. */
export function logoTexture() {
  return canvasTexture(512, 170, (ctx) => {
    ctx.fillStyle = PRINT;
    ctx.transform(1, 0, -0.22, 1, 30, 0);
    ctx.font = `900 150px ${SANS}`;
    ctx.fillText('SD', 20, 145);
    const x = 20 + ctx.measureText('SD').width + 6;
    ctx.beginPath();
    ctx.moveTo(x, 145);
    ctx.lineTo(x + 50, 18);
    ctx.lineTo(x + 86, 18);
    ctx.lineTo(x + 104, 145);
    ctx.lineTo(x + 72, 145);
    ctx.lineTo(x + 64, 60);
    ctx.lineTo(x + 32, 145);
    ctx.fill();
    ctx.fillText('T', x + 104, 145);
  });
}

export function platePrint() {
  return canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = PRINT;
    ctx.globalAlpha = 0.85;
    ctx.font = `700 30px ${SANS}`;
    ctx.textAlign = 'center';
    ['◀◀ AMS', 'PLAY', 'STOP', 'AMS ▶▶', 'OPEN'].forEach((t, i) => ctx.fillText(t, 140 + i * 200, 44));
    ctx.textAlign = 'left';
    ctx.globalAlpha = 0.55;
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText('DIGITAL AUDIO TAPE-CORDER  TCD-D26', 30, 200);
    ctx.fillRect(30, 150, 964, 3);
  });
}

export type IconName = 'prev' | 'play' | 'stop' | 'next' | 'open';

export function iconTexture(name: IconName) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = PRINT;
    const tri = (x: number, y: number, s: number, dir: 1 | -1) => {
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + dir * s * 1.3, y);
      ctx.lineTo(x, y + s);
      ctx.fill();
    };
    switch (name) {
      case 'play':
        tri(34, 64, 22, 1);
        ctx.fillRect(76, 42, 9, 44);
        ctx.fillRect(92, 42, 9, 44);
        break;
      case 'stop':
        ctx.fillRect(42, 42, 44, 44);
        break;
      case 'next':
        tri(30, 64, 20, 1);
        tri(58, 64, 20, 1);
        ctx.fillRect(88, 44, 8, 40);
        break;
      case 'prev':
        ctx.fillRect(32, 44, 8, 40);
        tri(70, 64, 20, -1);
        tri(98, 64, 20, -1);
        break;
      case 'open':
        ctx.beginPath();
        ctx.moveTo(64, 30);
        ctx.lineTo(96, 70);
        ctx.lineTo(32, 70);
        ctx.fill();
        ctx.fillRect(32, 82, 64, 10);
        break;
    }
  });
}
