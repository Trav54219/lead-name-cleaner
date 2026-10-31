import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCompany, cleanFirstName, parseCsv, toCsv, cleanRows, guessColumns } from "./clean.js";

const co = (raw) => cleanCompany(raw).value;
const fn = (raw, ctx) => cleanFirstName(raw, ctx).value;

test("company: legal suffixes", () => {
  assert.equal(co("Ajax Turner Company, Inc."), "Ajax Turner");
  assert.equal(co("Acme Holdings, LLC"), "Acme Holdings");
  assert.equal(co("Siemens GmbH"), "Siemens");
  assert.equal(co("Siemens AG"), "Siemens AG"); // bare AG is kept: on a US list it's usually agriculture
  assert.equal(co("Atlassian Pty Ltd"), "Atlassian");
  assert.equal(co("Smith & Co."), "Smith");
  assert.equal(co("Bain & Company"), "Bain");
  assert.equal(co("The Lithium Battery Company"), "The Lithium Battery Company");
  assert.equal(co("East Penn Manufacturing Company, Inc."), "East Penn Manufacturing");
});

test("company: shouting and lowercase, acronyms kept", () => {
  assert.equal(co("ABN TECH CORP"), "ABN Tech");
  assert.equal(co("accounting business solutions"), "Accounting Business Solutions");
  assert.equal(co("NORTHFIELD PLUMBING AND HEATING"), "Northfield Plumbing and Heating");
  assert.equal(co("HubSpot"), "HubSpot");
  assert.equal(co("IBM"), "IBM");
});

test("company: taglines, dba, parentheses, trademarks, other scripts", () => {
  assert.equal(co("AlaMark Technologies | FileMaker Consultants | Premier FileMaker Support"), "AlaMark Technologies");
  assert.equal(co("318, Inc dba Hamiltons Bud and Bloom"), "Hamiltons Bud and Bloom");
  assert.equal(co("Acme Roofing (formerly Beta Roofing LLC)"), "Acme Roofing");
  assert.equal(co("Zapier™"), "Zapier");
  assert.equal(co("Alraqhi Building Materials | الرقهي"), "Alraqhi Building Materials");
  assert.equal(co("Coca-Cola"), "Coca-Cola");
  assert.equal(co("Bright Smile Dental - Dentist in Austin TX"), "Bright Smile Dental");
  assert.equal(co("Pristine Dental Oakley CA"), "Pristine Dental");
});

test("company: words that look like suffixes but aren't", () => {
  assert.equal(co("Pure Med Spa"), "Pure Med Spa");
  assert.equal(co("Downtown Medicine and Spa"), "Downtown Medicine and Spa");
  assert.equal(co("Valley AG"), "Valley AG");
  assert.equal(co("Lorena Luca MED + SPA"), "Lorena Luca MED + SPA");
  assert.equal(co("CIDV"), "CIDV");
  assert.equal(co("Body Sculpt LA"), "Body Sculpt LA");
});

test("company: junk abstains, never guesses", () => {
  for (const j of ["N/A", "Self-employed", "Retired", "TBD", "Confidential", "Stealth Startup", "-", ""]) {
    assert.equal(co(j), "", j);
  }
});

test("first name: honorifics, credentials, casing", () => {
  assert.equal(fn("Dr Matthew"), "Matthew");
  assert.equal(fn("Dr. Ruba"), "Ruba");
  assert.equal(fn("PAUL"), "Paul");
  assert.equal(fn("javonne"), "Javonne");
  assert.equal(fn("Sarah, MD"), "Sarah");
  assert.equal(fn("DeAndrea"), "DeAndrea");
  assert.equal(fn("o'brien"), "O'Brien");
  assert.equal(fn("mary-kate"), "Mary-Kate");
});

test("first name: emoji, nicknames, full names, hiring tails, possessives", () => {
  assert.equal(fn("👋 James"), "James");
  assert.equal(fn("★ Marc"), "Marc");
  assert.equal(fn("Kathryn (Katie)"), "Katie");
  assert.equal(fn('Robert "Bob"'), "Bob");
  assert.equal(fn("Robert wilkie", { last: "Wilkie" }), "Robert");
  assert.equal(fn("Dr Sean Li We Are Actively Hiring At Antai Global"), "Sean");
  assert.equal(fn("Araceli'S"), "Araceli");
  assert.equal(fn("Gowinder "), "Gowinder");
  assert.equal(fn("Juan Carlos"), "Juan Carlos");
  assert.equal(fn("A.J."), "A.J.");
  assert.equal(fn("Pravinbhai K."), "Pravinbhai");
  assert.equal(cleanFirstName("Julie", { company: "Julie Collins Chiropractic" }).flags.length, 0);
});

test("first name: not-a-person cases are flagged, never filled", () => {
  assert.equal(fn("N/A"), "");
  assert.equal(fn(""), "");
  assert.ok(cleanFirstName("Admin").flags.length);
  assert.ok(cleanFirstName("AAA", { company: "AAA Upholstery" }).flags.length);
  assert.ok(cleanFirstName("O.").flags.length);
  assert.ok(cleanFirstName("TVK").flags.length);
  const ru = cleanFirstName("Дарья");
  assert.equal(ru.value, "Дарья");
  assert.ok(ru.flags.length);
  assert.equal(cleanFirstName("Matthew").flags.length, 0);
});

test("CSV round trip with quotes, commas and newlines", () => {
  const text = 'First Name,Last Name,Company\n"Dr Matthew",Ng,"Ajax Turner Company, Inc."\nADMIN,,"ACME ""WEST"" LLC"\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][2], "Ajax Turner Company, Inc.");
  const cols = guessColumns(rows[0]);
  assert.deepEqual(cols, { company: 2, first: 0, last: 1 });
  const { rows: out, stats } = cleanRows(rows, cols);
  assert.equal(out[1][3], "Ajax Turner");
  assert.equal(out[1][4], "Matthew");
  assert.equal(out[2][5], "yes");
  assert.equal(stats.review, 1);
  assert.deepEqual(parseCsv(toCsv(out)), out);
});
