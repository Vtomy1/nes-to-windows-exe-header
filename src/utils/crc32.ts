/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Precomputed CRC32 table
let crcTable: Uint32Array | null = null;

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
}

export function computeCrc32(data: Uint8Array): string {
  if (!crcTable) {
    crcTable = makeCrcTable();
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  const result = (crc ^ -1) >>> 0;
  return result.toString(16).toUpperCase().padStart(8, '0');
}
