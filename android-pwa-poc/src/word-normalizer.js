import lemmatizer from "wink-lemmatizer";

const NOUN_HINTS = new Set([
  "a", "an", "the", "these", "those", "many", "several", "both",
  "each", "every", "its", "our", "their", "his", "her"
]);
const VERB_HINTS = new Set(["he", "she", "it", "this", "that", "who", "which"]);

function cleanWord(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function previousWord(surface, sentence) {
  const word = cleanWord(surface);
  const text = String(sentence || "").toLocaleLowerCase("en-US");
  const index = text.indexOf(word);
  if (index < 0) return "";
  const before = text.slice(0, index).match(/([a-z]+)[^a-z]*$/);
  return before ? before[1] : "";
}

export function normalizeWordForm(surface, sentence = "") {
  const original = String(surface || "").trim();
  const normalizedSurface = cleanWord(original);
  if (!normalizedSurface) {
    return { original, lemma: "", alternatives: [], ambiguous: false, reason: "empty" };
  }

  const verb = lemmatizer.verb(normalizedSurface);
  const noun = lemmatizer.noun(normalizedSurface);
  const changed = [...new Set([verb, noun].filter(item => item && item !== normalizedSurface))];
  if (changed.length === 0) {
    return {
      original,
      lemma: normalizedSurface,
      alternatives: [],
      ambiguous: false,
      reason: "unchanged"
    };
  }
  if (changed.length === 1) {
    return {
      original,
      lemma: changed[0],
      alternatives: [],
      ambiguous: false,
      reason: verb === changed[0] ? "verb" : "noun"
    };
  }

  const previous = previousWord(normalizedSurface, sentence);
  const preferVerb = VERB_HINTS.has(previous);
  const preferNoun = NOUN_HINTS.has(previous);
  const lemma = preferVerb ? verb : noun;
  return {
    original,
    lemma,
    alternatives: changed.filter(item => item !== lemma),
    ambiguous: true,
    reason: preferVerb ? "context_verb" : (preferNoun ? "context_noun" : "ambiguous_default_noun")
  };
}

