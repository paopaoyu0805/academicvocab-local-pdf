export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePageText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
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
  const startMatch = before.match(/(?:^|[.!?])\s*([^.!?]*)$/);
  const endMatch = after.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return {
    start: startMatch ? index - startMatch[1].length : index,
    end: endMatch ? index + endMatch[0].length : index + after.length
  };
}

export function extractCandidate({ selectedText, pageText, selectedLine = "" }) {
  const selected = normalizeText(selectedText);
  if (!selected) {
    return { text: "", confidence: "low", requiresConfirmation: true, reason: "empty_selection" };
  }
  const line = normalizeText(selectedLine);
  if (line && !/[.!?]$/.test(line) && line.toLocaleLowerCase("en-US").includes(selected.toLocaleLowerCase("en-US"))) {
    return {
      text: line,
      confidence: "low",
      requiresConfirmation: true,
      reason: "heading_selection"
    };
  }
  const needle = selected.toLocaleLowerCase("en-US");
  const source = removeLeadingUnpunctuatedHeading(normalizePageText(pageText), needle);
  if (!source) {
    return { text: selected, confidence: "low", requiresConfirmation: true, reason: "page_text_unavailable" };
  }
  const lower = source.toLocaleLowerCase("en-US");
  const occurrences = lower.split(needle).length - 1;
  const index = lower.indexOf(needle);
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
