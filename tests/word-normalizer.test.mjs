import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { normalizeWordForm } from "../android-pwa-poc/src/word-normalizer.js";

const require = createRequire(import.meta.url);
const zoteroNormalizer = require("../zotero-selection-poc/word-normalizer.js");

test("normalizes common academic inflections to one base form", () => {
  assert.equal(normalizeWordForm("contains").lemma, "contain");
  assert.equal(normalizeWordForm("cells").lemma, "cell");
  assert.equal(normalizeWordForm("reported").lemma, "report");
  assert.equal(normalizeWordForm("studies").lemma, "study");
  assert.equal(normalizeWordForm("running").lemma, "run");
  assert.equal(normalizeWordForm("was").lemma, "be");
  assert.equal(normalizeWordForm("children").lemma, "child");
  assert.equal(normalizeWordForm("analyses").lemma, "analysis");
  assert.equal(normalizeWordForm("criteria").lemma, "criterion");
  assert.equal(normalizeWordForm("created").lemma, "create");
  assert.equal(normalizeWordForm("included").lemma, "include");
});

test("keeps an already-base word unchanged", () => {
  const result = normalizeWordForm("perforin");
  assert.equal(result.lemma, "perforin");
  assert.equal(result.ambiguous, false);
  assert.equal(normalizeWordForm("analysis").lemma, "analysis");
  assert.equal(normalizeWordForm("focus").lemma, "focus");
  assert.equal(normalizeWordForm("process").lemma, "process");
});

test("uses sentence context but preserves an ambiguous alternative", () => {
  const noun = normalizeWordForm("leaves", "The leaves were collected.");
  assert.equal(noun.lemma, "leaf");
  assert.deepEqual(noun.alternatives, ["leave"]);
  assert.equal(noun.ambiguous, true);

  const verb = normalizeWordForm("leaves", "It leaves the membrane.");
  assert.equal(verb.lemma, "leave");
  assert.deepEqual(verb.alternatives, ["leaf"]);
  assert.equal(verb.ambiguous, true);
});

test("Zotero and Android use identical normalization results", () => {
  const cases = [
    ["contains", "This PDF contains public test text."],
    ["contained", "The sample contained perforin."],
    ["cells", "The cells were collected."],
    ["leaves", "It leaves the membrane."],
    ["analyses", "The analyses were reproducible."]
  ];
  for (const [surface, sentence] of cases) {
    assert.deepEqual(
      zoteroNormalizer.normalizeWordForm(surface, sentence),
      normalizeWordForm(surface, sentence)
    );
  }
});
