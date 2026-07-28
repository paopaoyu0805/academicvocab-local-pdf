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
const lemmaRow = document.createElement("div");
lemmaRow.innerHTML = "<dt>原形</dt><dd id=\"lemma-text\"></dd>";
document.querySelector("#selected-text").parentElement.after(lemmaRow);

let pdfDocument = null;
let currentPage = 1;
let currentPageText = "";
let titleTapStart = null;
let suppressNativeSelectionUntil = 0;
let wordNormalizerPromise = null;
const pageTextCache = new Map();

function contextPageText(text) {
  const lines = String(text || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (/\bpage\s+\d+\b/i.test(lines[0] || "")) lines.shift();
  if (/^\d+$/.test(lines.at(-1) || "")) lines.pop();
  return lines.join("\n");
}

async function getPageText(pageNumber) {
  if (pageTextCache.has(pageNumber)) return pageTextCache.get(pageNumber);
  const page = await pdfDocument.getPage(pageNumber);
  const text = pageTextFromItems((await page.getTextContent()).items);
  pageTextCache.set(pageNumber, text);
  return text;
}

async function candidateContextText() {
  const pages = [];
  if (currentPage > 1) pages.push(await getPageText(currentPage - 1));
  pages.push(currentPageText);
  if (currentPage < pdfDocument.numPages) pages.push(await getPageText(currentPage + 1));
  const cleaned = pages.map(contextPageText).filter(Boolean);
  return cleaned.reduce((combined, nextPage) => {
    if (!combined) return nextPage;
    const previousEndsWithoutPunctuation = !/[.!?]$/.test(combined.trim());
    const nextStartsLowercase = /^[a-z]/.test(nextPage);
    const boundary = previousEndsWithoutPunctuation && !nextStartsLowercase ? "\n\f\n" : "\n";
    return `${combined}${boundary}${nextPage}`;
  }, "");
}

async function selectedLineMayContinue(selectedLine) {
  const line = normalizeText(selectedLine);
  if (!line || /[.!?]$/.test(line)) return false;
  const currentLines = contextPageText(currentPageText).split("\n").map(normalizeText).filter(Boolean);
  const lineIndex = currentLines.indexOf(line);
  if (lineIndex >= 0 && lineIndex < currentLines.length - 1) {
    return /^[a-z]/.test(currentLines[lineIndex + 1]);
  }
  if (lineIndex === currentLines.length - 1 && currentPage < pdfDocument.numPages) {
    const nextFirstLine = contextPageText(await getPageText(currentPage + 1)).split("\n").map(normalizeText).find(Boolean) || "";
    return /^[a-z]/.test(nextFirstLine);
  }
  return false;
}

async function showCandidate(selected, selectedLine = "", selectedLineIsHeading = false) {
  wordNormalizerPromise ||= import("./word-normalizer.js");
  const { normalizeWordForm } = await wordNormalizerPromise;
  const candidate = extractCandidate({
    selectedText: selected,
    selectedLine,
    selectedLineIsHeading,
    selectedLineMayContinue: await selectedLineMayContinue(selectedLine),
    pageText: await candidateContextText()
  });
  document.querySelector("#selected-text").textContent = selected;
  const wordForm = normalizeWordForm(selected, candidate.text);
  document.querySelector("#lemma-text").textContent = wordForm.ambiguous
    ? `${wordForm.lemma}（另一个可能：${wordForm.alternatives.join("、")}）`
    : wordForm.lemma;
  document.querySelector("#candidate-text").textContent = candidate.text;
  document.querySelector("#candidate-source").textContent = `Current PDF page ${currentPage}; memory only.`;
  document.querySelector("#candidate-assessment").textContent = candidate.requiresConfirmation || wordForm.ambiguous
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
  return normalizeText(text.slice(start, end).replace(/^[^A-Za-z-]+|[^A-Za-z-]+$/g, ""));
}

function expandHyphenatedTapWord(word) {
  if (!word.endsWith("-")) return word;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = currentPageText.match(new RegExp(`${escaped}\\s*\\n\\s*([A-Za-z]+)`));
  return continuation ? `${word.slice(0, -1)}${continuation[1]}` : word;
}

function textLayerLineForSpan(span) {
  const top = span.getBoundingClientRect().top;
  return normalizeText([...textLayer.querySelectorAll("span")]
    .filter(item => Math.abs(item.getBoundingClientRect().top - top) < 2)
    .map(item => item.textContent)
    .join(" "));
}

function isHeadingSpan(span) {
  const firstLineTop = firstTextLayerLineTop();
  return firstLineTop !== null && Math.abs(span.getBoundingClientRect().top - firstLineTop) < 2;
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
  pageTextCache.set(pageNumber, currentPageText);
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
  pageTextCache.clear();
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
  if (titleTapStart || performance.now() < suppressNativeSelectionUntil) return;
  const selection = window.getSelection();
  const selected = normalizeText(selection?.toString());
  if (!selected || !textLayer.contains(selection?.anchorNode)) return;
  const anchor = (selection.anchorNode?.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentElement
    : selection.anchorNode)?.closest?.("span");
  void showCandidate(selected, selectedTextLayerLine(selection), Boolean(anchor && isHeadingSpan(anchor)));
});

textLayer.addEventListener("pointerdown", event => {
  const span = event.target.closest?.("span");
  if (!span) return;
  titleTapStart = { x: event.clientX, y: event.clientY };
  suppressNativeSelectionUntil = performance.now() + 800;
  event.preventDefault();
});

textLayer.addEventListener("pointerup", event => {
  const start = titleTapStart;
  titleTapStart = null;
  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
  const span = event.target.closest?.("span");
  if (!span) return;
  const selected = expandHyphenatedTapWord(wordAtHorizontalPoint(span, event.clientX));
  const line = textLayerLineForSpan(span);
  if (selected && line) {
    suppressNativeSelectionUntil = performance.now() + 800;
    window.getSelection()?.removeAllRanges();
    void showCandidate(selected, line, isHeadingSpan(span));
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    setStatus("The offline shell is unavailable. Local PDFs still are not uploaded.");
  });
}
