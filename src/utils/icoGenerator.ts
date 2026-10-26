/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates a valid Windows .ico file containing a 32x32 RGBA icon from pixel data or an HTML canvas.
 */
export function generateIcoFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  // Resize or draw to 32x32
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = 32;
  iconCanvas.height = 32;
  const ctx = iconCanvas.getContext('2d');
  if (!ctx) return createDefaultRetroIco();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, 32, 32);
  const imgData = ctx.getImageData(0, 0, 32, 32);
  return generateIcoFromRgba(imgData.data, 32, 32);
}

export function generateIcoFromRgba(rgba: Uint8ClampedArray, width: number = 32, height: number = 32): Uint8Array {
  // ICO file structure:
  // ICONDIR: 6 bytes
  // ICONDIRENTRY: 16 bytes
  // BITMAPINFOHEADER: 40 bytes
  // XOR mask (raw 32-bit BGRA bottom-up): width * height * 4 bytes
  // AND mask (1-bit monochrome mask): ceil(width / 32) * 4 * height bytes
  
  const bpp = 32;
  const biWidth = width;
  const biHeight = height * 2; // For ICO, height in header is XOR + AND heights
  const xorSize = width * height * 4;
  const andRowBytes = Math.ceil(width / 32) * 4;
  const andSize = andRowBytes * height;
  const imageSize = 40 + xorSize + andSize;

  const totalSize = 6 + 16 + imageSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // --- ICONDIR (6 bytes) ---
  view.setUint16(0, 0, true); // Reserved (must be 0)
  view.setUint16(2, 1, true); // Type (1 for icon, 2 for cursor)
  view.setUint16(4, 1, true); // Count of images (1)

  // --- ICONDIRENTRY (16 bytes) ---
  buffer[6] = width >= 256 ? 0 : width; // Width
  buffer[7] = height >= 256 ? 0 : height; // Height
  buffer[8] = 0; // Color count (0 if >= 8bpp)
  buffer[9] = 0; // Reserved (0)
  view.setUint16(10, 1, true); // Color planes (1)
  view.setUint16(12, bpp, true); // Bits per pixel (32)
  view.setUint32(14, imageSize, true); // Size of image data
  view.setUint32(18, 22, true); // Offset of image data (6 + 16 = 22)

  // --- BITMAPINFOHEADER (40 bytes) at offset 22 ---
  let offset = 22;
  view.setUint32(offset + 0, 40, true); // biSize
  view.setInt32(offset + 4, biWidth, true); // biWidth
  view.setInt32(offset + 8, biHeight, true); // biHeight
  view.setUint16(offset + 12, 1, true); // biPlanes
  view.setUint16(offset + 14, bpp, true); // biBitCount (32)
  view.setUint32(offset + 16, 0, true); // biCompression (BI_RGB = 0)
  view.setUint32(offset + 20, xorSize + andSize, true); // biSizeImage
  view.setInt32(offset + 24, 0, true); // biXPelsPerMeter
  view.setInt32(offset + 28, 0, true); // biYPelsPerMeter
  view.setUint32(offset + 32, 0, true); // biClrUsed
  view.setUint32(offset + 36, 0, true); // biClrImportant
  offset += 40;

  // --- XOR bitmap (BGRA, bottom-to-top) ---
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = rgba[srcIdx + 0];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];
      const a = rgba[srcIdx + 3];

      buffer[offset + 0] = b; // Blue
      buffer[offset + 1] = g; // Green
      buffer[offset + 2] = r; // Red
      buffer[offset + 3] = a; // Alpha
      offset += 4;
    }
  }

  // --- AND mask (all zeros for 32-bit transparent alpha) ---
  for (let i = 0; i < andSize; i++) {
    buffer[offset + i] = 0x00;
  }

  return buffer;
}

/**
 * Creates an authentic default 32x32 NES Cartridge icon in 32-bit RGBA.
 */
export function createDefaultRetroIco(): Uint8Array {
  const width = 32;
  const height = 32;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Draw an authentic gray NES cartridge with label
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Cartridge boundary
      if (x >= 4 && x <= 27 && y >= 2 && y <= 29) {
        // Border shadow
        if (x === 4 || x === 27 || y === 2 || y === 29) {
          rgba[idx] = 40;
          rgba[idx + 1] = 40;
          rgba[idx + 2] = 40;
          rgba[idx + 3] = 255;
        } else if (y >= 8 && y <= 23 && x >= 7 && x <= 24) {
          // Inner game label
          if (y >= 10 && y <= 15) {
            // Gold / Red title banner
            rgba[idx] = 220;
            rgba[idx + 1] = 38;
            rgba[idx + 2] = 38;
            rgba[idx + 3] = 255;
          } else {
            // Label art background
            rgba[idx] = 245;
            rgba[idx + 1] = 158;
            rgba[idx + 2] = 11;
            rgba[idx + 3] = 255;
          }
        } else if (x >= 5 && x <= 6 && y >= 6 && y <= 25) {
          // Left cartridge grip ridges
          const ridge = y % 3 === 0;
          const c = ridge ? 80 : 130;
          rgba[idx] = c;
          rgba[idx + 1] = c;
          rgba[idx + 2] = c;
          rgba[idx + 3] = 255;
        } else {
          // Classic gray NES cartridge plastic
          rgba[idx] = 156;
          rgba[idx + 1] = 163;
          rgba[idx + 2] = 175;
          rgba[idx + 3] = 255;
        }
      } else {
        // Transparent outside cartridge
        rgba[idx + 3] = 0;
      }
    }
  }

  return generateIcoFromRgba(rgba, width, height);
}
