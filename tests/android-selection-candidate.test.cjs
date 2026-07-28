const test = require("node:test");
const assert = require("node:assert/strict");

async function extractor() {
  return import("../android-pwa-poc/src/selection-candidate.js");
}

async function textLayout() {
  return import("../android-pwa-poc/src/pdf-text-layout.js");
}

test("returns one complete on-page sentence for an unambiguous selection", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "Perforin",
    pageText: "Perforin creates pores in the target cell membrane. Granzyme B follows."
  });
  assert.equal(result.text, "Perforin creates pores in the target cell membrane.");
  assert.equal(result.confidence, "high");
  assert.equal(result.requiresConfirmation, false);
});

test("requires confirmation for an ambiguous or punctuation-free selection", async () => {
  const { extractCandidate } = await extractor();
  assert.equal(extractCandidate({
    selectedText: "Perforin",
    pageText: "Perforin was measured. Perforin was localized."
  }).requiresConfirmation, true);
  const fragment = extractCandidate({
    selectedText: "Perforin",
    pageText: "Perforin creates pores in target cells"
  });
  assert.equal(fragment.requiresConfirmation, true);
  assert.equal(fragment.confidence, "low");
});

test("does not treat an unpunctuated first-line heading as part of the candidate sentence", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "contains",
    pageText: "AcademicVocab Stage 5 Test Fixture\nThis PDF contains only public test text."
  });
  assert.equal(result.text, "This PDF contains only public test text.");
  assert.equal(result.requiresConfirmation, false);
});

test("never combines an unpunctuated selected heading with following body text", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "Stage",
    selectedLine: "AcademicVocab Stage 5 Test Fixture",
    selectedLineIsHeading: true,
    pageText: "AcademicVocab Stage 5 Test Fixture\nThis PDF contains only public test text."
  });
  assert.equal(result.text, "AcademicVocab Stage 5 Test Fixture");
  assert.equal(result.reason, "heading_selection");
  assert.equal(result.requiresConfirmation, true);
});

test("joins a word split by a hyphenated PDF line break before extracting its sentence", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "international",
    pageText: "The inter-\nnational study reported a reproducible immune response."
  });
  assert.equal(result.text, "The international study reported a reproducible immune response.");
  assert.equal(result.requiresConfirmation, false);
});

test("extracts a complete sentence when its text continues onto the next PDF page", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "antiviral",
    pageText: "The antiviral response was\nstronger in treated cells and remained stable during follow-up."
  });
  assert.equal(result.text, "The antiviral response was stronger in treated cells and remained stable during follow-up.");
  assert.equal(result.requiresConfirmation, false);
});

test("uses the tapped line to disambiguate a repeated word in a cross-page sentence", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "antiviral",
    selectedLine: "The antiviral response was",
    selectedLineMayContinue: true,
    pageText: "The antiviral response is enhanced through careful signaling.\nThe antiviral response was\nstronger in treated cells and remained stable during follow-up."
  });
  assert.equal(result.text, "The antiviral response was stronger in treated cells and remained stable during follow-up.");
  assert.equal(result.requiresConfirmation, false);
});

test("keeps a punctuation-free line separate when the next block starts a new sentence", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "granzyme",
    selectedLine: "Perforin opens pores; granzyme enters the cell",
    selectedLineMayContinue: false,
    pageText: "Perforin opens pores; granzyme enters the cell\nTwo-column reading order."
  });
  assert.equal(result.text, "Perforin opens pores; granzyme enters the cell");
  assert.equal(result.reason, "punctuation_free_fragment");
  assert.equal(result.requiresConfirmation, true);
});

test("never crosses an explicit PDF page boundary after a punctuation-free fragment", async () => {
  const { extractCandidate } = await extractor();
  const result = extractCandidate({
    selectedText: "cell",
    pageText: "Perforin opens pores; granzyme enters the cell\fTwo-column reading order."
  });
  assert.equal(result.text, "Perforin opens pores; granzyme enters the cell");
  assert.equal(result.requiresConfirmation, true);
});

test("separates same-height text from left and right PDF columns", async () => {
  const { groupVisualTextLines } = await textLayout();
  const lines = groupVisualTextLines([
    { text: "Antigen presentation remained", top: 100, left: 54, right: 190 },
    { text: "Cytokine signaling remained", top: 100, left: 330, right: 456 }
  ], 612);
  assert.deepEqual(lines.map(line => line.text), [
    "Antigen presentation remained",
    "Cytokine signaling remained"
  ]);
});

test("orders a two-column PDF down the left column before the right", async () => {
  const { groupVisualTextLines, orderTextLinesForReading } = await textLayout();
  const items = [
    { text: "Two-column reading order.", top: -726, left: 54, right: 260 },
    { text: "LEFT COLUMN.", top: -684, left: 54, right: 121 },
    { text: "RIGHT COLUMN.", top: -684, left: 330, right: 402 },
    { text: "Antigen presentation remained", top: -630, left: 54, right: 190 },
    { text: "Cytokine signaling remained", top: -630, left: 330, right: 456 },
    { text: "stable in the left column.", top: -613, left: 54, right: 162 },
    { text: "stable in the right column.", top: -613, left: 330, right: 444 }
  ];
  const lines = groupVisualTextLines(items, 612);
  assert.deepEqual(orderTextLinesForReading(lines, 612).map(line => line.text), [
    "Two-column reading order.",
    "LEFT COLUMN.",
    "Antigen presentation remained",
    "stable in the left column.",
    "RIGHT COLUMN.",
    "Cytokine signaling remained",
    "stable in the right column."
  ]);
});
