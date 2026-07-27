const test = require("node:test");
const assert = require("node:assert/strict");
const extractor = require("../zotero-selection-poc/sentence-extractor.js");

function best(options) {
  return extractor.extract(options).candidates[0];
}

test("extracts a complete sentence around one selected word", () => {
  const result = extractor.extract({
    selectedText: "Perforin",
    currentPageText: "The immune response was measured. Perforin creates pores in the target cell membrane. Granzyme B then induces apoptosis."
  });
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.candidates[0].text, "Perforin creates pores in the target cell membrane.");
  assert.equal(result.candidates[0].confidence, "high");
});

test("does not split after a protected abbreviation", () => {
  const candidate = best({
    selectedText: "perforin",
    currentPageText: "Dr. Smith reported that perforin was elevated. The result was replicated."
  });
  assert.equal(candidate.text, "Dr. Smith reported that perforin was elevated.");
});

test("keeps a semicolon inside a complete sentence", () => {
  const candidate = best({
    selectedText: "granzyme",
    currentPageText: "Perforin creates pores in the membrane; granzyme B then enters the target cell and induces apoptosis."
  });
  assert.equal(candidate.kind, "sentence");
  assert.equal(candidate.text, "Perforin creates pores in the membrane; granzyme B then enters the target cell and induces apoptosis.");
  assert.ok(candidate.reasons.includes("semicolon_inside_sentence"));
});

test("returns only the current line for punctuation-free list content", () => {
  const result = extractor.extract({
    selectedText: "Perforin",
    currentPageText: "Perforin, which creates pores in the target cell membrane\nGranzyme B, entering the target cell to induce apoptosis\nDeath receptor pathway"
  });
  assert.equal(result.candidates[0].text, "Perforin, which creates pores in the target cell membrane");
  assert.equal(result.candidates[0].kind, "fragment");
  assert.equal(result.candidates[0].confidence, "low");
  assert.equal(result.requiresConfirmation, true);
});

test("does not swallow the next capitalized sentence after a punctuation-free fragment", () => {
  const result = extractor.extract({
    selectedText: "Cytokine",
    currentPageText: "Cytokine release, enhanced antigen presentation, immune modulation\nPrevious test cases end here."
  });
  assert.equal(
    result.candidates[0].text,
    "Cytokine release, enhanced antigen presentation, immune modulation"
  );
  assert.equal(result.candidates[0].kind, "fragment");
  assert.equal(result.candidates[0].confidence, "low");
  assert.equal(result.requiresConfirmation, true);
});

test("keeps a semicolon fragment local when no sentence terminator exists", () => {
  const candidate = best({
    selectedText: "granzyme",
    currentPageText: "Perforin opens pores; granzyme enters the cell\nAnother list item"
  });
  assert.equal(candidate.text, "Perforin opens pores; granzyme enters the cell");
  assert.equal(candidate.kind, "fragment");
  assert.ok(candidate.reasons.includes("semicolon_without_terminal"));
});

test("joins a wrapped line inside one sentence", () => {
  const candidate = best({
    selectedText: "antigen",
    currentPageText: "The antiviral response is enhanced through\ncareful antigen presentation and immune signaling."
  });
  assert.equal(candidate.text, "The antiviral response is enhanced through careful antigen presentation and immune signaling.");
  assert.equal(candidate.confidence, "high");
});

test("repairs a hyphenated line break", () => {
  const candidate = best({
    selectedText: "international",
    currentPageText: "The inter-\nnational study reported a reproducible immune response."
  });
  assert.equal(candidate.text, "The international study reported a reproducible immune response.");
});

test("joins a sentence across previous, current, and next pages", () => {
  const result = extractor.extract({
    selectedText: "stronger",
    previousPageText: "Earlier findings were inconsistent. The antiviral response was",
    currentPageText: "stronger in treated cells and remained stable",
    nextPageText: "during follow-up. A separate analysis confirmed the effect."
  });
  assert.equal(result.candidates[0].text, "The antiviral response was stronger in treated cells and remained stable during follow-up.");
  assert.equal(result.candidates[0].confidence, "medium");
  assert.equal(result.candidates[0].spansPreviousPage, true);
  assert.equal(result.candidates[0].spansNextPage, true);
  assert.equal(result.requiresConfirmation, true);
});

test("offers separate candidates when the selected word appears more than once", () => {
  const result = extractor.extract({
    selectedText: "Perforin",
    currentPageText: "Perforin was measured in serum. Perforin was also localized in tissue."
  });
  assert.equal(result.diagnostic.occurrenceCount, 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(
    result.candidates.map(candidate => candidate.text).sort(),
    ["Perforin was also localized in tissue.", "Perforin was measured in serum."].sort()
  );
});

test("removes repeated headers, footers, and standalone page numbers", () => {
  const cleaned = extractor.removeRepeatedHeadersAndFooters([
    "Journal Header 12\nPerforin was elevated.\n12",
    "Journal Header 13\nGranzyme B was elevated.\n13",
    "Journal Header 14\nThe result was stable.\n14"
  ]);
  assert.equal(cleaned[0], "Perforin was elevated.");
  assert.equal(cleaned[1], "Granzyme B was elevated.");
});

test("trusts a complete sentence selected by the user", () => {
  const result = extractor.extract({
    selectedText: "Perforin creates pores in the target cell membrane.",
    currentPageText: ""
  });
  assert.equal(result.candidates[0].confidence, "high");
  assert.equal(result.candidates[0].reasons[0], "user_selected_complete_sentence");
  assert.equal(result.requiresConfirmation, false);
});

test("never returns more than the hard candidate length", () => {
  const veryLong = `Perforin ${"word ".repeat(260)}.`;
  const candidate = best({
    selectedText: "Perforin",
    currentPageText: veryLong
  });
  assert.ok(candidate.text.length <= extractor.MAX_CANDIDATE_LENGTH);
  assert.equal(candidate.kind, "fragment");
});
test("handles the controlled fixture cross-page text after removing headers", () => {
  const page1 = `AcademicVocab Stage 2B Test Fixture - Page 1
Sentence boundaries and fragments.
Previous test cases end here.
F. Sentence begins here and continues on page 2.
The antiviral response was
1`;
  const page2 = `AcademicVocab Stage 2B Test Fixture - Page 2
stronger in treated cells and remained stable during follow-up.
Cross-page and ambiguity cases.
G. Repeated selected word.
Perforin was measured in serum. Perforin was also localized in tissue.
2`;
  const page3 = `AcademicVocab Stage 2B Test Fixture - Page 3
Two-column reading order.
LEFT COLUMN.
RIGHT COLUMN.
The left column reports that
perforin levels increased.
3`;
  const result = extractor.extract({
    selectedText: "stronger",
    previousPageText: page1,
    currentPageText: page2,
    nextPageText: page3
  });
  assert.equal(result.candidates[0].text, "The antiviral response was stronger in treated cells and remained stable during follow-up.");
  assert.equal(result.candidates[0].confidence, "medium");
});

test("keeps the controlled two-column fixture sentence in its drawn reading order", () => {
  const page3 = `AcademicVocab Stage 2B Test Fixture - Page 3
Two-column reading order.
LEFT COLUMN.
RIGHT COLUMN.
The left column reports that
perforin levels increased.
Antigen presentation remained
stable in the left column.
The right column reports that
granzyme B induced apoptosis.
Cytokine signaling remained
stable in the right column.
3`;
  const result = extractor.extract({
    selectedText: "granzyme",
    currentPageText: page3
  });
  assert.equal(result.candidates[0].text, "The right column reports that granzyme B induced apoptosis.");
  assert.equal(result.candidates[0].confidence, "high");
});
