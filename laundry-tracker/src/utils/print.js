import * as Print from "expo-print";
import { Alert } from "react-native";
import { encodeCode128B } from "./code128";

const getServiceLabel = (svcKey) => {
  switch (svcKey) {
    case "press_only":
      return "👔 PRESS ONLY";
    case "dry_clean":
      return "🧪 DRY CLEAN";
    case "wash_fold":
      return "🧼 WASH & FOLD";
    case "wash_press":
    default:
      return "🧺 WASH & PRESS";
  }
};

function renderBarcodeSVG(tagCode) {
  const { widths, bars } = encodeCode128B(tagCode);
  const moduleWidth = 2;
  const totalWidth = widths.reduce((a, b) => a + b, 0) * moduleWidth;

  let x = 0;
  let rects = "";
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * moduleWidth;
    if (bars[i]) {
      rects += `<rect x="${x}" y="0" width="${w}" height="60" fill="#000000" />`;
    }
    x += w;
  }

  return `
    <svg class="barcode-svg" viewBox="0 0 ${totalWidth} 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${totalWidth}" height="60" fill="#ffffff"/>
      ${rects}
    </svg>
  `;
}

export async function printBarcodeLabel({
  orderCode,
  customerName,
  tagsCount = 1,
  items = [],
  totalBill = 0,
}) {
  try {
    const code = orderCode || "LN-ORDER";
    const custName = customerName || "Customer";

    // Expand items into single individual garment entries if items array is provided
    const expandedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const name = it.item_types?.name || it.name || "Garment";
        const svc = it.service_type || "wash_press";
        for (let q = 0; q < qty; q++) {
          expandedItems.push({ name, service: svc });
        }
      });
    }

    const totalItemCount = expandedItems.length > 0 ? expandedItems.length : Math.max(1, Number(tagsCount) || 1);
    const targetTagCount = Math.max(1, Number(tagsCount) || 1);

    // Group items by service type for Service Bundle Tags
    const serviceBundles = {};
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const name = it.item_types?.name || it.name || "Garment";
        const svc = it.service_type || "wash_press";
        if (!serviceBundles[svc]) {
          serviceBundles[svc] = { service: svc, totalQty: 0, itemNames: [] };
        }
        serviceBundles[svc].totalQty += qty;
        if (!serviceBundles[svc].itemNames.includes(name)) {
          serviceBundles[svc].itemNames.push(name);
        }
      });
    }
    const bundleList = Object.values(serviceBundles);

    const pages = [];

    // --- 1. MAIN BAG TAG (Basket / Bag Label) ---
    const mainBarcodeSVG = renderBarcodeSVG(code);
    pages.push(`
      <div class="tag-page main-tag-page">
        <div class="tag-badge">🎒 MAIN BASKET TAG</div>
        <div class="header-name">${custName}</div>
        <div class="sub-info">${totalItemCount} Total Garments • Rs ${totalBill}</div>
        ${mainBarcodeSVG}
        <div class="code-text">${code}</div>
      </div>
    `);

    // --- 2. SERVICE BUNDLE vs INDIVIDUAL HANGER TAGS ---
    const isBundleMode = targetTagCount < totalItemCount && bundleList.length > 0;

    if (isBundleMode) {
      // Service Bundle Tag Mode (e.g. 5x Shirts - WASH & PRESS)
      const numBundles = Math.min(targetTagCount, bundleList.length);
      for (let t = 1; t <= numBundles; t++) {
        const bundle = bundleList[t - 1];
        const tagCode = `${code}-H${t}`;
        const barcodeSVG = renderBarcodeSVG(tagCode);
        const svcBadge = getServiceLabel(bundle.service);
        const itemsSummary = `${bundle.totalQty}x ${bundle.itemNames.join(", ")}`;

        pages.push(`
          <div class="tag-page item-tag-page">
            <div class="header-row">
              <span class="tag-num">BUNDLE TAG ${t} / ${numBundles}</span>
              <span class="cust-mini">${custName}</span>
            </div>
            <div class="svc-box">${svcBadge}</div>
            <div class="item-name">${itemsSummary}</div>
            ${barcodeSVG}
            <div class="code-text">${tagCode}</div>
          </div>
        `);
      }
    } else {
      // Individual Garment Hanger Tag Mode (TAG 1/N, TAG 2/N...)
      const numIndividual = expandedItems.length > 0 ? expandedItems.length : targetTagCount;
      for (let t = 1; t <= numIndividual; t++) {
        const tagCode = `${code}-H${t}`;
        const barcodeSVG = renderBarcodeSVG(tagCode);
        const itemInfo = expandedItems[t - 1] || { name: "Garment", service: "wash_press" };
        const svcBadge = getServiceLabel(itemInfo.service);

        pages.push(`
          <div class="tag-page item-tag-page">
            <div class="header-row">
              <span class="tag-num">TAG ${t} / ${numIndividual}</span>
              <span class="cust-mini">${custName}</span>
            </div>
            <div class="svc-box">${svcBadge}</div>
            <div class="item-name">${itemInfo.name}</div>
            ${barcodeSVG}
            <div class="code-text">${tagCode}</div>
          </div>
        `);
      }
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
              margin: 0;
              padding: 0;
              background-color: #ffffff;
            }
            .tag-page {
              width: 100vw;
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 6px;
              page-break-after: always;
              text-align: center;
            }
            .tag-badge {
              font-size: 11px;
              font-weight: 900;
              background: #000;
              color: #fff;
              padding: 2px 8px;
              border-radius: 4px;
              margin-bottom: 2px;
              letter-spacing: 1px;
            }
            .header-name {
              font-size: 16px;
              font-weight: 800;
              color: #000;
              margin-top: 2px;
              max-width: 90%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .sub-info {
              font-size: 12px;
              font-weight: 700;
              color: #333;
              margin-bottom: 4px;
            }
            .header-row {
              width: 95%;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              font-weight: 800;
              border-bottom: 1px solid #000;
              padding-bottom: 2px;
              margin-bottom: 3px;
            }
            .tag-num {
              background: #000;
              color: #fff;
              padding: 1px 4px;
              border-radius: 2px;
            }
            .cust-mini {
              color: #111;
              max-width: 120px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .svc-box {
              font-size: 15px;
              font-weight: 900;
              color: #000;
              margin-top: 2px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .item-name {
              font-size: 14px;
              font-weight: 700;
              color: #222;
              margin-bottom: 2px;
            }
            .barcode-svg {
              display: block;
              width: 95%;
              max-width: 240px;
              height: 52px;
              margin: 0 auto;
            }
            .code-text {
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 1.5px;
              color: #000;
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          ${pages.join("")}
        </body>
      </html>
    `;

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

