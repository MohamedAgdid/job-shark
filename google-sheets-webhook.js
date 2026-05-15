const SHEET_NAME = "Job Tracker";
const SPREADSHEET_NAME = "🎯 Job Shark — Tracker";

const HEADERS = [
  "Date",
  "Title",
  "Company",
  "Type",
  "Location",
  "Experience",
  "Stack",
  "Link",
  "Summary",
  "Source",
  "Publish Date",
  "Deadline",
  "Freshness",
  "Verified",
  "Relevance Score",
  "Found At",
  "Status",
];

function getOrCreateSpreadsheet() {
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    const file = files.next();
    return SpreadsheetApp.openById(file.getId());
  }
  const ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  return ss;
}

function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    addHeaders(sheet);
  }
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = JSON.stringify(firstRow) === JSON.stringify(HEADERS);
  if (!hasHeaders) addHeaders(sheet);
  return sheet;
}

function addHeaders(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).clearContent();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange
    .setBackground("#111827")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontFontSize(11)
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 340);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 130);
  sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 240);
  sheet.setColumnWidth(8, 340);
  sheet.setColumnWidth(9, 440);
  sheet.setColumnWidth(10, 120);
  sheet.setColumnWidth(11, 110);
  sheet.setColumnWidth(12, 110);
  sheet.setColumnWidth(13, 120);
  sheet.setColumnWidth(14, 90);
  sheet.setColumnWidth(15, 130);
  sheet.setColumnWidth(16, 110);
  sheet.setColumnWidth(17, 90);
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  headerRange.createFilter();
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setWrap(true);
}

function setup() {
  const ss = getOrCreateSpreadsheet();
  getOrCreateSheet(ss);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = getOrCreateSpreadsheet();
    const sheet = getOrCreateSheet(ss);
    const jobs = payload.jobs || [];
    const date = payload.date || new Date().toISOString().split("T")[0];
    const existingLinks = new Set();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const linkCol = HEADERS.indexOf("Link") + 1;
      const existing = sheet.getRange(2, linkCol, lastRow - 1, 1).getValues();
      existing.forEach((r) => {
        const val = (r[0] || "").toString().trim();
        if (val) existingLinks.add(val);
      });
    }
    const rows = [];
    let added = 0;
    let skipped = 0;
    jobs.forEach((job) => {
      const link = (job.link || "").trim();
      if (link && existingLinks.has(link)) {
        skipped++;
        return;
      }
      existingLinks.add(link);
      rows.push([
        date,
        job.title || "",
        job.company || "See posting",
        job.type || "Full-Time",
        job.location || "Morocco",
        job.experience || "",
        job.stack || "See posting",
        link,
        job.summary || "",
        job.source || "Unknown",
        job.publishDate || "",
        job.deadline || "",
        job.freshness || "Recent",
        job.verified ? "✅" : "",
        job.relevanceScore || 0,
        job.foundAt || date,
        "🆕 New",
      ]);
      added++;
    });
    if (rows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
      for (let i = 0; i < rows.length; i++) {
        const rowIndex = startRow + i;
        const bg = rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff";
        sheet.getRange(rowIndex, 1, 1, HEADERS.length).setBackground(bg);
        const linkCol = HEADERS.indexOf("Link") + 1;
        sheet.getRange(rowIndex, linkCol).setFontColor("#2563eb");
        const scoreCol = HEADERS.indexOf("Relevance Score") + 1;
        const score = Number(rows[i][14]);
        let scoreBg = "#fee2e2";
        if (score >= 80) scoreBg = "#dcfce7";
        else if (score >= 50) scoreBg = "#fef9c3";
        sheet.getRange(rowIndex, scoreCol).setBackground(scoreBg).setFontWeight("bold");
        const deadline = rows[i][11];
        if (deadline) {
          const deadlineCol = HEADERS.indexOf("Deadline") + 1;
          const parts = deadline.split("/");
          if (parts.length === 3) {
            const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            if (d < new Date()) {
              sheet.getRange(rowIndex, deadlineCol).setBackground("#fee2e2").setFontColor("#dc2626").setFontWeight("bold");
            } else {
              sheet.getRange(rowIndex, deadlineCol).setBackground("#dcfce7");
            }
          }
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, added, skipped, totalJobs: sheet.getLastRow() - 1 })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
