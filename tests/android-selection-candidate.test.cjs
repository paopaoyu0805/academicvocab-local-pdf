const test = require("node:test");
const assert = require("node:assert/strict");

async function extractor() {
  return import("../android-pwa-poc/src/selection-candidate.js");
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
    pageText: "AcademicVocab Stage 5 Test Fixture\nThis PDF contains only public test text."
  });
  assert.equal(result.text, "AcademicVocab Stage 5 Test Fixture");
  assert.equal(result.reason, "heading_selection");
  assert.equal(result.requiresConfirmation, true);
});
