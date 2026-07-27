const test = require("node:test");
const assert = require("node:assert/strict");
const ownership = require("../zotero-selection-poc/marker-ownership.js");

test("canonical JSON is stable when object key order changes", () => {
  assert.equal(
    ownership.canonicalJSONString({ b: 2, a: { z: 3, y: 4 } }),
    ownership.canonicalJSONString({ a: { y: 4, z: 3 }, b: 2 })
  );
});

test("canonical JSON normalizes Zotero PDF coordinate representation noise", () => {
  assert.equal(
    ownership.canonicalJSONString({ rects: [[76.011, 519.723, 101.06899999999997, 529.898]] }),
    ownership.canonicalJSONString({ rects: [[76.011, 519.723, 101.069, 529.898]] })
  );
});

test("legacy JSON retains pre-normalization coordinates for safe ledger migration", () => {
  const original = { rects: [[76.011, 519.723, 101.06899999999997, 529.898]] };
  const normalized = { rects: [[76.011, 519.723, 101.069, 529.898]] };
  assert.notEqual(
    ownership.legacyCanonicalJSONString(original),
    ownership.legacyCanonicalJSONString(normalized)
  );
  assert.equal(
    ownership.canonicalJSONString(original),
    ownership.canonicalJSONString(normalized)
  );
});

test("capture seed changes when the selected PDF position changes", () => {
  const base = {
    attachmentKey: "ATTACH01",
    libraryID: 1,
    selectedText: "Perforin",
    position: { pageIndex: 0, rects: [[10, 10, 30, 20]] }
  };
  const changed = {
    ...base,
    position: { pageIndex: 0, rects: [[40, 10, 70, 20]] }
  };
  assert.notEqual(
    ownership.makeCaptureSeed(base),
    ownership.makeCaptureSeed(changed)
  );
});

test("overlap is detected only on the same page and intersecting rectangles", () => {
  const base = { pageIndex: 1, rects: [[10, 10, 30, 20]] };
  assert.equal(
    ownership.positionsOverlap(base, { pageIndex: 1, rects: [[25, 15, 40, 25]] }),
    true
  );
  assert.equal(
    ownership.positionsOverlap(base, { pageIndex: 1, rects: [[31, 10, 40, 20]] }),
    false
  );
  assert.equal(
    ownership.positionsOverlap(base, { pageIndex: 2, rects: [[10, 10, 30, 20]] }),
    false
  );
});

test("matching non-rect positions requires exact canonical equality", () => {
  assert.equal(
    ownership.positionsOverlap({ pageIndex: 0, paths: [[1, 2]] }, { paths: [[1, 2]], pageIndex: 0 }),
    true
  );
  assert.equal(
    ownership.positionsOverlap({ pageIndex: 0, paths: [[1, 2]] }, { pageIndex: 0, paths: [[2, 3]] }),
    false
  );
});

test("only an active AcademicVocab record with all exact identifiers is removable", () => {
  const record = {
    markerOwner: "AcademicVocab",
    status: "active",
    libraryID: 1,
    attachmentKey: "ATTACH01",
    annotationKey: "ANNOTATE",
    markerSignature: "signature"
  };
  assert.equal(ownership.canRemoveRecord(record), true);
  assert.equal(ownership.canRemoveRecord({ ...record, markerOwner: "manual" }), false);
  assert.equal(ownership.canRemoveRecord({ ...record, status: "protected_modified" }), false);
  assert.equal(ownership.canRemoveRecord({ ...record, annotationKey: "" }), false);
});

test("matching ownership requires the ledger, exact attachment and exact signature", () => {
  const record = {
    markerOwner: "AcademicVocab",
    status: "active",
    libraryID: 1,
    attachmentKey: "ATTACH01",
    annotationKey: "ANNOTATE",
    markerSignature: "signature"
  };
  const snapshot = {
    libraryID: 1,
    attachmentKey: "ATTACH01",
    annotationKey: "ANNOTATE"
  };
  assert.equal(ownership.matchesExactOwnership(record, snapshot, "signature"), true);
  assert.equal(ownership.matchesExactOwnership(record, { ...snapshot, attachmentKey: "OTHER" }, "signature"), false);
  assert.equal(ownership.matchesExactOwnership(record, snapshot, "changed"), false);
  assert.equal(ownership.matchesExactOwnership(null, snapshot, "signature"), false);
});

test("legacy context lookup requires the same owned attachment and normalized selection", () => {
  const record = {
    markerOwner: "AcademicVocab",
    libraryID: 1,
    attachmentKey: "ATTACH01",
    position: { pageIndex: 0, rects: [[76.011, 519.723, 101.06899999999997, 529.898]] }
  };
  const context = {
    libraryID: 1,
    attachmentKey: "ATTACH01",
    position: { pageIndex: 0, rects: [[76.011, 519.723, 101.069, 529.898]] }
  };
  assert.equal(ownership.matchesLegacyContextRecord(record, context), true);
  assert.equal(
    ownership.matchesLegacyContextRecord(record, { ...context, attachmentKey: "OTHER" }),
    false
  );
  assert.equal(
    ownership.matchesLegacyContextRecord(record, {
      ...context,
      position: { pageIndex: 0, rects: [[77, 519.723, 101.069, 529.898]] }
    }),
    false
  );
});

test("only an explicitly removed owned marker is eligible for an intentional recreation", () => {
  const record = {
    markerOwner: "AcademicVocab",
    status: "removed",
    libraryID: 1,
    attachmentKey: "ATTACH01",
    annotationKey: "OLDKEY"
  };
  assert.equal(ownership.canRecreateRemovedRecord(record), true);
  assert.equal(ownership.canRecreateRemovedRecord({ ...record, status: "active" }), false);
  assert.equal(ownership.canRecreateRemovedRecord({ ...record, markerOwner: "manual" }), false);
});

test("a new ledger has no inferred marker ownership", () => {
  const ledger = ownership.newLedger();
  assert.equal(ledger.markerOwner, "AcademicVocab");
  assert.deepEqual(ledger.records, {});
});
