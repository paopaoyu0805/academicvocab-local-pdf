var AcademicVocabSentenceExtractor = (() => {
  const MAX_CANDIDATE_LENGTH = 1000;
  const DOT_SENTINEL = "\uE000";
  const ABBREVIATION_PATTERNS = [
    /\b(?:e\.g|i\.e)\./gi,
    /\b(?:Dr|Mr|Mrs|Ms|Prof|Fig|Eq|Ref|vs|etc)\./g,
    /\bet\s+al\./gi,
    /\b[A-Z]\.(?=\s*[A-Z]\.)/g
  ];

  function normalizePageText(value) {
    return String(value || "")
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00AD/g, "")
      .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2")
      .split("\n")
      .map(line => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function lineSignature(line) {
    return line
      .toLocaleLowerCase()
      .replace(/\d+/g, "#")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPageNumberLine(line) {
    return /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(line.trim());
  }

  function removeRepeatedHeadersAndFooters(pageTexts) {
    let pages = pageTexts.map(normalizePageText);
    let headerCounts = new Map();
    let footerCounts = new Map();

    for (let page of pages) {
      let lines = page.split("\n").filter(line => line.trim());
      for (let line of lines.slice(0, 2)) {
        let signature = lineSignature(line);
        if (signature && signature.length <= 120) {
          headerCounts.set(signature, (headerCounts.get(signature) || 0) + 1);
        }
      }
      for (let line of lines.slice(-2)) {
        let signature = lineSignature(line);
        if (signature && signature.length <= 120) {
          footerCounts.set(signature, (footerCounts.get(signature) || 0) + 1);
        }
      }
    }

    return pages.map(page => {
      let lines = page.split("\n");
      let nonemptyIndexes = lines
        .map((line, index) => line.trim() ? index : -1)
        .filter(index => index >= 0);
      let headerIndexes = new Set(nonemptyIndexes.slice(0, 2));
      let footerIndexes = new Set(nonemptyIndexes.slice(-2));

      return lines.filter((line, index) => {
        if (isPageNumberLine(line)) {
          return false;
        }
        let signature = lineSignature(line);
        if (headerIndexes.has(index) && (headerCounts.get(signature) || 0) >= 2) {
          return false;
        }
        if (footerIndexes.has(index) && (footerCounts.get(signature) || 0) >= 2) {
          return false;
        }
        return true;
      }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    });
  }

  function endsWithTerminal(text) {
    return /[.!?。！？][\s"'”’\)\]]*$/.test(text.trim());
  }

  function beginsWithContinuation(text) {
    let match = text.trim().match(/[A-Za-z]/);
    return Boolean(match && match[0] === match[0].toLocaleLowerCase());
  }

  function shouldJoinPages(left, right) {
    let leftText = left.trim();
    let rightText = right.trim();
    if (!leftText || !rightText || endsWithTerminal(leftText)) {
      return false;
    }
    return /[,;:\-]$/.test(leftText) || beginsWithContinuation(rightText);
  }

  function joinPagePair(left, right) {
    if (/([A-Za-z])-$/.test(left) && /^[a-z]/.test(right.trim())) {
      return left.replace(/-$/, "") + right.trimStart();
    }
    return `${left} ${right}`;
  }

  function prepareContext(previousPageText, currentPageText, nextPageText) {
    let [previous, current, next] = removeRepeatedHeadersAndFooters([
      previousPageText,
      currentPageText,
      nextPageText
    ]);

    let prefix = "";
    let joinedPrevious = false;
    if (previous) {
      joinedPrevious = shouldJoinPages(previous, current);
      prefix = joinedPrevious
        ? joinPagePair(previous, current).slice(0, -current.length)
        : `${previous}\n\n`;
    }

    let combined = prefix + current;
    let currentStart = prefix.length;
    let currentEnd = currentStart + current.length;
    let joinedNext = false;

    if (next) {
      joinedNext = shouldJoinPages(current, next);
      combined = joinedNext
        ? joinPagePair(combined, next)
        : `${combined}\n\n${next}`;
    }

    return {
      previous,
      current,
      next,
      combined,
      currentStart,
      currentEnd,
      joinedPrevious,
      joinedNext
    };
  }

  function protectNonTerminalPeriods(text) {
    let protectedText = text.replace(/\b\d+\.\d+\b/g, match =>
      match.replace(/\./g, DOT_SENTINEL)
    );
    for (let pattern of ABBREVIATION_PATTERNS) {
      protectedText = protectedText.replace(pattern, match =>
        match.replace(/\./g, DOT_SENTINEL)
      );
    }
    return protectedText;
  }

  function isTerminalCharacter(character) {
    return /[.!?。！？]/.test(character || "");
  }

  function beginsWithLikelyNewBlock(text, lineBreakIndex) {
    let remainder = text.slice(lineBreakIndex + 1);
    let nextLine = remainder.split("\n", 1)[0];
    return /^[\s"'“‘(\[]*(?:[-•]\s*)?[A-Z0-9]/.test(nextLine);
  }

  function findSentenceBounds(text, occurrenceIndex, selectedLength) {
    let protectedText = protectNonTerminalPeriods(text);
    let start = 0;
    let startReason = "document_start";

    for (let index = occurrenceIndex - 1; index >= 0; index--) {
      if (isTerminalCharacter(protectedText[index])) {
        start = index + 1;
        startReason = "terminal";
        break;
      }
      if (index > 0 && protectedText[index] === "\n" && protectedText[index - 1] === "\n") {
        start = index + 1;
        startReason = "paragraph";
        break;
      }
    }

    let end = text.length;
    let hasTerminalEnd = false;
    let endReason = "document_end";
    for (let index = occurrenceIndex + selectedLength; index < protectedText.length; index++) {
      if (isTerminalCharacter(protectedText[index])) {
        end = index + 1;
        hasTerminalEnd = true;
        endReason = "terminal";
        break;
      }
      if (
        index + 1 < protectedText.length
        && protectedText[index] === "\n"
        && protectedText[index + 1] === "\n"
      ) {
        end = index;
        endReason = "paragraph";
        break;
      }
      if (
        protectedText[index] === "\n"
        && beginsWithLikelyNewBlock(protectedText, index)
      ) {
        end = index;
        endReason = "likely_new_block";
        break;
      }
    }

    return { start, end, startReason, endReason, hasTerminalEnd };
  }

  function normalizeCandidate(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function isWordCharacter(character) {
    return /[\p{L}\p{N}_']/u.test(character || "");
  }

  function findOccurrences(text, selectedText) {
    let haystack = text.toLocaleLowerCase();
    let needle = selectedText.toLocaleLowerCase();
    let indexes = [];
    let offset = 0;

    while (needle && offset <= haystack.length - needle.length) {
      let index = haystack.indexOf(needle, offset);
      if (index < 0) {
        break;
      }
      let before = index > 0 ? text[index - 1] : "";
      let after = index + needle.length < text.length
        ? text[index + needle.length]
        : "";
      let requiresBoundary = isWordCharacter(needle[0]) && isWordCharacter(needle[needle.length - 1]);
      if (!requiresBoundary || (!isWordCharacter(before) && !isWordCharacter(after))) {
        indexes.push(index);
      }
      offset = index + Math.max(needle.length, 1);
    }
    return indexes;
  }

  function currentLineCandidate(currentPageText, occurrenceIndex, selectedLength) {
    let start = currentPageText.lastIndexOf("\n", occurrenceIndex - 1) + 1;
    let end = currentPageText.indexOf("\n", occurrenceIndex + selectedLength);
    if (end < 0) {
      end = currentPageText.length;
    }
    return normalizeCandidate(currentPageText.slice(start, end));
  }

  function confidenceFromScore(score) {
    if (score >= 0.85) {
      return "high";
    }
    if (score >= 0.55) {
      return "medium";
    }
    return "low";
  }

  function buildCandidate(prepared, selected, localOccurrence, occurrenceCount) {
    let globalOccurrence = prepared.currentStart + localOccurrence;
    let bounds = findSentenceBounds(
      prepared.combined,
      globalOccurrence,
      selected.length
    );
    let sentenceText = normalizeCandidate(
      prepared.combined.slice(bounds.start, bounds.end)
    );
    let spansPreviousPage = bounds.start < prepared.currentStart;
    let spansNextPage = bounds.end > prepared.currentEnd;
    let spansPages = spansPreviousPage || spansNextPage;
    let reasons = [];

    if (
      bounds.hasTerminalEnd
      && sentenceText.length >= selected.length
      && sentenceText.length <= MAX_CANDIDATE_LENGTH
    ) {
      let score = 0.92;
      if (spansPages) {
        score -= 0.12;
        reasons.push("cross_page_join");
      }
      if (!/^[\s"'“‘\(\[]*[A-Z0-9]/.test(sentenceText)) {
        score -= 0.12;
        reasons.push("unusual_sentence_start");
      }
      if (occurrenceCount > 1) {
        score -= 0.12;
        reasons.push("multiple_occurrences");
      }
      if (sentenceText.length > 500) {
        score -= 0.12;
        reasons.push("long_sentence");
      }
      if (sentenceText.includes(";")) {
        reasons.push("semicolon_inside_sentence");
      }
      return {
        text: sentenceText,
        kind: "sentence",
        score: Math.max(0, Number(score.toFixed(2))),
        confidence: confidenceFromScore(score),
        spansPreviousPage,
        spansNextPage,
        reasons
      };
    }

    let lineText = currentLineCandidate(
      prepared.current,
      localOccurrence,
      selected.length
    );
    let score = lineText.includes(";") ? 0.5 : 0.35;
    if (lineText.length >= 20 && lineText.length <= 300) {
      score += 0.05;
    }
    if (occurrenceCount > 1) {
      score -= 0.1;
      reasons.push("multiple_occurrences");
    }
    reasons.push(lineText.includes(";")
      ? "semicolon_without_terminal"
      : "no_terminal_punctuation");

    let safeFragment = lineText && lineText.length <= MAX_CANDIDATE_LENGTH
      ? lineText
      : selected;
    if (lineText.length > MAX_CANDIDATE_LENGTH) {
      reasons.push("fragment_too_long");
    }

    return {
      text: safeFragment,
      kind: "fragment",
      score: Math.max(0, Number(score.toFixed(2))),
      confidence: confidenceFromScore(score),
      spansPreviousPage: false,
      spansNextPage: false,
      reasons
    };
  }

  function extract(options = {}) {
    let selected = normalizeCandidate(options.selectedText);
    if (!selected) {
      return {
        selectedText: "",
        candidates: [],
        recommendedIndex: null,
        requiresConfirmation: true,
        diagnostic: { occurrenceCount: 0, reason: "empty_selection" }
      };
    }

    if (selected.length <= MAX_CANDIDATE_LENGTH && endsWithTerminal(selected)) {
      return {
        selectedText: selected,
        candidates: [{
          text: selected,
          kind: "sentence",
          score: 0.98,
          confidence: "high",
          spansPreviousPage: false,
          spansNextPage: false,
          reasons: ["user_selected_complete_sentence"]
        }],
        recommendedIndex: 0,
        requiresConfirmation: false,
        diagnostic: { occurrenceCount: 1, reason: "complete_selection" }
      };
    }

    let prepared = prepareContext(
      options.previousPageText,
      options.currentPageText,
      options.nextPageText
    );
    let occurrenceIndexes = findOccurrences(prepared.current, selected);
    let candidates = occurrenceIndexes.map(index =>
      buildCandidate(prepared, selected, index, occurrenceIndexes.length)
    );

    let deduplicated = [];
    let seen = new Set();
    for (let candidate of candidates) {
      let key = candidate.text.toLocaleLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduplicated.push(candidate);
    }
    deduplicated.sort((a, b) => b.score - a.score);
    deduplicated = deduplicated.slice(0, 3);

    if (!deduplicated.length) {
      deduplicated.push({
        text: selected,
        kind: "fragment",
        score: 0.15,
        confidence: "low",
        spansPreviousPage: false,
        spansNextPage: false,
        reasons: ["selection_not_found_in_page_text"]
      });
    }

    let best = deduplicated[0];
    return {
      selectedText: selected,
      candidates: deduplicated,
      recommendedIndex: 0,
      requiresConfirmation:
        best.confidence !== "high"
        || best.kind !== "sentence"
        || occurrenceIndexes.length !== 1,
      diagnostic: {
        occurrenceCount: occurrenceIndexes.length,
        joinedPreviousPage: prepared.joinedPrevious,
        joinedNextPage: prepared.joinedNext
      }
    };
  }

  return {
    MAX_CANDIDATE_LENGTH,
    extract,
    normalizePageText,
    removeRepeatedHeadersAndFooters
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AcademicVocabSentenceExtractor;
}
