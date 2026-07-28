/*
 * Stage 4 offline capture-model proof of concept.
 *
 * This module is deliberately storage-agnostic: callers may serialize its
 * state locally, but it neither reads files nor calls Zotero, a database, or
 * a network service. It stores only confirmed word, example, source, and
 * batch metadata; PDF bytes, full-text content, local paths, and credentials
 * are not accepted.
 */
(function (root, factory) {
  let api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AcademicVocabLocalCaptureStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SOURCE_TYPES = new Set(["zotero_pdf", "mobile_pdf", "manual"]);
  const LIFECYCLE_STATUSES = new Set(["active", "paused", "mastered", "archived"]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeWord(value) {
    return normalizeWhitespace(value).toLocaleLowerCase("en-US");
  }

  function normalizeSentence(value) {
    return normalizeWhitespace(value).toLocaleLowerCase("en-US");
  }

  function requiredText(value, label) {
    let normalized = normalizeWhitespace(value);
    if (!normalized) {
      throw new Error(label + " is required");
    }
    return normalized;
  }

  function assertNoLocalPath(value, label) {
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(String(value || ""))) {
      throw new Error(label + " must not be a local file path");
    }
  }

  function newState() {
    return {
      version: 1,
      nextID: 1,
      words: [],
      documents: [],
      examples: [],
      captureBatches: []
    };
  }

  function createStore(state) {
    let value = state ? clone(state) : newState();
    if (!value || value.version !== 1 || !Number.isInteger(value.nextID)) {
      throw new Error("unsupported local capture state");
    }
    ["words", "documents", "examples", "captureBatches"].forEach(key => {
      if (!Array.isArray(value[key])) {
        throw new Error("local capture state is missing " + key);
      }
    });
    return { state: value };
  }

  function allocateID(store, prefix) {
    let id = prefix + "-" + store.state.nextID;
    store.state.nextID += 1;
    return id;
  }

  function requireStore(store) {
    if (!store || !store.state) {
      throw new Error("a local capture store is required");
    }
  }

  function validateSource(source) {
    source = source || {};
    let sourceType = requiredText(source.sourceType, "source type");
    if (!SOURCE_TYPES.has(sourceType)) {
      throw new Error("unsupported source type");
    }
    let sourceKey = requiredText(source.sourceKey, "source key");
    assertNoLocalPath(sourceKey, "source key");
    let pageIndex = source.pageIndex;
    if (pageIndex !== null && pageIndex !== undefined &&
        (!Number.isInteger(pageIndex) || pageIndex < 0)) {
      throw new Error("page index must be a non-negative integer or null");
    }
    return {
      sourceType,
      sourceKey,
      pageIndex: pageIndex === undefined ? null : pageIndex,
      title: normalizeWhitespace(source.title || "") || null
    };
  }

  function getOrCreateDocument(store, userID, source) {
    let document = store.state.documents.find(item =>
      item.userID === userID &&
      item.sourceType === source.sourceType &&
      item.sourceKey === source.sourceKey
    );
    if (document) {
      return document;
    }
    document = {
      id: allocateID(store, "document"),
      userID,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      title: source.title
    };
    store.state.documents.push(document);
    return document;
  }

  function saveConfirmedCapture(store, input) {
    requireStore(store);
    input = input || {};
    let userID = requiredText(input.userID, "user ID");
    let originalWord = requiredText(input.word, "word");
    let normalizedWord = normalizeWord(originalWord);
    let source = validateSource(input.source);
    let selectedExamples = Array.isArray(input.examples) ? input.examples : null;
    if (!selectedExamples || selectedExamples.length === 0) {
      throw new Error("at least one user-confirmed example is required");
    }

    let word = store.state.words.find(item =>
      item.userID === userID && item.normalizedWord === normalizedWord
    );
    let wordCreated = false;
    if (!word) {
      word = {
        id: allocateID(store, "word"),
        userID,
        originalWord,
        normalizedWord,
        lifecycleStatus: "active"
      };
      store.state.words.push(word);
      wordCreated = true;
    }

    let document = getOrCreateDocument(store, userID, source);
    let addedExamples = [];
    let duplicateExamples = [];
    for (let rawExample of selectedExamples) {
      let sentence = requiredText(rawExample, "example sentence");
      let normalizedSentence = normalizeSentence(sentence);
      let existing = store.state.examples.find(item =>
        item.userID === userID &&
        item.wordID === word.id &&
        item.documentID === document.id &&
        item.pageIndex === source.pageIndex &&
        item.normalizedSentence === normalizedSentence
      );
      if (existing) {
        duplicateExamples.push(existing.id);
        continue;
      }
      let example = {
        id: allocateID(store, "example"),
        userID,
        wordID: word.id,
        documentID: document.id,
        sentence,
        normalizedSentence,
        pageIndex: source.pageIndex
      };
      store.state.examples.push(example);
      addedExamples.push(example);
    }

    let priorBatchCount = store.state.captureBatches.filter(item =>
      item.userID === userID && item.wordID === word.id
    ).length;
    let batch = {
      id: allocateID(store, "batch"),
      userID,
      wordID: word.id,
      documentID: document.id,
      captureOrdinal: priorBatchCount + 1,
      exampleCount: addedExamples.length,
      addedExampleIDs: addedExamples.map(item => item.id),
      duplicateExampleIDs: duplicateExamples
    };
    store.state.captureBatches.push(batch);

    return {
      word: clone(word),
      wordCreated,
      batch: clone(batch),
      addedExamples: clone(addedExamples),
      duplicateExampleIDs: clone(duplicateExamples),
      requiresLifecycleDecision: word.lifecycleStatus === "mastered",
      summary: summarizeWord(store, word.id)
    };
  }

  function findWord(store, userID, wordID) {
    requireStore(store);
    let word = store.state.words.find(item => item.id === wordID && item.userID === userID);
    if (!word) {
      throw new Error("word was not found for this user");
    }
    return word;
  }

  function setLifecycleStatus(store, input) {
    input = input || {};
    let userID = requiredText(input.userID, "user ID");
    let wordID = requiredText(input.wordID, "word ID");
    let lifecycleStatus = requiredText(input.lifecycleStatus, "lifecycle status");
    if (!LIFECYCLE_STATUSES.has(lifecycleStatus)) {
      throw new Error("unsupported lifecycle status");
    }
    let word = findWord(store, userID, wordID);
    word.lifecycleStatus = lifecycleStatus;
    return clone(word);
  }

  function keepMastered(store, input) {
    let word = findWord(store, requiredText(input && input.userID, "user ID"), requiredText(input && input.wordID, "word ID"));
    if (word.lifecycleStatus !== "mastered") {
      throw new Error("only a mastered word can remain mastered");
    }
    return clone(word);
  }

  function resumeReview(store, input) {
    let word = findWord(store, requiredText(input && input.userID, "user ID"), requiredText(input && input.wordID, "word ID"));
    if (word.lifecycleStatus !== "mastered") {
      throw new Error("only a mastered word can be resumed");
    }
    word.lifecycleStatus = "active";
    return clone(word);
  }

  function summarizeWord(store, wordID) {
    requireStore(store);
    let word = store.state.words.find(item => item.id === wordID);
    if (!word) {
      throw new Error("word was not found");
    }
    let batches = store.state.captureBatches.filter(item => item.wordID === wordID);
    let examples = store.state.examples.filter(item => item.wordID === wordID);
    return {
      wordID: word.id,
      lifecycleStatus: word.lifecycleStatus,
      captureBatchCount: batches.length,
      exampleCount: examples.length
    };
  }

  function snapshot(store) {
    requireStore(store);
    return clone(store.state);
  }

  return {
    createStore,
    saveConfirmedCapture,
    setLifecycleStatus,
    keepMastered,
    resumeReview,
    summarizeWord,
    snapshot,
    normalizeWord,
    normalizeSentence
  };
});
