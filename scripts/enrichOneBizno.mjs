/**
 * Fetch company profile from bizno.net by biz number (CI / workflow).
 * Usage: node scripts/enrichOneBizno.mjs <companyId> <bizNo>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SEARCH_BASE = "https://bizno.net";
const USER_AGENT = "T-client-enrich-ci/0.1";

function normalizeBizNoDigits(bizNo) {
  const digits = `${bizNo ?? ""}`.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

function formatBizNo(digits) {
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function cleanCellValue(value) {
  return `${value ?? ""}`
    .replace(/※.*$/, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTableCell(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<th>\\s*${escaped}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  const match = `${html ?? ""}`.match(re);
  if (!match) return "";
  return cleanCellValue(match[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function extractIndustrySummary(html) {
  const re = /<th>\s*국세청산업분류\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
  const match = `${html ?? ""}`.match(re);
  if (!match) return "";
  const parts = [];
  for (const p of match[1].matchAll(/<p[^>]*>([^<]+)<\/p>/gi)) {
    const text = p[1].replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  return parts.length ? parts.join(" · ") : cleanCellValue(match[1].replace(/<[^>]+>/g, " "));
}

function homepageToDomain(homepage) {
  const raw = `${homepage ?? ""}`.trim();
  if (!raw) return "";
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function parseBiznoArticleHtml(html, articlePath = "") {
  const homepageRaw = extractTableCell(html, "홈페이지");
  const homepageLink = homepageRaw.match(/https?:\/\/[^\s]+|www\.[^\s]+/i)?.[0] ?? homepageRaw;
  let employeeCount = extractTableCell(html, "종업원수");
  if (!employeeCount) {
    const meta = html.match(/종업원수\s*:\s*(\d+)\s*명/);
    if (meta) employeeCount = meta[1];
  }
  return {
    companyNameLegal:
      cleanCellValue(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "") ||
      extractTableCell(html, "상호"),
    bizNo: extractTableCell(html, "사업자등록번호"),
    bizType: extractTableCell(html, "업 태"),
    bizItem: extractTableCell(html, "종 목"),
    companyScale: extractTableCell(html, "기업규모"),
    bizStatus: extractTableCell(html, "사업자 현재 상태"),
    foundedDate: extractTableCell(html, "등록일"),
    employeeCount: `${employeeCount}`.replace(/명$/, "").trim(),
    homepage: homepageLink,
    industrySummary: extractIndustrySummary(html),
    domain: homepageToDomain(homepageLink),
    enrichmentSource: "bizno"
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" }
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.text();
}

async function listPaths(query, max = 10) {
  const html = await fetchHtml(`${SEARCH_BASE}/?query=${encodeURIComponent(query)}`);
  const paths = [];
  const re = /href="(\/article\/\d+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!paths.includes(m[1])) paths.push(m[1]);
    if (paths.length >= max) break;
  }
  return paths;
}

async function fetchByBizNo(bizNo) {
  const digits = normalizeBizNoDigits(bizNo);
  if (!digits) return null;

  const seen = new Set();
  for (const q of [formatBizNo(digits), digits]) {
    for (const p of await listPaths(q)) {
      if (seen.has(p)) continue;
      seen.add(p);
      const html = await fetchHtml(`${SEARCH_BASE}${p}`);
      const profile = parseBiznoArticleHtml(html, p);
      if (normalizeBizNoDigits(profile.bizNo) === digits) return profile;
    }
  }
  return null;
}

function loadOverrides() {
  const p = path.join(ROOT, "docs/data/overrides.json");
  if (!fs.existsSync(p)) {
    return { version: 2, updatedAt: new Date().toISOString(), favorites: [], companies: {} };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveOverrides(doc) {
  doc.version = 2;
  doc.updatedAt = new Date().toISOString();
  const text = JSON.stringify(doc, null, 2);
  for (const rel of ["docs/data/overrides.json", "data/overrides.json"]) {
    const p = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
}

const companyId = process.argv[2];
const bizNo = process.argv[3];
if (!companyId || !bizNo) {
  console.error("Usage: node scripts/enrichOneBizno.mjs <companyId> <bizNo>");
  process.exit(1);
}

const profile = await fetchByBizNo(bizNo);
if (!profile) {
  console.error("enrich_failed: bizno_no_match");
  process.exit(2);
}

const doc = loadOverrides();
doc.companies[companyId] = {
  ...(doc.companies[companyId] ?? {}),
  profile,
  domain: profile.domain || doc.companies[companyId]?.domain,
  companyNameKo: profile.companyNameLegal || doc.companies[companyId]?.companyNameKo,
  updatedAt: new Date().toISOString()
};
saveOverrides(doc);
console.log(JSON.stringify({ ok: true, companyId, profile }));
