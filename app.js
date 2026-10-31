import { cleanCompany, cleanFirstName, cleanRows, guessColumns, parseCsv, toCsv } from "./clean.js";

const PREVIEW = 300;
const $ = (id) => document.getElementById(id);
let csvRows = null;
let fileName = "leads.csv";
let output = null;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", String(x === t));
    });
    $("tab-csv").hidden = t.dataset.tab !== "csv";
    $("tab-paste").hidden = t.dataset.tab !== "paste";
    $("summary").hidden = true;
    $("table-wrap").hidden = true;
  }));

// ── CSV ─────────────────────────────────────────────────────────────────────
function fillSelect(sel, header, index) {
  sel.replaceChildren(el("option", { value: "-1" }, "(none)"), ...header.map((h, i) => el("option", { value: String(i) }, h || `Column ${i + 1}`)));
  sel.value = String(index);
}

async function loadFile(file) {
  fileName = file.name.replace(/\.csv$/i, "") + "-cleaned.csv";
  csvRows = parseCsv((await file.text()).replace(/^﻿/, ""));
  if (csvRows.length < 2) {
    $("filename").textContent = "That file has no rows under the header.";
    $("mapping").hidden = false;
    return;
  }
  const guess = guessColumns(csvRows[0]);
  fillSelect($("col-company"), csvRows[0], guess.company);
  fillSelect($("col-first"), csvRows[0], guess.first);
  fillSelect($("col-last"), csvRows[0], guess.last);
  $("filename").textContent = `${file.name}: ${(csvRows.length - 1).toLocaleString()} rows. Check the columns, then read the results below.`;
  $("mapping").hidden = false;
  runCsv();
}

function runCsv() {
  const cols = { company: +$("col-company").value, first: +$("col-first").value, last: +$("col-last").value };
  const { rows, stats } = cleanRows(csvRows, cols);
  output = rows;
  const n = rows[0].length;
  const body = rows.slice(1).map((r) => ({
    cells: [
      cols.company >= 0 ? r[cols.company] : null, cols.company >= 0 ? r[n - 4] : null,
      cols.first >= 0 ? r[cols.first] : null, cols.first >= 0 ? r[n - 3] : null,
      r[n - 1],
    ],
    changed: (cols.company >= 0 && r[cols.company] !== r[n - 4]) || (cols.first >= 0 && r[cols.first] !== r[n - 3]),
    review: r[n - 2] === "yes",
  }));
  const head = [];
  if (cols.company >= 0) head.push("Company", "company_clean");
  if (cols.first >= 0) head.push("First name", "first_name_clean");
  head.push("Review");
  renderTable(head, body.map((b) => ({ ...b, cells: b.cells.filter((_, i) => (i < 2 ? cols.company >= 0 : i < 4 ? cols.first >= 0 : true)) })));
  renderCounts([
    [stats.rows, "rows"],
    [stats.companyChanged, "company names cleaned", "pass"],
    [stats.firstChanged, "first names cleaned", "pass"],
    [stats.review, "need review", "warn"],
  ]);
  $("download").hidden = false;
}

$("file").addEventListener("change", (e) => e.target.files[0] && loadFile(e.target.files[0]));
["col-company", "col-first", "col-last"].forEach((id) => $(id).addEventListener("change", runCsv));
const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

$("download").addEventListener("click", () => {
  if (!output) return;
  const blob = new Blob(["﻿" + toCsv(output)], { type: "text/csv" });
  el("a", { href: URL.createObjectURL(blob), download: fileName }).click();
});

// ── Paste ───────────────────────────────────────────────────────────────────
$("paste-go").addEventListener("click", () => {
  const kind = $("paste-kind").value;
  const lines = $("paste").value.split(/\r?\n/).filter((l) => l.trim() !== "");
  const body = lines.map((raw) => {
    const r = kind === "company" ? cleanCompany(raw) : cleanFirstName(raw);
    const review = !r.value || r.flags.length > 0;
    return { cells: [raw, r.value, review ? r.flags.join("; ") || "nothing usable" : ""], changed: r.changed, review };
  });
  output = null;
  $("download").hidden = true;
  renderTable(["Input", kind === "company" ? "company_clean" : "first_name_clean", "Review"], body, true);
  renderCounts([
    [body.length, "names"],
    [body.filter((b) => b.changed).length, "cleaned", "pass"],
    [body.filter((b) => b.review).length, "need review", "warn"],
  ]);
});

// ── Table ───────────────────────────────────────────────────────────────────
let lastTable = null;

function renderCounts(items) {
  $("counts").replaceChildren(...items.map(([n, label, cls]) => el("span", { class: cls || "" }, el("b", {}, Number(n).toLocaleString()), ` ${label}`)));
  $("summary").hidden = false;
}

function renderTable(head, body, showAll = false) {
  lastTable = { head, body, showAll };
  const only = $("only-changed").checked && !showAll;
  const rows = only ? body.filter((b) => b.changed || b.review) : body;
  $("thead").replaceChildren(el("tr", {}, head.map((h) => el("th", {}, h))));
  $("tbody").replaceChildren(...rows.slice(0, PREVIEW).map((b) =>
    el("tr", { class: b.review ? "review" : b.changed ? "changed" : "" },
      b.cells.map((c, i) => {
        const isClean = head[i]?.endsWith("_clean");
        const isReview = i === b.cells.length - 1;
        return el("td", { class: isClean ? "clean" : isReview ? "reason" : "raw" }, isClean && c === "" ? el("span", { class: "blank" }, "(blank)") : c ?? "");
      }))));
  $("more").textContent = rows.length > PREVIEW
    ? `Showing ${PREVIEW} of ${rows.length.toLocaleString()} rows. The download has all of them.`
    : rows.length === 0 ? "Nothing needed changing." : "";
  $("table-wrap").hidden = false;
}

$("only-changed").addEventListener("change", () => lastTable && renderTable(lastTable.head, lastTable.body, lastTable.showAll));
