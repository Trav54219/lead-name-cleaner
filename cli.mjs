#!/usr/bin/env node
// node cli.mjs leads.csv > leads-cleaned.csv
// Guesses the company, first name and last name columns; override with --company "Account Name" etc.
import { readFileSync } from "node:fs";
import { cleanRows, guessColumns, parseCsv, toCsv } from "./clean.js";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file) {
  console.error('usage: node cli.mjs leads.csv [--company "Company"] [--first "First Name"] [--last "Last Name"] > cleaned.csv');
  process.exit(2);
}
const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const cols = guessColumns(rows[0]);
for (const k of ["company", "first", "last"]) {
  const i = args.indexOf(`--${k}`);
  if (i >= 0) cols[k] = rows[0].indexOf(args[i + 1]);
}
const { rows: out, stats } = cleanRows(rows, cols);
process.stdout.write(toCsv(out) + "\n");
console.error(`${stats.rows} rows: ${stats.companyChanged} company names and ${stats.firstChanged} first names cleaned, ${stats.review} need review`);
