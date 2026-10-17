import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** draw(x, y) must return [r, g, b] (0..255). */
export function createPng(width, height, draw) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = draw(x, y);
      const offset = rowStart + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function gradientPng(index, width = 1200, height = 900) {
  const palettes = [
    [
      [11, 107, 79],
      [214, 232, 219],
    ],
    [
      [27, 58, 87],
      [202, 219, 231],
    ],
    [
      [122, 62, 26],
      [246, 226, 202],
    ],
    [
      [74, 45, 90],
      [231, 219, 238],
    ],
    [
      [15, 82, 87],
      [204, 233, 230],
    ],
    [
      [99, 45, 45],
      [242, 216, 208],
    ],
  ];
  const [start, end] = palettes[index % palettes.length];
  const circleX = width * (0.25 + 0.12 * (index % 5));
  const circleY = height * 0.38;
  const radius = height * 0.32;
  return createPng(width, height, (x, y) => {
    const t = (x / width) * 0.45 + (y / height) * 0.55;
    let r = start[0] + (end[0] - start[0]) * t;
    let g = start[1] + (end[1] - start[1]) * t;
    let b = start[2] + (end[2] - start[2]) * t;
    const cx = x - circleX - width * 0.18;
    const cy = y - circleY;
    const dist = Math.sqrt(cx * cx + cy * cy);
    if (dist < radius) {
      const alpha = 0.22 * (1 - dist / radius);
      r = r * (1 - alpha) + 255 * alpha;
      g = g * (1 - alpha) + 255 * alpha;
      b = b * (1 - alpha) + 255 * alpha;
    }
    const lineY = height * 0.78;
    if (Math.abs(y - lineY + x * 0.06) < 5) {
      r = r * 0.55;
      g = g * 0.55;
      b = b * 0.55;
    }
    return [Math.round(r), Math.round(g), Math.round(b)];
  });
}
