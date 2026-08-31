import * as Print from "expo-print";
import { Alert } from "react-native";
import { encodeCode128B } from "./code128";

export async function printBarcodeLabel({ orderCode, customerName }) {
  try {
    const code = orderCode || "LN-ORDER";
    const { widths, bars } = encodeCode128B(code);
    const moduleWidth = 2;
    const totalWidth = widths.reduce((a, b) => a + b, 0) * moduleWidth;

    let x = 0;
    let rects = "";
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i] * moduleWidth;
      if (bars[i]) {
        rects += `<rect x="${x}" y="0" width="${w}" height="80" fill="#000000" />`;
      }
      x += w;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page {
              size: 70mm 48mm;
              margin: 0;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
              text-align: center;
              padding: 8px 6px;
              margin: 0;
              background-color: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            .name {
              font-size: 22px;
              font-weight: 800;
              color: #000000;
              margin-bottom: 6px;
            }
            .barcode-svg {
              display: block;
              width: 95%;
              max-width: 240px;
              height: 75px;
              margin: 0 auto;
            }
            .code {
              font-size: 20px;
              font-weight: 800;
              letter-spacing: 3px;
              color: #000000;
              margin-top: 6px;
            }
          </style>
        <body>
          <div class="name">${customerName || "Customer"}</div>
          <svg class="barcode-svg" viewBox="0 0 ${totalWidth} 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="${totalWidth}" height="80" fill="#ffffff"/>
            ${rects}
          </svg>
          <div class="code">${code}</div>
        </body>
      </html>
    `;

    // Generate tag-sized PDF (70mm x 48mm sticker format)
    const file = await Print.printToFileAsync({
      html,
      width: 260,
      height: 175,
    });
    await Print.printAsync({ uri: file.uri });
  } catch (e) {
    Alert.alert("Print Error", e.message);
  }
}
