import { encodeCode128B } from "./code128";

/**
 * Generates a bulletproof 1-bit monochrome BMP Data URI from Code128 bar pattern.
 * This produces a real, standard bitmap image (data:image/bmp;base64,...)
 * that iOS AirPrint, WebKit, Android, and all webviews render natively 100% of the time.
 */
export function generateBarcodeBmpDataUri(text, moduleWidth = 2, height = 70) {
  const { widths, bars } = encodeCode128B(text || "LN-0000");

  // Build pixel array: 0 for black bar, 1 for white space
  const pixels = [];
  for (let i = 0; i < widths.length; i++) {
    const bit = bars[i] ? 0 : 1; // 0=black, 1=white
    const barWidth = widths[i] * moduleWidth;
    for (let w = 0; w < barWidth; w++) {
      pixels.push(bit);
    }
  }

  const width = pixels.length;
  const rowBytes = Math.ceil(width / 32) * 4; // 4-byte aligned
  const imageSize = rowBytes * height;
  const fileSize = 62 + imageSize;

  const buffer = new Uint8Array(fileSize);

  // --- BMP FILE HEADER (14 bytes) ---
  buffer[0] = 0x42; // 'B'
  buffer[1] = 0x4d; // 'M'
  // File size (4 bytes, little-endian)
  buffer[2] = fileSize & 0xff;
  buffer[3] = (fileSize >> 8) & 0xff;
  buffer[4] = (fileSize >> 16) & 0xff;
  buffer[5] = (fileSize >> 24) & 0xff;
  // Offset to pixel data = 62 (0x3E)
  buffer[10] = 62;

  // --- DIB HEADER (BITMAPINFOHEADER: 40 bytes) ---
  buffer[14] = 40; // DIB header size
  // Width (4 bytes)
  buffer[18] = width & 0xff;
  buffer[19] = (width >> 8) & 0xff;
  buffer[20] = (width >> 16) & 0xff;
  buffer[21] = (width >> 24) & 0xff;
  // Height (4 bytes, positive = bottom-up)
  buffer[22] = height & 0xff;
  buffer[23] = (height >> 8) & 0xff;
  buffer[24] = (height >> 16) & 0xff;
  buffer[25] = (height >> 24) & 0xff;
  // Color planes = 1
  buffer[26] = 1;
  // Bits per pixel = 1 (monochrome)
  buffer[28] = 1;
  // Image size (4 bytes)
  buffer[34] = imageSize & 0xff;
  buffer[35] = (imageSize >> 8) & 0xff;
  buffer[36] = (imageSize >> 16) & 0xff;
  buffer[37] = (imageSize >> 24) & 0xff;
  // Colors in palette = 2
  buffer[46] = 2;

  // --- COLOR PALETTE (8 bytes: 2 colors, B-G-R-A) ---
  // Color 0: Black (#000000)
  buffer[54] = 0; buffer[55] = 0; buffer[56] = 0; buffer[57] = 0;
  // Color 1: White (#FFFFFF)
  buffer[58] = 255; buffer[59] = 255; buffer[60] = 255; buffer[61] = 0;

  // --- PIXEL DATA (Bottom-up, 1 bit per pixel) ---
  for (let y = 0; y < height; y++) {
    const rowOffset = 62 + y * rowBytes;
    for (let x = 0; x < width; x++) {
      if (pixels[x] === 1) {
        const byteIndex = rowOffset + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        buffer[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  // Convert buffer to base64
  let binary = "";
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  const base64 = btoa(binary);

  return `data:image/bmp;base64,${base64}`;
}
