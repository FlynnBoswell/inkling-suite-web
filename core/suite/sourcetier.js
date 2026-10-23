export const TIER_INFO = {
    official: { label: "Official", advice: "Club, league or governing body: strongest for announcements, fixtures and squad news.", type: "governing-body" },
    media: { label: "Established media", advice: "A news organisation with editorial standards. Good evidence; confirm key facts with an official source.", type: "journalism" },
    statistics: { label: "Statistics site", advice: "Useful for numbers, but community-run sites make mistakes: confirm against an official record.", type: "statistics" },
    reference: { label: "Reference", advice: "Wikipedia and similar: a lead to the original sources, not evidence on its own.", type: "other" },
    aggregator: { label: "Aggregator / rumour site", advice: "Often rewrites other outlets or rumours. Find the original report before relying on it.", type: "journalism" },
    social: { label: "Social media / forum", advice: "Only as strong as who posted it: an official club account is good, an anonymous post is not evidence.", type: "social" },
    unknown: { label: "Unknown site", advice: "Check who runs this site before relying on it.", type: "other" },
};
const LISTS = [
    ["official", ["thefa.com", "premierleague.com", "efl.com", "thenationalleague.org.uk", "uefa.com", "fifa.com", "spfl.co.uk", "scottishfa.co.uk", "faw.cymru", "irishfa.com", "fai.ie", "womenscompetitions.thefa.com", "isthmian.co.uk", "southern-football-league.co.uk", "northernpremierleague.co.uk", "gov.uk", "parliament.uk", "thepfa.com", "the-leagues.co.uk"]],
    ["media", ["bbc.co.uk", "bbc.com", "skysports.com", "theguardian.com", "telegraph.co.uk", "thetimes.com", "thetimes.co.uk", "independent.co.uk", "theathletic.com", "nytimes.com", "reuters.com", "apnews.com", "pa.media", "espn.co.uk", "espn.com", "standard.co.uk", "inews.co.uk", "dailymail.co.uk", "mirror.co.uk", "thesun.co.uk", "express.co.uk", "manchestereveningnews.co.uk", "liverpoolecho.co.uk", "chroniclelive.co.uk", "birminghammail.co.uk", "getsurrey.co.uk", "basingstokegazette.co.uk", "gazetteandherald.co.uk", "theargus.co.uk", "dailyecho.co.uk", "yorkpress.co.uk", "nonleaguepaper.com", "football.london", "talksport.com", "goal.com", "worldsoccer.com", "fourfourtwo.com", "nationalworld.com"]],
    ["statistics", ["transfermarkt.co.uk", "transfermarkt.com", "soccerway.com", "fbref.com", "worldfootball.net", "thesportsdb.com", "footballwebpages.co.uk", "fchd.info", "11v11.com", "soccerbase.com", "flashscore.co.uk", "flashscore.com", "sofascore.com", "whoscored.com", "opta.com", "theanalyst.com"]],
    ["reference", ["wikipedia.org", "wikidata.org"]],
    ["aggregator", ["caughtoffside.com", "teamtalk.com", "footballfancast.com", "givemesport.com", "sportskeeda.com", "90min.com", "football365.com", "footballtransfers.com", "hitc.com", "thesportsrush.com", "sportbible.com", "planetfootball.com", "football-italia.net", "fichajes.net", "tbrfootball.com", "footballinsider247.com", "sportslens.com", "newsnow.co.uk"]],
    ["social", ["twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com", "youtube.com", "reddit.com", "threads.net", "bsky.app", "linkedin.com", "medium.com", "substack.com"]],
];
const hostOf = (url) => { try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}
catch {
    return "";
} };
const matches = (host, domain) => host === domain || host.endsWith("." + domain);
/**
 * The tier for a web address. `officialSites` are the project's clubs' own websites (from TheSportsDB or typed in),
 * which count as official. Football club sites not in the list are often "<club>fc.co.uk" and similar: those stay
 * "unknown" unless listed, rather than guessing.
 */
export function tierOf(url, officialSites = []) {
    const host = hostOf(url);
    if (!host)
        return "unknown";
    if (officialSites.some((s) => { const h = hostOf(/^https?:/.test(s) ? s : `https://${s}`); return !!h && matches(host, h); }))
        return "official";
    for (const [tier, list] of LISTS)
        if (list.some((d) => matches(host, d)))
            return tier;
    return "unknown";
}
