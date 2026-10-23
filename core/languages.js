/**
 * Only claim support for what is implemented and tested (spec section 28).
 * Adding a language means adding a rule pack and flipping its status here.
 */
export const LANGUAGES = [
    { code: "en-GB", label: "English (UK)", status: "supported", note: "Default. Rule pack with British spelling and football conventions." },
    { code: "en-US", label: "English (US)", status: "partial", note: "Grammar and clarity rules apply. British-spelling and some football conventions are switched off. Football vocabulary is UK-centred." },
    { code: "es", label: "Español", status: "unsupported", note: "Not implemented yet." },
    { code: "fr", label: "Français", status: "unsupported", note: "Not implemented yet." },
    { code: "de", label: "Deutsch", status: "unsupported", note: "Not implemented yet." },
    { code: "it", label: "Italiano", status: "unsupported", note: "Not implemented yet." },
    { code: "pt", label: "Português", status: "unsupported", note: "Not implemented yet." },
    { code: "nl", label: "Nederlands", status: "unsupported", note: "Not implemented yet." },
    { code: "ja", label: "日本語", status: "unsupported", note: "Not implemented yet." },
    { code: "ko", label: "한국어", status: "unsupported", note: "Not implemented yet." },
];
export function languageInfo(code) {
    return LANGUAGES.find((l) => l.code === code);
}
export function isAnalysable(code) {
    const l = languageInfo(code);
    return !!l && l.status !== "unsupported";
}
export function unsupportedNotice(code) {
    const l = languageInfo(code);
    const name = l ? l.label : code;
    return `Inkling does not yet support proofreading in ${name}. No suggestions are shown, because applying English rules to it would produce wrong advice.`;
}
