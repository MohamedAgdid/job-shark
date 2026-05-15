import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CONFIG = {
  SEARCH_KEYWORDS: ["Java", "Spring Boot"],
  LOCATION: "Morocco",
  CONTRACT_TYPE: "CDI",
  EXPERIENCE_LEVEL: "Junior",
  REKRUTE_URLS: [
    "https://www.rekrute.com/offres.html?query=java+spring+boot&contractType=5&workExperienceId%5B0%5D=4&sectorId%5B0%5D=24&o=1&s=1&p=1",
    "https://www.rekrute.com/offres.html?query=developpeur+java&contractType=5&sectorId%5B0%5D=24&o=1&s=1&p=1",
    "https://www.rekrute.com/offres.html?query=ingenieur+logiciel+junior&contractType=5&sectorId%5B0%5D=24&o=1&s=1&p=1"
  ],
  TAVILY_QUERIES: [
    `"Java Spring Boot Developer" Morocco CDI junior hiring 2026`,
    `"Full Stack Java Developer" Morocco CDI junior recrutement`,
    `"Développeur Java" CDI junior Maroc recrutement 2026`,
    `"Java Developer" Morocco junior entry level posted recently`,
    `"Java Spring Boot Developer" junior remote Morocco hiring`
  ],
  TECH_STACK: [
    "Java", "Spring Boot", "Spring", "Node.js", "NestJS",
    "React", "Next.js", "Angular", "TypeScript", "JavaScript",
    "PostgreSQL", "MongoDB", "MySQL", "Docker", "Kubernetes",
    "AWS", "Azure", "Python", "REST API", "Git", "JEE", "Hibernate"
  ],
  SCORING: {
    java: 15,
    springBoot: 25,
    junior: 15,
    cdi: 20,
    seniorPenalty: -15
  }
};

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const GOOGLE_SHEETS_WEBHOOK = process.env.GOOGLE_SHEETS_WEBHOOK || null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEN_FILE = path.join(__dirname, "seen_urls.json");
const OUTPUT_FILE = path.join(__dirname, "jobs_result.json");
const TODAY = new Date().toISOString().split("T")[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * 800));

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

function loadSeenUrls() {
  try {
    if (fs.existsSync(SEEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const filtered = {};
      for (const [url, date] of Object.entries(data)) {
        if (new Date(date).getTime() > cutoff) filtered[url] = date;
      }
      return filtered;
    }
  } catch { }
  return {};
}

function saveSeenUrls(seen) {
  // fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

async function fetchPage(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000);
    }
  }
}

async function scrapeRekrute(seen) {
  console.log("\nScraping ReKrute.com...");
  const jobs = [];
  for (const url of CONFIG.REKRUTE_URLS) {
    try {
      const html = await fetchPage(url);
      const pageJobs = parseRekruteHtml(html, seen);
      jobs.push(...pageJobs);
      await sleep(2000);
    } catch (err) {
      console.warn(`    ${err.message}`);
    }
  }
  const unique = [];
  const seenLinks = new Set();
  for (const job of jobs) {
    if (!seenLinks.has(job.link)) {
      seenLinks.add(job.link);
      unique.push(job);
    }
  }
  return unique;
}

function parseRekruteHtml(html, seen) {
  const jobs = [];
  const cardRegex = /class='titreJob'[^>]*href="(\/offre-emploi-[^"]+\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const jobUrl = `https://www.rekrute.com${match[1].split("#")[0]}`;
    const rawTitle = match[2].replace(/\s+/g, " ").trim();
    if (seen[jobUrl]) continue;
    const block = html.slice(Math.max(0, match.index - 1500), Math.min(html.length, match.index + 3000));
    let company = "Voir l'annonce";
    const companyMatch = block.match(/alt="([^"]{2,50})"\s+[^>]*title="([^"]{2,50})"/);
    if (companyMatch) company = companyMatch[2].trim();
    let location = "Maroc";
    const locMatch = rawTitle.match(/\|\s*([A-Za-z\s]+)\s*\(Maroc\)/i);
    if (locMatch) location = locMatch[1].trim();
    const dateMatch = block.match(/Publication\s*:\s*du\s*<span>(\d{2}\/\d{2}\/\d{4})<\/span>/);
    let publishDate = dateMatch ? dateMatch[1] : null;
    let freshness = "Recent";
    if (publishDate) {
      const [d, m, y] = publishDate.split("/").map(Number);
      const daysOld = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
      if (daysOld > 14) continue;
      freshness = daysOld === 0 ? "Today" : `${daysOld} days ago`;
    }
    const deadlineMatch = block.match(/au\s*<span>(\d{2}\/\d{2}\/\d{4})<\/span>/);
    if (deadlineMatch) {
      const [d, m, y] = deadlineMatch[1].split("/").map(Number);
      if (new Date(y, m - 1, d).getTime() < Date.now()) continue;
    }
    const descMatch = block.match(/<div class="info"[^>]*>\s*<[^>]+>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    const summary = descMatch ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (/expir[ée]e|clos|pourvu|combl/i.test(block)) continue;
    seen[jobUrl] = TODAY;
    jobs.push({
      title: rawTitle.replace(/\s*\|\s*.*$/, "").trim(),
      company,
      type: /CDI/i.test(block) ? "CDI" : "Full-Time",
      location,
      stack: extractStack(`${rawTitle} ${summary}`),
      link: jobUrl,
      summary,
      source: "ReKrute",
      freshness,
      foundAt: TODAY,
      relevanceScore: 0,
    });
  }
  return jobs;
}

async function searchWithTavily(seen) {
  if (!TAVILY_API_KEY) return [];
  console.log("\nTavily search...");
  const allJobs = [];
  for (const query of CONFIG.TAVILY_QUERIES) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query, days: 3, max_results: 10 }),
      });
      const data = await res.json();
      for (const result of data.results || []) {
        const url = (result.url || "").trim();
        if (!url || seen[url] || !looksLikeJobPosting(result)) continue;
        const fullText = `${result.title} ${result.content}`.toLowerCase();
        if (/expired|expir[ée]|clos|filled/i.test(fullText)) continue;
        let type = "Full-Time";
        if (fullText.includes("cdi")) type = "CDI";
        else if (fullText.includes("stage") || fullText.includes("intern")) type = "Internship";
        seen[url] = TODAY;
        allJobs.push({
          title: result.title,
          company: extractCompanyFromSnippet(result.content),
          type,
          location: "Morocco",
          stack: extractStack(fullText),
          link: url,
          summary: result.content.slice(0, 250),
          source: detectSource(url),
          freshness: "Recent (< 3 days)",
          foundAt: TODAY,
          relevanceScore: 0,
        });
      }
      await sleep(1500);
    } catch (err) {
      console.warn(`   ${err.message}`);
    }
  }
  return allJobs;
}

function looksLikeJobPosting(result) {
  const t = `${result.title} ${result.content}`.toLowerCase();
  const signals = ["developer", "développeur", "engineer", "ingénieur", "java", "recrutement", "hiring", "cdi", "stage"];
  const noSignals = ["tutorial", "tutoriel", "course", "formation", "salary", "salaire", "top 10"];
  return signals.some(s => t.includes(s)) && !noSignals.some(s => t.includes(s));
}

function detectSource(url = "") {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("indeed.com")) return "Indeed";
  if (u.includes("glassdoor.com")) return "Glassdoor";
  if (u.includes("bayt.com")) return "Bayt";
  if (u.includes("rekrute.com")) return "ReKrute";
  return "Web";
}

function extractCompanyFromSnippet(snippet = "") {
  const patterns = [/(?:at|chez)\s+([A-Z][A-Za-z0-9&\s.'-]{2,35})/i, /([A-Z][A-Za-z0-9&\s.'-]{2,35})\s+is\s+(?:hiring|recruiting)/i];
  for (const p of patterns) {
    const m = snippet.match(p);
    if (m) return m[1].trim();
  }
  return "See posting";
}

function extractStack(text = "") {
  const found = CONFIG.TECH_STACK.filter(t => text.toLowerCase().includes(t.toLowerCase()));
  return found.join(", ") || "See posting";
}

function scoreJob(job) {
  let score = 0;
  const text = `${job.title} ${job.summary} ${job.stack}`.toLowerCase();
  if (text.includes("java")) score += CONFIG.SCORING.java;
  if (text.includes("spring boot")) score += CONFIG.SCORING.springBoot;
  if (text.includes("junior")) score += CONFIG.SCORING.junior;
  if (job.type === "CDI") score += CONFIG.SCORING.cdi;
  if (text.includes("senior") && !text.includes("junior")) score += CONFIG.SCORING.seniorPenalty;
  const sourceScores = { "ReKrute": 25, "LinkedIn": 18, "Indeed": 15 };
  score += sourceScores[job.source] || 5;
  return Math.max(0, score);
}

async function sendToSheets(jobs) {
  if (!GOOGLE_SHEETS_WEBHOOK) return;
  console.log(`\n Sending ${jobs.length} jobs to Sheets...`);
  try {
    await fetch(GOOGLE_SHEETS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: TODAY, totalJobs: jobs.length, jobs }),
    });
  } catch (err) { }
}

async function main() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════════════════");
  console.log("JOB SHARK — HYBRID ENGINE");
  console.log(`${TODAY}`);
  console.log("═══════════════════════════════════════════════════");
  const seen = loadSeenUrls();
  let allJobs = [];
  allJobs.push(...(await scrapeRekrute(seen)));
  allJobs.push(...(await searchWithTavily(seen)));
  for (const job of allJobs) job.relevanceScore = scoreJob(job);
  allJobs.sort((a, b) => b.relevanceScore - a.relevanceScore);
  allJobs = allJobs.slice(0, 30);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${allJobs.length} JOBS FOUND (${elapsed}s)`);
  if (allJobs.length > 0) {
    let idx = 1;
    for (const job of allJobs) {
      console.log(`${String(idx++).padStart(2, "0")}. ${job.title} | ${job.company}`);
      console.log(`    ${job.location} | ${job.relevanceScore} | ${job.link}\n`);
    }
    await sendToSheets(allJobs);
  }
  console.log("═══════════════════════════════════════════════════");
}

main().catch(err => console.error("\n FAILED:", err.message));
