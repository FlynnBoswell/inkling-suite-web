export const MAX_ANALYSIS_CHARS = 50_000;
export const WRITING_MODES = [
    { id: "general", label: "General writing" },
    { id: "match-preview", label: "Match preview" },
    { id: "match-report", label: "Match report" },
    { id: "post-match-reaction", label: "Post-match reaction" },
    { id: "player-feature", label: "Player feature / interview" },
    { id: "football-news", label: "Football news / transfers" },
    { id: "tactical-analysis", label: "Tactical analysis" },
    { id: "football-blog", label: "Football blog / opinion" },
];
export const TONES = ["neutral", "professional", "formal", "conversational", "informative", "analytical", "confident", "persuasive", "friendly"];
export function isFootballMode(mode) {
    return mode !== "general";
}
