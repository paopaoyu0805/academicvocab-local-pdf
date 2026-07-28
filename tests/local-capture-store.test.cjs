const test = require("node:test");
const assert = require("node:assert/strict");
const captureStore = require("../zotero-selection-poc/local-capture-store.js");

function source(overrides = {}) {
  return {
    sourceType: "zotero_pdf",
    sourceKey: "library-1:attachment-A",
    pageIndex: 2,
    title: "Controlled fixture",
    ...overrides
  };
}

function capture(store, overrides = {}) {
  return captureStore.saveConfirmedCapture(store, {
    userID: "user-1",
    word: "Perforin",
    source: source(),
    examples: ["Perforin creates pores in the target cell membrane."],
    ...overrides
  });
}

test("one normalized word is created once and one confirmation creates one batch", () => {
  const store = captureStore.createStore();
  const first = capture(store);
  const second = capture(store, {
    word: "  perforin ",
    examples: ["Perforin was also localized in tissue."]
  });
  const state = captureStore.snapshot(store);

  assert.equal(first.wordCreated, true);
  assert.equal(second.wordCreated, false);
  assert.equal(state.words.length, 1);
  assert.equal(state.captureBatches.length, 2);
  assert.equal(second.batch.captureOrdinal, 2);
});

test("one confirmed batch preserves multiple selected examples without inflating its ordinal", () => {
  const store = captureStore.createStore();
  const result = capture(store, {
    examples: [
      "Perforin creates pores in the target cell membrane.",
      "Perforin was measured in serum.",
      "Perforin was also localized in tissue."
    ]
  });
  const summary = captureStore.summarizeWord(store, result.word.id);

  assert.equal(result.batch.captureOrdinal, 1);
  assert.equal(result.batch.exampleCount, 3);
  assert.equal(summary.captureBatchCount, 1);
  assert.equal(summary.exampleCount, 3);
});

test("identical examples from the same source and page are deduplicated before batch counting", () => {
  const store = captureStore.createStore();
  capture(store);
  const result = capture(store);

  assert.equal(result.batch.captureOrdinal, 2);
  assert.equal(result.batch.exampleCount, 0);
  assert.equal(result.duplicateExampleIDs.length, 1);
  assert.equal(captureStore.summarizeWord(store, result.word.id).exampleCount, 1);
});

test("the same sentence from another page remains a distinct source occurrence", () => {
  const store = captureStore.createStore();
  const first = capture(store);
  const second = capture(store, { source: source({ pageIndex: 3 }) });

  assert.equal(second.batch.exampleCount, 1);
  assert.equal(captureStore.summarizeWord(store, first.word.id).exampleCount, 2);
});

test("a mastered word saves new history but never resumes review automatically", () => {
  const store = captureStore.createStore();
  const first = capture(store);
  captureStore.setLifecycleStatus(store, {
    userID: "user-1",
    wordID: first.word.id,
    lifecycleStatus: "mastered"
  });
  const result = capture(store, {
    examples: ["Perforin contributes to cytotoxic lymphocyte activity."]
  });

  assert.equal(result.requiresLifecycleDecision, true);
  assert.equal(result.summary.lifecycleStatus, "mastered");
  assert.equal(result.summary.captureBatchCount, 2);
  assert.equal(result.summary.exampleCount, 2);
  assert.equal(captureStore.keepMastered(store, { userID: "user-1", wordID: first.word.id }).lifecycleStatus, "mastered");
  assert.equal(captureStore.resumeReview(store, { userID: "user-1", wordID: first.word.id }).lifecycleStatus, "active");
});

test("word, document, example, and batch data are isolated by user", () => {
  const store = captureStore.createStore();
  const first = capture(store);
  const other = capture(store, { userID: "user-2" });
  const state = captureStore.snapshot(store);

  assert.notEqual(first.word.id, other.word.id);
  assert.equal(state.words.length, 2);
  assert.equal(state.documents.length, 2);
});

test("the model rejects local paths and does not accept a capture without explicit examples", () => {
  const store = captureStore.createStore();
  assert.throws(() => capture(store, { source: source({ sourceKey: "D:\\private.pdf" }) }), /local file path/);
  assert.throws(() => capture(store, { examples: [] }), /user-confirmed example/);
});
