/* -------------- LABELS ------------ */

function openLabelPanel() {
  document.getElementById("labelPanel").classList.remove("hidden");
  renderLabelGrid();
}

function closeLabelPanel() {
  document.getElementById("labelPanel").classList.add("hidden");
}

function renderLabelGrid() {
  const grid = document.getElementById("labelGrid");
  grid.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const cell = document.createElement("div");
    cell.className = "label-cell";

    if (i < labelStartIndex) {
      cell.classList.add("used");
    }

    if (i === labelStartIndex) {
      cell.classList.add("active");
    }

    cell.textContent = i + 1;

    cell.onclick = () => {
      labelStartIndex = i;
      renderLabelGrid();
    };

    grid.appendChild(cell);
  }
}

function confirmLabelPrint() {
  closeLabelPanel();
  generateLabelsPDF(labelStartIndex);
}




async function generateLabelsPDF(skip=0) {
  const config = LABEL_CONFIG[currentView];
  if (!config) {
    alert("Labels not supported for this view");
    return;
  }

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({
    unit: "in",
    format: "letter"
  });

  const items = config.getItems();

  if (!items.length) {
    alert("No items selected");
    return;
  }

  const labelsPerPage = 10;
  const labelWidth = 4;
  const labelHeight = 2;

  const marginX = 0.1875;
  const marginY = 0.5;
  const hgap = 0.125;

  let index = skip;

  for (let i = 0; i < items.length; i++) {
    const col = index % 2;
    const row = Math.floor(index % labelsPerPage / 2);

    if (i > 0 && index % labelsPerPage === 0) {
      doc.addPage();
      index = 0;
    }

    const x = marginX + col * (labelWidth+hgap);
    const y = marginY + row * labelHeight;

    await drawLabel(doc, items[i], x, y, config);
    
    index++;
  }

  window.open(doc.output("bloburl"));
  // doc.save("labels.pdf");
}

function drawFields(doc, item, config, textX, startY) {
  let textY = startY;

  function drawClipped(text, maxWidth, maxLines = 2) {
    const lines = doc.splitTextToSize(text || "", maxWidth).slice(0, maxLines);

    lines.forEach(line => {
      const dims = doc.getTextDimensions(line);
      doc.text(line, textX, textY + dims.h);
      textY += dims.h + 0.05;
    });

    textY += 0.05;
  }

  config.fields.forEach(field => {
    const value = item[field.key];
    if (!value) return;

    // style handling
    const fontSize = field.fontSize || (field.bold ? 14 : 12);
    const fontStyle = field.bold ? "bold" : "normal";

    doc.setFont(undefined, fontStyle);
    doc.setFontSize(fontSize);

    drawClipped(value, 2.3, field.maxLines || 2);
  });
}


async function drawLabel(doc, item, x, y, config) {
  const padding = 0.125; // 1/8 inch

  const labelWidth = 4;
  const labelHeight = 2;

  if (labelDrawBoundary) {
    // Draw outer label boundary
    doc.setDrawColor(180);   // light gray for debugging
    doc.setLineWidth(0.01);
    doc.rect(x, y, labelWidth, labelHeight);

    // Draw inner printable area (optional, inset by padding)
    doc.setDrawColor(220);
    doc.rect(
      x + padding,
      y + padding,
      labelWidth - (2 * padding),
      labelHeight - (2 * padding)
    );
  }

  const qrSize = 1.2;

  // QR canvas (temporary)
  const qrTemp = document.createElement("div");
  new QRCode(qrTemp, {
    text: config.buildQR(item),
    width: 200,
    height: 200
  });

  const img = qrTemp.querySelector("canvas").toDataURL("image/png");

  // QR LEFT SIDE
  doc.addImage(img,
    "PNG",
    x + padding,
    y + padding,
    qrSize,
    qrSize
  );

  // ID and supplemental info under QR and centered
  doc.setFontSize(12);

  const id = config.getId(item);

  let dims = doc.getTextDimensions(id);
  let textY = y + padding + qrSize + dims.h + 0.1;

  doc.text(
    id,
    x + padding + (qrSize - dims.w)/2,
    textY
  );

  // Supplemental info (e.g. Date)
  const supplement = config.getSupplemental?.(item);
  if (supplement) {
    dims = doc.getTextDimensions(supplement);
    textY += dims.h + 0.05;
    doc.text(
      supplement,
      x + padding + (qrSize - dims.w)/2,
      textY
    );
  }

  // RIGHT SIDE
  const textX = x + 1.5;
  textY = y + padding;

  drawFields(doc, item, config, textX, textY);
}
