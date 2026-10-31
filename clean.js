// Clean company names and first names for cold email merge fields.
// Deterministic and dependency-free: the same file runs in the browser and in Node.
//
// cleanCompany(raw)                    -> { value, changed, flags }
// cleanFirstName(raw, { last, company }) -> { value, changed, flags }
//
// `value` is "" when the input isn't usable. `flags` lists why a row should be
// read by a person before it goes out. Never fill the gap with "there" or "your team".

const JUNK = new Set([
  "", "n/a", "na", "none", "null", "nil", "-", "--", ".", "?", "unknown", "test", "tbd", "tba",
  "self-employed", "self employed", "selfemployed", "retired", "unemployed", "freelance", "freelancer",
  "independent", "consultant", "student", "confidential", "confidential company", "private",
  "private practice", "stealth", "stealth startup", "stealth mode", "various", "not applicable",
  "looking for work", "open to work", "home", "personal",
]);

// Legal suffixes, longest first. Stripped from the end, repeatedly.
const LEGAL = [
  "pty ltd", "pty. ltd.", "pvt ltd", "pvt. ltd.", "private limited", "l.l.c.", "l.l.c", "llc", "l.p.", "llp", "lp", "pllc",
  "incorporated", "inc.", "inc", "corporation", "corp.", "corp", "company", "co.", "co", "limited", "ltd.", "ltd",
  "plc", "p.c.", "pc", "gmbh", "s.a.", "s.a.s.", "s.r.l.", "srl", "b.v.", "n.v.",
  "a/s", "k.k.", "s.l.", "s.p.a.", "sarl", "pte ltd", "pte. ltd.",
];
// Left out on purpose: "Spa", "AG", "AS", "SA", "SL", "AB", "Oy", "KK", "BV", "NV" as bare words. On a US list
// "Pure Med Spa" is a med spa and "Valley AG" is agriculture, not an Italian SpA or a German AG.

const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

const SMALL_WORDS = new Set(["and", "of", "the", "for", "in", "on", "at", "to", "by", "a", "an", "de", "la", "du", "von", "van", "der"]);

const NON_LATIN = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

const squash = (s) => s.replace(/\s+/g, " ").trim();
const isAllUpper = (s) => /[A-Z]/.test(s) && s === s.toUpperCase();
const isAllLower = (s) => /[a-z]/.test(s) && s === s.toLowerCase();

function capWord(w) {
  // Title-case one word, keeping hyphen and apostrophe parts: o'brien -> O'Brien, smith-jones -> Smith-Jones
  return w
    .toLowerCase()
    .replace(/(^|[-'’])([a-z\u00E0-\u00FF])/g, (_m, sep, ch) => sep + ch.toUpperCase())
    .replace(/^Mc([a-z])/, (_m, ch) => "Mc" + ch.toUpperCase());
}

function titleCase(s, { keepShortUpper = false } = {}) {
  return s
    .split(" ")
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (keepShortUpper && bare.length > 0 && bare.length <= 3 && isAllUpper(w) && !SMALL_WORDS.has(bare.toLowerCase())) return w;
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      return capWord(w);
    })
    .join(" ");
}

function stripLegal(name) {
  let s = name;
  for (let guard = 0; guard < 5; guard++) {
    const before = s;
    const lower = s.toLowerCase();
    for (const suf of LEGAL) {
      if (/^the\s/.test(lower) && (suf === "company" || suf === "co" || suf === "co.")) continue; // "The Lithium Battery Company"
      const re = new RegExp(`[\\s,]+${suf.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`, "i");
      if (re.test(lower)) {
        const cut = s.replace(re, "");
        if (cut.replace(/[^A-Za-z0-9]/g, "").length >= 2) s = cut;
        break;
      }
    }
    s = s.replace(/[\s,&.\-]+$/, "").replace(/\s*&\s*$/, "");
    if (s === before) break;
  }
  return s;
}

export function cleanCompany(raw) {
  const original = raw == null ? "" : String(raw);
  const flags = [];
  let s = squash(original.replace(/&amp;/gi, "&").replace(/[™®©℠]/g, ""));
  if (JUNK.has(s.toLowerCase())) return { value: "", changed: original !== "", flags: ["not a company name"] };

  // "318, Inc dba Hamiltons Bud and Bloom" -> the trading name
  const dba = s.match(/\b(?:d\/?b\/?a|doing business as|t\/a|trading as)\b[:\s]+(.+)$/i);
  if (dba) s = dba[1];
  // Taglines and service lists after a separator: "AlaMark Technologies | FileMaker Consultants"
  s = s.split(/\s+[|•·]\s+|\s+[–—]\s+|\s+-\s+|\s*\|\s*/)[0];
  // Parenthetical descriptors: "Acme (formerly Beta Corp)"
  s = squash(s.replace(/\s*[([].*?[)\]]\s*/g, " "));
  // A second-language duplicate in another script: keep the Latin part when there is one
  if (NON_LATIN.test(s) && LATIN_LETTER.test(s)) {
    s = squash(s.replace(new RegExp(`${NON_LATIN.source}+`, "g"), " ").replace(/[\s:/,-]+$/, ""));
  }
  s = stripLegal(s);
  s = s.replace(/^[\s"'`,.-]+|[\s"'`,.:;-]+$/g, "");

  // An appended "City ST": "Pristine Dental Oakley CA" -> "Pristine Dental"
  const loc = s.match(/^(.{4,}?)\s+[A-Z][a-z]+\s+([A-Z]{2})$/);
  // LA, NY and DC are left alone: "Body Sculpt LA" is a brand, not Louisiana. At least two words must remain.
  if (loc && US_STATES.has(loc[2]) && !["LA", "NY", "DC"].includes(loc[2]) && loc[1].trim().split(/\s+/).length >= 2) {
    s = loc[1];
    flags.push("removed a city and state");
  }

  if (isAllUpper(s) && !s.includes(" ")) {
    // one shouted word is usually an acronym (IBM, CIDV): leave it
  } else if (isAllUpper(s) && s.replace(/[^A-Z]/g, "").length > 3) s = titleCase(s, { keepShortUpper: true });
  else if (isAllLower(s)) s = titleCase(s);

  if (!s || !/[A-Za-z0-9\u00C0-\u024F]/.test(s)) return { value: "", changed: true, flags: ["nothing usable left"] };
  if (NON_LATIN.test(s) && !LATIN_LETTER.test(s)) flags.push("non-Latin script, check the campaign language");
  if (s.length > 40) flags.push("long, check it reads naturally");
  if (/^\d+$/.test(s)) flags.push("only digits");
  if (/^[A-Z0-9]{2,4}$/.test(s) && /[A-Z]/.test(s)) flags.push("acronym, check it's how they say it");
  return { value: s, changed: s !== original, flags };
}

// ── First names ─────────────────────────────────────────────────────────────

const HONORIFICS = /^(?:dr|doctor|mr|mrs|ms|miss|mx|prof|professor|rev|reverend|fr|father|sir|dame|hon|capt|captain|col|sgt|lt|maj|pastor|rabbi|imam|chef|coach)\.?\s+/i;
const CREDENTIALS = /[,\s]+(?:md|m\.d\.|do|dds|dmd|phd|ph\.d\.|mba|cpa|cfa|cfp|esq|jd|rn|np|pa-c|pe|pmp|shrm-cp|jr|sr|ii|iii|iv)\.?$/i;
const ROLE_WORDS = new Set([
  "admin", "administrator", "info", "information", "sales", "office", "team", "support", "hr", "accounts",
  "accounting", "billing", "marketing", "contact", "hello", "hi", "manager", "owner", "reception", "frontdesk",
  "front", "careers", "jobs", "hiring", "recruiting", "service", "services", "customer", "dept", "department",
  "general", "mail", "enquiries", "inquiries", "orders", "help", "noreply", "webmaster", "ceo", "founder",
]);
const HIRING_TAIL = /\b(?:we\s+are|we're|is\s+hiring|hiring|actively|looking\s+for|open\s+to|recruiting)\b.*$/i;

export function cleanFirstName(raw, { last = "", company = "" } = {}) {
  const original = raw == null ? "" : String(raw);
  const flags = [];
  let s = squash(original);
  if (JUNK.has(s.toLowerCase())) return { value: "", changed: original !== "", flags: ["no first name"] };

  // Nickname in parentheses or quotes wins: Kathryn (Katie) -> Katie, Robert "Bob" -> Bob
  const nick = s.match(/[("“'](\p{L}[\p{L}'’-]{1,})[)"”']/u);
  if (nick) s = nick[1];

  s = s.replace(/^[^\p{L}]+/u, "");           // leading emoji, stars, bullets
  const hadTail = HIRING_TAIL.test(s);
  s = s.replace(HIRING_TAIL, "");             // "Sean Li We Are Actively Hiring At Antai Global"
  for (let i = 0; i < 2; i++) s = s.replace(HONORIFICS, "");
  for (let i = 0; i < 3; i++) s = s.replace(CREDENTIALS, "");
  s = s.replace(/['’][sS]$/, "");              // possessive artifact: Araceli'S -> Araceli
  s = s.replace(/[^\p{L}'’\-\s.]/gu, " ");     // stray symbols and digits
  s = squash(s).replace(/[.\-'’]+$/, "");

  if (/^(?:\p{L}\.\s?){2,}$/u.test(squash(original).replace(/^.*?(\p{L}\.\s?\p{L}\.)/u, "$1"))) {
    const initials = squash(original).match(/(?:\p{L}\.\s?){2,}/u)[0].replace(/\s/g, "").toUpperCase();
    return { value: initials, changed: initials !== original, flags: [] }; // A.J. stays A.J.
  }

  let words = s.split(" ").filter(Boolean);
  if (words.length > 1) words = words.filter((w, i) => i === 0 || w.replace(/[.\-'’]/g, "").length > 1); // "Pravinbhai K." -> Pravinbhai
  const lastLower = squash(String(last || "")).toLowerCase();
  if (words.length > 1 && lastLower && words[words.length - 1].toLowerCase() === lastLower) words.pop(); // full name in the first-name field
  if (hadTail && words.length > 1) words = words.slice(0, 1); // the field held more than a name
  if (words.length > 2) {
    flags.push("several words, kept the first");
    words = words.slice(0, 1);
  }
  s = words.join(" ");

  if (NON_LATIN.test(s)) {
    flags.push("non-Latin script, kept as written");
    return { value: s, changed: s !== original, flags };
  }
  if (isAllUpper(s) || isAllLower(s)) s = words.map(capWord).join(" ");

  const bare = s.replace(/[^\p{L}]/gu, "");
  const companyLower = squash(String(company || "")).toLowerCase();
  if (!bare) return { value: "", changed: true, flags: ["no first name left"] };
  if (bare.length === 1) flags.push("only an initial");
  if (ROLE_WORDS.has(bare.toLowerCase())) flags.push("a mailbox or role word, not a person");
  // "AAA" at "AAA Upholstery" is the company in the name field. "Julie" at "Julie Collins Chiropractic" is the owner.
  const shouted = isAllUpper(original.trim()) && original.trim().length <= 5;
  if (companyLower && (companyLower === s.toLowerCase() || (shouted && companyLower.split(/\s+/)[0] === s.toLowerCase()))) {
    flags.push("matches the company name");
    return { value: squash(original), changed: false, flags }; // not a person: don't pretend-fix the casing
  }
  if (/^[A-Z]{2,4}$/.test(original.trim()) && !/[AEIOUY]/.test(original.trim())) flags.push("letters with no vowel, likely initials or a company");
  if (bare.length > 20) flags.push("unusually long");
  return { value: s, changed: s !== original, flags };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toCsv(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

/** Guess which header holds what. */
export function guessColumns(header) {
  const find = (...res) => header.findIndex((h) => res.some((re) => re.test(h.trim())));
  return {
    company: find(/^company(\s*name)?$/i, /^(organization|organisation|account)(\s*name)?$/i, /company/i),
    first: find(/^first[\s_]*name$/i, /^first$/i, /^given[\s_]*name$/i, /first/i),
    last: find(/^last[\s_]*name$/i, /^last$/i, /^surname$/i, /^family[\s_]*name$/i, /last/i),
  };
}

/** Clean a parsed CSV (header row first). Appends company_clean, first_name_clean, needs_review, review_reason. */
export function cleanRows(rows, cols) {
  const [header, ...body] = rows;
  const out = [[...header, "company_clean", "first_name_clean", "needs_review", "review_reason"]];
  const stats = { rows: body.length, companyChanged: 0, firstChanged: 0, review: 0 };
  for (const r of body) {
    const company = cols.company >= 0 ? cleanCompany(r[cols.company]) : null;
    const first = cols.first >= 0
      ? cleanFirstName(r[cols.first], { last: cols.last >= 0 ? r[cols.last] : "", company: cols.company >= 0 ? r[cols.company] : "" })
      : null;
    const reasons = [];
    if (company && (!company.value || company.flags.length)) reasons.push(...company.flags.map((f) => `company: ${f}`));
    if (first && (!first.value || first.flags.length)) reasons.push(...first.flags.map((f) => `first name: ${f}`));
    if (company?.changed) stats.companyChanged++;
    if (first?.changed) stats.firstChanged++;
    if (reasons.length) stats.review++;
    out.push([...r, company?.value ?? "", first?.value ?? "", reasons.length ? "yes" : "no", reasons.join("; ")]);
  }
  return { rows: out, stats };
}
