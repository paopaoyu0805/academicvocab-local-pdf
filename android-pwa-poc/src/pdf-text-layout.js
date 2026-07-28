function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function groupVisualTextLines(items, pageWidth) {
  const rows = [];
  for (const item of items) {
    const text = cleanText(item.text);
    if (!text || !Number.isFinite(item.top) || !Number.isFinite(item.left)) continue;
    let row = rows.find(candidate => Math.abs(candidate.top - item.top) < 2);
    if (!row) {
      row = { top: item.top, items: [] };
      rows.push(row);
    }
    row.items.push({ ...item, text });
  }

  const gapThreshold = Math.max(24, Number(pageWidth || 0) * 0.08);
  const lines = [];
  for (const row of rows) {
    const sorted = row.items.sort((left, right) => left.left - right.left);
    let segment = [];
    let previousRight = null;
    for (const item of sorted) {
      if (segment.length && item.left - previousRight > gapThreshold) {
        lines.push(makeLine(row.top, segment));
        segment = [];
      }
      segment.push(item);
      previousRight = Math.max(previousRight ?? item.right ?? item.left, item.right ?? item.left);
    }
    if (segment.length) lines.push(makeLine(row.top, segment));
  }
  return lines;
}

function makeLine(top, items) {
  return {
    top,
    left: Math.min(...items.map(item => item.left)),
    right: Math.max(...items.map(item => item.right ?? item.left)),
    text: cleanText(items.map(item => item.text).join(" ")),
    items
  };
}

export function orderTextLinesForReading(lines, pageWidth) {
  const ordered = [...lines].sort((left, right) => left.top - right.top || left.left - right.left);
  const midpoint = Number(pageWidth || 0) / 2;
  const rows = [];
  for (const line of ordered) {
    let row = rows.find(candidate => Math.abs(candidate.top - line.top) < 2);
    if (!row) {
      row = { top: line.top, lines: [] };
      rows.push(row);
    }
    row.lines.push(line);
  }

  const dualColumnRows = rows.filter(row =>
    row.lines.some(line => line.left < midpoint)
    && row.lines.some(line => line.left >= midpoint)
  );
  if (dualColumnRows.length < 2) return ordered;

  const columnStart = dualColumnRows[0].top;
  const header = ordered.filter(line => line.top < columnStart - 2);
  const body = ordered.filter(line => line.top >= columnStart - 2 && !/^\d+$/.test(line.text));
  const footer = ordered.filter(line => line.top >= columnStart - 2 && /^\d+$/.test(line.text));
  const leftColumn = body.filter(line => line.left < midpoint);
  const rightColumn = body.filter(line => line.left >= midpoint);
  return [...header, ...leftColumn, ...rightColumn, ...footer];
}

