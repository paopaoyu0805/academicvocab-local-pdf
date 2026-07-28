/*
 * Small offline English word-form normalizer shared by the Zotero proof of
 * concept. It deliberately avoids network calls and large runtime lexicons.
 */
(function (root, factory) {
  let api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AcademicVocabWordNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NOUN_HINTS = new Set([
    "a", "an", "the", "these", "those", "many", "several", "both",
    "each", "every", "its", "our", "their", "his", "her"
  ]);
  const VERB_HINTS = new Set(["he", "she", "it", "this", "that", "who", "which"]);
  const IRREGULAR = new Map(Object.entries({
    am: "be", are: "be", is: "be", was: "be", were: "be", been: "be",
    has: "have", had: "have", does: "do", did: "do", done: "do",
    went: "go", gone: "go", made: "make", took: "take", taken: "take",
    making: "make", taking: "take", using: "use", used: "use",
    having: "have", giving: "give", writing: "write", becoming: "become",
    found: "find", gave: "give", given: "give", saw: "see", seen: "see",
    showed: "show", shown: "show", became: "become", begun: "begin",
    began: "begin", brought: "bring", built: "build", thought: "think",
    children: "child", men: "man", women: "woman", mice: "mouse",
    teeth: "tooth", feet: "foot", geese: "goose",
    analyses: "analysis", hypotheses: "hypothesis", syntheses: "synthesis",
    diagnoses: "diagnosis", criteria: "criterion", phenomena: "phenomenon",
    axes: "axis", indices: "index", matrices: "matrix", vertices: "vertex",
    nuclei: "nucleus", bacteria: "bacterium"
  }));
  const BASE_S_ENDINGS = /(ss|us|is)$/;
  const DOUBLE_PAST_CONSONANTS = new Set(["b", "d", "g", "m", "n", "p", "r", "t"]);
  const RESTORE_E_ENDINGS = /(at|iz|ur|iv|duc|clud|quir|serv|chang|creas|caus|provid)$/;

  function cleanWord(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/^[^a-z]+|[^a-z]+$/g, "");
  }

  function previousWord(surface, sentence) {
    let word = cleanWord(surface);
    let text = String(sentence || "").toLocaleLowerCase("en-US");
    let index = text.indexOf(word);
    if (index < 0) return "";
    let before = text.slice(0, index).match(/([a-z]+)[^a-z]*$/);
    return before ? before[1] : "";
  }

  function nounLemma(word) {
    if (IRREGULAR.has(word)) return IRREGULAR.get(word);
    if (word === "leaves") return "leaf";
    if (word.length < 4 || BASE_S_ENDINGS.test(word)) return word;
    if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
    if (/(sses|xes|zes|ches|shes|oes)$/.test(word)) return word.slice(0, -2);
    if (word.endsWith("s")) return word.slice(0, -1);
    return word;
  }

  function verbLemma(word) {
    if (IRREGULAR.has(word)) return IRREGULAR.get(word);
    if (word === "leaves") return "leave";
    if (word.endsWith("ying") && word.length > 5) return word.slice(0, -3);
    if (word.endsWith("ing") && word.length > 5) {
      let stem = word.slice(0, -3);
      let last = stem.at(-1);
      if (last === stem.at(-2) && DOUBLE_PAST_CONSONANTS.has(last)) return stem.slice(0, -1);
      if (RESTORE_E_ENDINGS.test(stem)) return `${stem}e`;
      return stem;
    }
    if (word.endsWith("ied") && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith("ed") && word.length > 4) {
      let stem = word.slice(0, -2);
      let last = stem.at(-1);
      if (last === stem.at(-2) && DOUBLE_PAST_CONSONANTS.has(last)) return stem.slice(0, -1);
      if (RESTORE_E_ENDINGS.test(stem)) return `${stem}e`;
      return stem;
    }
    return nounLemma(word);
  }

  function normalizeWordForm(surface, sentence = "") {
    let original = String(surface || "").trim();
    let normalizedSurface = cleanWord(original);
    if (!normalizedSurface) {
      return { original, lemma: "", alternatives: [], ambiguous: false, reason: "empty" };
    }

    let verb = verbLemma(normalizedSurface);
    let noun = nounLemma(normalizedSurface);
    let changed = [...new Set([verb, noun].filter(item => item && item !== normalizedSurface))];
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

    let previous = previousWord(normalizedSurface, sentence);
    let preferVerb = VERB_HINTS.has(previous);
    let preferNoun = NOUN_HINTS.has(previous);
    let lemma = preferVerb ? verb : noun;
    return {
      original,
      lemma,
      alternatives: changed.filter(item => item !== lemma),
      ambiguous: true,
      reason: preferVerb ? "context_verb" : (preferNoun ? "context_noun" : "ambiguous_default_noun")
    };
  }

  return { normalizeWordForm };
});

