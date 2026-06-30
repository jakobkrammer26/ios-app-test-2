/**
 * Utility to generate realistic mock receipt images on an HTML5 canvas.
 * Returns a base64 encoded data URL (image/png).
 */

export interface MockReceiptOption {
  key: string;
  name: string;
  category: "Fahrtkosten" | "Büro" | "Essen" | "Sonstiges";
  store: string;
  items: { name: string; price: number }[];
  remarks: string;
}

export const MOCK_RECEIPT_OPTIONS: MockReceiptOption[] = [
  {
    key: "tanken",
    name: "Shell Tankstelle (Tanken)",
    category: "Fahrtkosten",
    store: "Shell Station Berlin",
    items: [
      { name: "Super E10 (42,5 Liter)", price: 74.38 },
      { name: "Coca Cola 0.5l", price: 2.89 },
      { name: "Pfand", price: 0.25 }
    ],
    remarks: "Firmentransporter getankt"
  },
  {
    key: "buero",
    name: "Staples Bürobedarf (Büro)",
    category: "Büro",
    store: "Staples Business Center",
    items: [
      { name: "Briefblock DIN A4 5er", price: 12.99 },
      { name: "Kugelschreiber Gel 10er", price: 8.50 },
      { name: "Kopierpapier 500 Blatt", price: 6.99 }
    ],
    remarks: "Bürobedarf für das Quartal"
  },
  {
    key: "essen",
    name: "Restaurant Ratskeller (Essen)",
    category: "Essen",
    store: "Ratskeller Restaurant & Café",
    items: [
      { name: "2x Mittagsmenü Business", price: 34.00 },
      { name: "1x Apfelschorle 0.4l", price: 4.20 },
      { name: "1x Mineralwasser 0.75l", price: 6.80 },
      { name: "Trinkgeld 10%", price: 4.50 }
    ],
    remarks: "Kundenmeeting mit Herrn Weber"
  },
  {
    key: "sonstiges",
    name: "MediaMarkt (Sonstiges)",
    category: "Sonstiges",
    store: "MediaMarkt Hamburg-Altona",
    items: [
      { name: "Logitech Ergonomic Mouse", price: 79.99 },
      { name: "USB-C Ladekabel 2m", price: 14.99 },
      { name: "Batterien AAA 8er Pack", price: 5.49 }
    ],
    remarks: "Ersatzmaus für das Notebook"
  }
];

export function generateReceiptImage(option: MockReceiptOption, dateStr: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 550;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Draw Receipt Paper Background (light crumpled paper/off-white texture)
  ctx.fillStyle = "#FAF9F5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add paper grain/noise
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const alpha = Math.random() * 0.04;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Draw paper margins side shadows
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  ctx.fillRect(0, 0, 8, canvas.height);
  ctx.fillRect(canvas.width - 8, 0, 8, canvas.height);

  // 2. Set Fonts
  // We use standard system monospace to simulate a thermal dot-matrix printer
  ctx.fillStyle = "#1E293B"; // Dark ink
  
  // Header / Store name
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText(option.store.toUpperCase(), canvas.width / 2, 45);

  ctx.font = "12px monospace";
  ctx.fillText("UST-IDNR: DE987654321", canvas.width / 2, 65);
  ctx.fillText("STRASSE 42, 10115 BERLIN", canvas.width / 2, 80);
  ctx.fillText("Vielen Dank für Ihren Besuch!", canvas.width / 2, 95);

  // Divider
  ctx.textAlign = "left";
  ctx.font = "12px monospace";
  ctx.fillText("-".repeat(48), 20, 115);

  // 3. Date & Time
  ctx.fillText(`DATUM: ${dateStr}`, 20, 135);
  ctx.fillText("UHRZEIT: 14:32:05", 20, 150);
  ctx.fillText(`BELEG-NR: ${Math.floor(100000 + Math.random() * 900000)}`, 20, 165);

  ctx.fillText("-".repeat(48), 20, 185);

  // 4. Draw Items
  let currentY = 210;
  let total = 0;

  option.items.forEach((item) => {
    ctx.font = "12px monospace";
    ctx.fillText(item.name.substring(0, 24), 20, currentY);
    
    const priceStr = item.price.toFixed(2) + " EUR";
    ctx.textAlign = "right";
    ctx.fillText(priceStr, canvas.width - 20, currentY);
    ctx.textAlign = "left";
    
    total += item.price;
    currentY += 22;
  });

  // Divider before total
  ctx.fillText("-".repeat(48), 20, currentY + 5);
  currentY += 25;

  // 5. Total
  ctx.font = "bold 15px monospace";
  ctx.fillText("GESAMTSUMME", 20, currentY);
  
  ctx.textAlign = "right";
  const totalStr = total.toFixed(2) + " EUR";
  ctx.fillText(totalStr, canvas.width - 20, currentY);
  ctx.textAlign = "left";

  currentY += 25;

  // VAT (MwSt.) breakdown info
  ctx.font = "10px monospace";
  const mwst = total * 0.19;
  ctx.fillText(`inkl. 19% MwSt.   ${mwst.toFixed(2)} EUR`, 20, currentY);
  
  currentY += 25;
  ctx.fillText("-".repeat(48), 20, currentY);
  
  // 6. Draw a mock barcode at the bottom
  currentY += 20;
  ctx.fillStyle = "#0f172a";
  const barcodeX = 60;
  const barcodeWidth = canvas.width - 120;
  const barcodeHeight = 35;
  
  // Generate random barcode lines
  let bX = barcodeX;
  while (bX < barcodeX + barcodeWidth) {
    const lineWidth = Math.random() > 0.4 ? (Math.random() > 0.5 ? 3 : 1) : 2;
    const gap = Math.floor(Math.random() * 3) + 1;
    ctx.fillRect(bX, currentY, lineWidth, barcodeHeight);
    bX += lineWidth + gap;
  }

  // Draw code numbers
  ctx.fillStyle = "#1E293B";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("* 4 0 1 2 3 4 5 6 7 8 9 0 *", canvas.width / 2, currentY + barcodeHeight + 12);

  return canvas.toDataURL("image/png");
}
