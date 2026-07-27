var AcademicVocabMarkerOwnership = (() => {
  const MARKER_OWNER = "AcademicVocab";

  function cloneJSON(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function canonicalize(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      // Zotero may round PDF coordinates when it serializes an annotation.
      // Nine decimal places preserve practical PDF positioning while treating
      // floating-point representation noise as the same selection.
      return Math.round(value * 1000000000) / 1000000000;
    }
    if (Array.isArray(value)) {
      return value.map(canonicalize);
    }
    if (value && typeof value === "object") {
      let output = {};
      for (let key of Object.keys(value).sort()) {
        if (value[key] !== undefined) {
          output[key] = canonicalize(value[key]);
        }
      }
      return output;
    }
    return value;
  }

  function canonicalJSONString(value) {
    return JSON.stringify(canonicalize(value));
  }

  // Retained only to verify and migrate a ledger signature created before
  // coordinate normalization was introduced. It must not be used for new IDs.
  function legacyCanonicalize(value) {
    if (Array.isArray(value)) {
      return value.map(legacyCanonicalize);
    }
    if (value && typeof value === "object") {
      let output = {};
      for (let key of Object.keys(value).sort()) {
        if (value[key] !== undefined) {
          output[key] = legacyCanonicalize(value[key]);
        }
      }
      return output;
    }
    return value;
  }

  function legacyCanonicalJSONString(value) {
    return JSON.stringify(legacyCanonicalize(value));
  }

  function makeCaptureSeed(context) {
    return canonicalJSONString({
      attachmentKey: context.attachmentKey,
      libraryID: context.libraryID,
      position: context.position,
      selectedText: String(context.selectedText || "").trim()
    });
  }

  function parsePosition(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      }
      catch (error) {
        return null;
      }
    }
    return cloneJSON(value);
  }

  function normalizedRects(position) {
    let parsed = parsePosition(position);
    if (!parsed || !Array.isArray(parsed.rects)) {
      return [];
    }
    return parsed.rects
      .filter(rect => Array.isArray(rect) && rect.length >= 4)
      .map(rect => ({
        left: Math.min(Number(rect[0]), Number(rect[2])),
        right: Math.max(Number(rect[0]), Number(rect[2])),
        top: Math.min(Number(rect[1]), Number(rect[3])),
        bottom: Math.max(Number(rect[1]), Number(rect[3]))
      }))
      .filter(rect => Object.values(rect).every(Number.isFinite));
  }

  function rectanglesOverlap(left, right) {
    return left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
  }

  function positionsOverlap(left, right) {
    let leftPosition = parsePosition(left);
    let rightPosition = parsePosition(right);
    if (!leftPosition || !rightPosition) {
      return false;
    }
    if (leftPosition.pageIndex !== rightPosition.pageIndex) {
      return false;
    }
    let leftRects = normalizedRects(leftPosition);
    let rightRects = normalizedRects(rightPosition);
    if (!leftRects.length || !rightRects.length) {
      return canonicalJSONString(leftPosition) === canonicalJSONString(rightPosition);
    }
    return leftRects.some(leftRect =>
      rightRects.some(rightRect => rectanglesOverlap(leftRect, rightRect))
    );
  }

  function canRemoveRecord(record) {
    return Boolean(
      record
      && record.markerOwner === MARKER_OWNER
      && record.status === "active"
      && record.libraryID
      && record.attachmentKey
      && record.annotationKey
      && record.markerSignature
    );
  }

  function matchesExactOwnership(record, snapshot, signature) {
    return Boolean(
      canRemoveRecord(record)
      && snapshot
      && snapshot.libraryID === record.libraryID
      && snapshot.attachmentKey === record.attachmentKey
      && snapshot.annotationKey === record.annotationKey
      && signature === record.markerSignature
    );
  }

  function matchesLegacyContextRecord(record, context) {
    return Boolean(
      record
      && record.markerOwner === MARKER_OWNER
      && record.libraryID === context.libraryID
      && record.attachmentKey === context.attachmentKey
      && record.position
      && context.position
      && canonicalJSONString(record.position) === canonicalJSONString(context.position)
    );
  }

  function canRecreateRemovedRecord(record) {
    return Boolean(
      record
      && record.markerOwner === MARKER_OWNER
      && record.status === "removed"
      && record.libraryID
      && record.attachmentKey
      && record.annotationKey
    );
  }

  function newLedger() {
    return {
      schemaVersion: 1,
      markerOwner: MARKER_OWNER,
      records: {}
    };
  }

  return {
    MARKER_OWNER,
    canonicalize,
    canonicalJSONString,
    legacyCanonicalJSONString,
    cloneJSON,
    makeCaptureSeed,
    parsePosition,
    normalizedRects,
    positionsOverlap,
    canRemoveRecord,
    matchesExactOwnership,
    matchesLegacyContextRecord,
    canRecreateRemovedRecord,
    newLedger
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AcademicVocabMarkerOwnership;
}
