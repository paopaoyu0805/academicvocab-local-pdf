export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePageText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function removeLeadingUnpunctuatedHeading(text, needle) {
  const lineBreak = text.indexOf("\n");
  if (lineBreak < 1) return text;
  const heading = text.slice(0, lineBreak).trim();
  const body = text.slice(lineBreak + 1).trim();
  if (!/[.!?]$/.test(heading) && body.toLocaleLowerCase("en-US").includes(needle)) {
    return body;
  }
  return text;
}

function sentenceBounds(text, index) {
  const before = text.slice(0, index);
  const after = text.slice(index);
  const startMatch = before.match(/(?:^|[.!?\f])\s*([^.!?\f]*)$/);
  const endMatch = after.match(/^[\s\S]*?(?:[.!?](?=\s|$)|\f)/);
  return {
    start: startMatch ? index - startMatch[1].length : index,
    end: endMatch ? index + endMatch[0].length : index + after.length
  };
}

export function extractCandidate({
  selectedText,
  pageText,
  selectedLine = "",
  selectedLineIsHeading = false,
  selectedLineMayContinue = false
}) {
  const selected = normalizeText(selectedText);
  if (!selected) {
    return { text: "", confidence: "low", requiresConfirmation: true, reason: "empty_selection" };
  }
  const line = normalizeText(selectedLine);
  if (selectedLineIsHeading && line && !/[.!?]$/.test(line) && line.toLocaleLowerCase("en-US").includes(selected.toLocaleLowerCase("en-US"))) {
    return {
      text: line,
      confidence: "low",
      requiresConfirmation: true,
      reason: "heading_selection"
    };
  }
  if (!selectedLineIsHeading && line && !/[.!?]$/.test(line) && !selectedLineMayContinue
    && line.toLocaleLowerCase("en-US").includes(selected.toLocaleLowerCase("en-US"))) {
    return {
      text: line,
      confidence: "low",
      requiresConfirmation: true,
      reason: "punctuation_free_fragment"
    };
  }
  const needle = selected.toLocaleLowerCase("en-US");
  const source = removeLeadingUnpunctuatedHeading(normalizePageText(pageText), needle);
  if (!source) {
    return { text: selected, confidence: "low", requiresConfirmation: true, reason: "page_text_unavailable" };
  }
  const lower = source.toLocaleLowerCase("en-US");
  const lineLower = line.toLocaleLowerCase("en-US");
  const lineStart = line && lineLower.includes(needle) ? lower.indexOf(lineLower) : -1;
  const anchoredIndex = lineStart >= 0 ? lineStart + lineLower.indexOf(needle) : -1;
  const occurrences = anchoredIndex >= 0 ? 1 : lower.split(needle).length - 1;
  const index = anchoredIndex >= 0 ? anchoredIndex : lower.indexOf(needle);
  const bounds = sentenceBounds(source, index);
  const text = normalizeText(/[.!?]$/.test(selected) ? selected : source.slice(bounds.start, bounds.end));
  const complete = /[.!?]$/.test(text);
  const requiresConfirmation = occurrences !== 1 || !complete;
  return {
    text: text || selected,
    confidence: requiresConfirmation ? "low" : "high",
    requiresConfirmation,
    reason: occurrences !== 1 ? "ambiguous_selection" : (complete ? "complete_sentence" : "fragment")
  };
}
