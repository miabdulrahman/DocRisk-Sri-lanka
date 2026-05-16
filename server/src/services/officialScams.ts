import type { OfficialScamEntry, OfficialScamSource, ScamSeverity } from "../types/officialScam.js";

const USER_AGENT = "DocRisk-SriLanka/1.0 (official-source aggregator; cybersecurity awareness)";
const SLCERT_KB_URL = "https://www.cert.gov.lk/knowledge_base";
const SLCERT_BASE = "https://www.cert.gov.lk/";
const POLICE_FRAUD_RSS =
  "https://www.police.lk/?s=online+fraud&feed=rss2";
const GOOGLE_NEWS_RSS =
  "https://news.google.com/rss/search?q=%22sri+lanka%22+(scam+OR+fraud+OR+cyber+OR+phishing)&hl=en-LK&gl=LK&ceid=LK:en";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_RESULTS = 15;
const POLICE_LIMIT = 5;
const NEWS_LIMIT = 6;

let cache: { expiresAt: number; scams: OfficialScamEntry[] } | null = null;

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function stripHtml(html: string): string {
  // Decode entities first so entity-encoded tags (&lt;a&gt;) become real tags,
  // then strip all tags, then decode any remaining entities.
  const decoded = decodeEntities(html);
  return decodeEntities(decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function parseSlcertDate(raw: string): string {
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function parseRssDate(raw: string): string {
  const parsed = Date.parse(raw.trim());
  if (Number.isNaN(parsed)) return new Date().toISOString().slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

function inferCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("postal") || t.includes("post scam")) return "Postal / SMS Scam";
  if (t.includes("tax")) return "Tax Scam";
  if (t.includes("financial") || t.includes("bank")) return "Financial Fraud";
  if (t.includes("loan")) return "Loan Fraud";
  if (t.includes("giveaway")) return "Social Media Scam";
  if (t.includes("ransomware")) return "Ransomware";
  if (t.includes("email")) return "Email Phishing";
  if (t.includes("social media")) return "Social Media Security";
  if (t.includes("online") || t.includes("fraud") || t.includes("phishing")) return "Online Fraud";
  return "Public Awareness";
}

function inferSeverity(title: string, source: OfficialScamSource): ScamSeverity {
  if (source === "Sri Lanka Police" || source === "Google News") return "High";
  const t = title.toLowerCase();
  if (
    t.includes("scam") ||
    t.includes("fraud") ||
    t.includes("phishing") ||
    t.includes("ransomware") ||
    t.includes("fake")
  ) {
    return "High";
  }
  if (t.includes("breach") || t.includes("safe") || t.includes("misuse")) return "Medium";
  return "Medium";
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

interface SlcertCard {
  title: string;
  dateRaw: string;
  path: string;
}

function parseSlcertKnowledgeBase(html: string): SlcertCard[] {
  const cards: SlcertCard[] = [];
  const cardBlocks = html.split(/<div class="scam-card">/i).slice(1);

  for (const block of cardBlocks) {
    const titleMatch = block.match(/<h3>([^<]*)<\/h3>/i);
    const dateMatch = block.match(/<p class="scam-meta">([^<]*)<\/p>/i);
    const linkMatch = block.match(/href="(knowledge_based\/[^"]+)"/i);
    if (!titleMatch || !linkMatch) continue;

    cards.push({
      title: decodeEntities(titleMatch[1]).replace(/!+$/g, "").trim(),
      dateRaw: dateMatch?.[1]?.trim() ?? "",
      path: linkMatch[1],
    });
  }

  return cards;
}

function slcertEntry(card: SlcertCard): OfficialScamEntry {
  const sourceUrl = `${SLCERT_BASE}${card.path}`;
  const slug = card.path.replace("knowledge_based/", "");
  const title = card.title;

  return {
    id: `slcert-${slug}`,
    title,
    category: inferCategory(title),
    severity: inferSeverity(title, "SLCERT"),
    description: `Official cybersecurity awareness alert published by Sri Lanka CERT.`,
    explanation: [
      `Source: Sri Lanka CERT (Computer Emergency Readiness Team), the national cyber security center.`,
      `Advisory: ${title}.`,
      `Published: ${card.dateRaw || "see official page"}.`,
      `Full official advisory (including visual guidance): ${sourceUrl}`,
      `Report incidents to SLCERT: info@cert.gov.lk or hotline 101.`,
    ].join(" "),
    lastUpdated: parseSlcertDate(card.dateRaw),
    source: "SLCERT",
    sourceUrl,
  };
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1];
    const link = block.match(/<link>([^<]*)<\/link>/i)?.[1];
    const pubDate = block.match(/<pubDate>([^<]*)<\/pubDate>/i)?.[1];
    const description =
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ??
      block.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i)?.[1];

    if (!title || !link) continue;

    const cleanDesc = stripHtml(description ?? "");
  items.push({
      title: decodeEntities(title),
      link: link.trim(),
      pubDate: pubDate?.trim() ?? "",
      description: cleanDesc,
    });
  }

  return items;
}

function policeEntry(item: RssItem): OfficialScamEntry {
  const postId = item.link.match(/[?&]p=(\d+)/)?.[1] ?? item.link;
  const summary =
    item.description.length > 320
      ? `${item.description.slice(0, 317)}…`
      : item.description;

  return {
    id: `police-${postId}`,
    title: item.title,
    category: inferCategory(item.title),
    severity: "High",
    description: summary || "Public advisory on online fraud from Sri Lanka Police.",
    explanation: [
      `Source: Sri Lanka Police — official public advisory.`,
      item.description || item.title,
      `Full notice: ${item.link}`,
      `For cybercrime complaints, contact the Criminal Investigation Department Computer Crime Investigation Division.`,
    ].join("\n\n"),
    lastUpdated: parseRssDate(item.pubDate),
    source: "Sri Lanka Police",
    sourceUrl: item.link,
  };
}

async function fetchSlcertAlerts(): Promise<OfficialScamEntry[]> {
  const html = await fetchText(SLCERT_KB_URL);
  return parseSlcertKnowledgeBase(html).map(slcertEntry);
}

const FRAUD_RELEVANCE = /fraud|scam|phish|cyber|fake|bank|online|defraud|impersonat|qr code|otp/i;

function isFraudRelevant(item: RssItem): boolean {
  const blob = `${item.title} ${item.description}`;
  return FRAUD_RELEVANCE.test(blob);
}

async function fetchPoliceAlerts(): Promise<OfficialScamEntry[]> {
  const xml = await fetchText(POLICE_FRAUD_RSS);
  return parseRssItems(xml)
    .filter(isFraudRelevant)
    .slice(0, POLICE_LIMIT)
    .map(policeEntry);
}

function googleNewsEntry(item: RssItem): OfficialScamEntry {
  // Google News redirect URLs encode the real link; use as-is for now
  const idSlug = item.link.replace(/[^a-z0-9]/gi, "").slice(-20) || String(Date.now());
  const summary =
    item.description.length > 320
      ? `${item.description.slice(0, 317)}…`
      : item.description;

  return {
    id: `gnews-${idSlug}`,
    title: item.title,
    category: inferCategory(item.title),
    severity: inferSeverity(item.title, "Google News"),
    description: summary || "Trending scam or fraud news from Sri Lanka.",
    explanation: [
      `Source: Google News — real-time trending news about scams and fraud in Sri Lanka.`,
      item.description || item.title,
      `Full article: ${item.link}`,
      `Stay vigilant and report suspected fraud to SLCERT (info@cert.gov.lk) or the CID Cybercrime Division.`,
    ].join("\n\n"),
    lastUpdated: parseRssDate(item.pubDate),
    source: "Google News",
    sourceUrl: item.link,
  };
}

async function fetchGoogleNewsAlerts(): Promise<OfficialScamEntry[]> {
  const xml = await fetchText(GOOGLE_NEWS_RSS);
  return parseRssItems(xml)
    .filter(isFraudRelevant)
    .slice(0, NEWS_LIMIT)
    .map(googleNewsEntry);
}

function mergeAndSort(scams: OfficialScamEntry[]): OfficialScamEntry[] {
  const byId = new Map<string, OfficialScamEntry>();
  for (const scam of scams) {
    byId.set(scam.id, scam);
  }

  return [...byId.values()]
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, MAX_RESULTS);
}

export async function getOfficialTrendingScams(): Promise<{
  scams: OfficialScamEntry[];
  sources: OfficialScamSource[];
  cached: boolean;
}> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return {
      scams: cache.scams,
      sources: ["SLCERT", "Sri Lanka Police", "Google News"],
      cached: true,
    };
  }

  const [slcertResult, policeResult, newsResult] = await Promise.allSettled([
    fetchSlcertAlerts(),
    fetchPoliceAlerts(),
    fetchGoogleNewsAlerts(),
  ]);

  const merged: OfficialScamEntry[] = [];

  if (slcertResult.status === "fulfilled") {
    merged.push(...slcertResult.value);
  } else {
    console.error("[officialScams] SLCERT fetch failed:", slcertResult.reason);
  }

  if (policeResult.status === "fulfilled") {
    merged.push(...policeResult.value);
  } else {
    console.error("[officialScams] Police RSS fetch failed:", policeResult.reason);
  }

  if (newsResult.status === "fulfilled") {
    merged.push(...newsResult.value);
  } else {
    console.error("[officialScams] Google News fetch failed:", newsResult.reason);
  }

  if (merged.length === 0) {
    throw new Error(
      "Could not load advisories from official sources (cert.gov.lk, police.lk, Google News). Please try again later.",
    );
  }

  const scams = mergeAndSort(merged);
  cache = { scams, expiresAt: now + CACHE_TTL_MS };

  const sources: OfficialScamSource[] = [];
  if (slcertResult.status === "fulfilled") sources.push("SLCERT");
  if (policeResult.status === "fulfilled") sources.push("Sri Lanka Police");
  if (newsResult.status === "fulfilled") sources.push("Google News");

  return { scams, sources, cached: false };
}
