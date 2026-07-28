import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { extractCandidate, normalizeText } from "./selection-candidate.js";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const input = document.querySelector("#pdf-file");
const status = document.querySelector("#file-status");
const viewerPanel = document.querySelector("#viewer-panel");
const canvas = document.querySelector("#pdf-canvas");
const textLayer = document.querySelector("#text-layer");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");
const selectionPanel = document.querySelector("#selection-panel");

let pdfDocument = null;
let currentPage = 1;
let currentPageText = "";
let titleTapStart = null;

function showCandidate(selected, selectedLine = "") {
  const candidate = extractCandidate({ selectedText: selected, selectedLine, pageText: currentPageText });
  document.querySelector("#selected-text").textContent = selected;
  document.querySelector("#candidate-text").textContent = candidate.text;
  document.querySelector("#candidate-source").textContent = `Current PDF page ${currentPage}; memory only.`;
  document.querySelector("#candidate-assessment").textContent = candidate.requiresConfirmation
    ? "Confirmation required: ambiguous or incomplete candidates are not saved."
    : "Complete local candidate; this prototype still does not save it.";
  selectionPanel.hidden = false;
}

function firstTextLayerLineTop() {
  const first = [...textLayer.querySelectorAll("span")].find(span => normalizeText(span.textContent));
  return first ? first.getBoundingClientRect().top : null;
}

function wordAtHorizontalPoint(span, clientX) {
  const textNode = span.firstChild;
  const text = String(textNode?.textContent || "");
  if (!textNode || !text.trim()) return "";
  let offset = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < text.length; index += 1) {
    const range = document.createRange();
    range.setStart(textNode, index);
    range.setEnd(textNode, index + 1);
    const rect = range.getBoundingClientRect();
    const distance = Math.abs(clientX - (rect.left + rect.right) / 2);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      offset = index;
    }
  }
  const before = text.slice(0, offset + 1);
  const start = Math.max(before.lastIndexOf(" ") + 1, 0);
  const after = text.slice(offset);
  const endSpace = after.indexOf(" ");
  const end = endSpace < 0 ? text.length : offset + endSpace;
  return normalizeText(text.slice(start, end).replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""));
}

function selectedTextLayerLine(selection) {
  if (!selection?.rangeCount) return "";
  const anchor = (selection.anchorNode?.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentElement
    : selection.anchorNode)?.closest?.("span");
  if (!anchor || !textLayer.contains(anchor)) return "";
  const top = anchor.getBoundingClientRect().top;
  return normalizeText([...textLayer.querySelectorAll("span")]
    .filter(span => Math.abs(span.getBoundingClientRect().top - top) < 2)
    .map(span => span.textContent)
    .join(" "));
}

function setStatus(message) {
  status.textContent = message;
}

function clearSelection() {
  selectionPanel.hidden = true;
  window.getSelection()?.removeAllRanges();
}

function localErrorDetails(error) {
  const name = String(error?.name || "UnknownError").replace(/[^A-Za-z]/g, "");
  const category = /Password/i.test(name) ? "PasswordProtected"
    : /InvalidPDF/i.test(name) ? "InvalidPDF"
      : /MissingPDF/i.test(name) ? "MissingPDF"
        : (name || "UnknownError");
  const message = String(error?.message || "")
    .replace(/[^A-Za-z0-9 .,:()_\-]/g, "")
    .slice(0, 140);
  return message ? `${category}: ${message}` : category;
}

function pageTextFromItems(items) {
  const lines = [];
  let line = null;
  for (const item of items) {
    const text = String(item.str || "");
    const y = Number(item.transform?.[5]);
    if (!text) continue;
    if (line && Number.isFinite(y) && Math.abs(line.y - y) > 2) {
      lines.push(line.parts.join(" "));
      line = null;
    }
    if (!line) line = { y, parts: [] };
    line.parts.push(text);
  }
  if (line) lines.push(line.parts.join(" "));
  return lines.join("\n");
}

async function renderPage(pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(window.innerWidth - 32, 720) / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  await page.render({
    canvasContext: canvas.getContext("2d", { alpha: false }),
    viewport,
    transform: [outputScale, 0, 0, outputScale, 0, 0]
  }).promise;

  const textContent = await page.getTextContent();
  currentPageText = pageTextFromItems(textContent.items);
  textLayer.replaceChildren();
  textLayer.style.width = `${Math.floor(viewport.width)}px`;
  textLayer.style.height = `${Math.floor(viewport.height)}px`;
  await new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayer,
    viewport
  }).render();

  currentPage = pageNumber;
  pageStatus.textContent = `Page ${currentPage} of ${pdfDocument.numPages}`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pdfDocument.numPages;
}

async function openLocalPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  pdfDocument?.destroy();
  pdfDocument = await pdfjsLib.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true
  }).promise;
  viewerPanel.hidden = false;
  await renderPage(1);
}

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;
  if (file.type && file.type !== "application/pdf") {
    setStatus("Choose a PDF file. Nothing was read, uploaded, or saved.");
    return;
  }
  try {
    setStatus("Reading the PDF only in this browser...");
    await openLocalPdf(file);
    setStatus("PDF opened locally. Refreshing clears it.");
  }
  catch (error) {
    pdfDocument = null;
    viewerPanel.hidden = true;
    setStatus(`Cannot read this PDF locally (${localErrorDetails(error)}). No file was uploaded or saved.`);
    console.error(error);
  }
});

previousButton.addEventListener("click", () => {
  clearSelection();
  renderPage(currentPage - 1).catch(error => setStatus(`Cannot render page (${localErrorDetails(error)}).`));
});
nextButton.addEventListener("click", () => {
  clearSelection();
  renderPage(currentPage + 1).catch(error => setStatus(`Cannot render page (${localErrorDetails(error)}).`));
});
document.querySelector("#dismiss-selection").addEventListener("click", clearSelection);

document.addEventListener("selectionchange", () => {
  if (titleTapStart) return;
  const selection = window.getSelection();
  const selected = normalizeText(selection?.toString());
  if (!selected || !textLayer.contains(selection?.anchorNode)) return;
  showCandidate(selected, selectedTextLayerLine(selection));
});

textLayer.addEventListener("pointerdown", event => {
  const span = event.target.closest?.("span");
  const firstLineTop = firstTextLayerLineTop();
  if (!span || firstLineTop === null || Math.abs(span.getBoundingClientRect().top - firstLineTop) >= 2) return;
  titleTapStart = { x: event.clientX, y: event.clientY };
  event.preventDefault();
});

textLayer.addEventListener("pointerup", event => {
  const start = titleTapStart;
  titleTapStart = null;
  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
  const span = event.target.closest?.("span");
  const firstLineTop = firstTextLayerLineTop();
  if (!span || firstLineTop === null || Math.abs(span.getBoundingClientRect().top - firstLineTop) >= 2) return;
  const selected = wordAtHorizontalPoint(span, event.clientX);
  const heading = normalizeText(currentPageText.split("\n", 1)[0]);
  if (selected && heading) {
    window.getSelection()?.removeAllRanges();
    showCandidate(selected, heading);
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    setStatus("The offline shell is unavailable. Local PDFs still are not uploaded.");
  });
}
