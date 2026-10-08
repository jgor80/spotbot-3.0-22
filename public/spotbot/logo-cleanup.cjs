// Makes uploaded logos sit seamlessly on graphics: a flat backdrop box (white square, solid fill)
// connected to the image edge is knocked out to transparency, then the crest is trimmed to its shape.
const zlib = require('zlib');
const { Resvg } = require('@resvg/resvg-js');

const SIZE = 640;
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
function encodePng(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Returns a transparent, trimmed PNG data URL; returns the input unchanged if it cannot be processed.
function seamlessLogo(dataUrl) {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}"><image xlink:href="${dataUrl}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid meet"/></svg>`;
    const px = Buffer.from(new Resvg(svg).render().pixels);
    const W = SIZE, H = SIZE, at = (x, y) => (y * W + x) * 4;
    // resvg returns premultiplied RGBA; PNG needs straight alpha.
    for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (a && a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.round(px[i + c] * 255 / a)); }
    // Opaque bounding box = the uploaded image's own frame.
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[at(x, y) + 3] > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return dataUrl;
    // Peel hairline frame/scan lines on the image edge so they never show as a stray rule.
    const peel = Math.max(2, Math.round((x1 - x0) * 0.006));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < x0 + peel || x > x1 - peel || y < y0 + peel || y > y1 - peel) px[at(x, y) + 3] = 0;
    const transparent = (x, y) => x < 0 || y < 0 || x >= W || y >= H || px[at(x, y) + 3] < 24;
    let knocked = false;
    // Two passes: the outer square, then e.g. a flat white disc inside it.
    for (let pass = 0; pass < 2; pass++) {
      const edge = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (transparent(x, y)) continue;
        if (transparent(x + 1, y) || transparent(x - 1, y) || transparent(x, y + 1) || transparent(x, y - 1)) edge.push([x, y]);
      }
      if (edge.length < 40) break;
      const idx = edge.map(([x, y]) => at(x, y));
      const bg = [0, 1, 2].map((c) => idx.map((i) => px[i + c]).sort((a, b) => a - b)[idx.length >> 1]);
      const dist = (i) => Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2]));
      // Only a uniform outline is a backdrop; a crest's own varied edge is left alone.
      if (idx.filter((i) => dist(i) < 24).length < idx.length * (pass ? 0.85 : 0.6)) break;
      const seen = new Uint8Array(W * H), stack = edge.slice();
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x; if (seen[k]) continue; seen[k] = 1;
        const i = k * 4; if (px[i + 3] < 24) continue;
        const d = dist(i);
        if (d >= 40) continue;
        // Hard knock-out for the flat fill, feathered alpha on the anti-aliased edge.
        knocked = true;
        px[i + 3] = d < 18 ? 0 : Math.round(px[i + 3] * (d - 18) / 22);
        if (d < 18) stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
    // Sticker-cut outline in the backdrop colour: keeps dark crest parts readable on dark art and
    // fills the gaps the knock-out opened, so it reads as an intentional die-cut badge.
    if (knocked) {
      const r = Math.max(4, Math.round((x1 - x0) * 0.022)), alpha = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) alpha[k] = px[k * 4 + 3];
      const rows = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let dx = -r; dx <= r && m < 255; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) m = Math.max(m, alpha[y * W + xx]); } rows[y * W + x] = m; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = 0; for (let dy = -r; dy <= r && m < 255; dy++) { const yy = y + dy; if (yy >= 0 && yy < H) m = Math.max(m, rows[yy * W + x]); }
        const i = at(x, y), a = px[i + 3] / 255, o = m / 255;
        if (o <= a) continue;
        // Composite crest over a white outline.
        const outA = a + o * (1 - a);
        for (let c = 0; c < 3; c++) px[i + c] = Math.round((px[i + c] * a + 255 * o * (1 - a)) / outA);
        px[i + 3] = Math.round(outA * 255);
      }
    }
    // Trim to the visible crest with a small margin.
    let tx0 = W, ty0 = H, tx1 = -1, ty1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[at(x, y) + 3] > 24) { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
    if (tx1 < 0) return dataUrl;
    const pad = Math.round(Math.max(tx1 - tx0, ty1 - ty0) * 0.03);
    tx0 = Math.max(0, tx0 - pad); ty0 = Math.max(0, ty0 - pad); tx1 = Math.min(W - 1, tx1 + pad); ty1 = Math.min(H - 1, ty1 + pad);
    const side = Math.max(tx1 - tx0 + 1, ty1 - ty0 + 1);
    const out = Buffer.alloc(side * side * 4);
    const ox = (side - (tx1 - tx0 + 1)) >> 1, oy = (side - (ty1 - ty0 + 1)) >> 1;
    for (let y = ty0; y <= ty1; y++) px.copy(out, ((y - ty0 + oy) * side + ox) * 4, at(tx0, y), at(tx1, y) + 4);
    return `data:image/png;base64,${encodePng(out, side, side).toString('base64')}`;
  } catch {
    return dataUrl;
  }
}

module.exports = { seamlessLogo };
