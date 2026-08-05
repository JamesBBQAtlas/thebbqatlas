/**
 * Script detection for the "English by default" rule. Accented Latin (São
 * Paulo, Cariló, Málaga) is fine and must be preserved; what we flag is text
 * still in a NON-Latin script (CJK, Hangul, Arabic/Persian, Hebrew, Cyrillic,
 * Greek, Thai, Devanagari) so an operator can supply an English/romanised form
 * before it's shown as the primary, public value.
 */
const NON_LATIN = new RegExp(
  "[" +
    "\\u0400-\\u04FF" + // Cyrillic
    "\\u0370-\\u03FF" + // Greek
    "\\u0590-\\u05FF" + // Hebrew
    "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF" + // Arabic
    "\\u0900-\\u097F" + // Devanagari
    "\\u0E00-\\u0E7F" + // Thai
    "\\u3040-\\u309F\\u30A0-\\u30FF" + // Hiragana + Katakana
    "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF" + // CJK ideographs
    "\\uAC00-\\uD7AF" + // Hangul syllables
    "\\u3000-\\u303F\\uFF00-\\uFFEF" + // CJK punctuation + full-width forms
  "]"
);

/** True if the string contains any non-Latin script character. */
export function hasNonLatinScript(s: string | null | undefined): boolean {
  return typeof s === "string" && NON_LATIN.test(s);
}
