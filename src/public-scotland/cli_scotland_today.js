#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runScotlandCategoryScrape, DEFAULT_KEYWORDS } = require('./categoryScraper');
const { logInfo, logError } = require('../utils/logger');

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`; // Notice pages appear to use DD/MM/YYYY format
}

// Some notices might store publicationDate or deadlineDate; we check both for equality with today.
function isTodayNotice(item, todayStr) {
  const fields = [item.date, item.publicationDate, item.deadlineDate];
  return fields.filter(Boolean).some(f => f.startsWith(todayStr));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`Usage: node src/public-scotland/cli_scotland_today.js [--keywords k1,k2] [--output file.json] [--headful]\n\nScrapes Public Contracts Scotland notices for the current date only.`);
    process.exit(0);
  }

  let keywords = DEFAULT_KEYWORDS.slice();
  let output = `scotland_today_${Date.now()}.json`;
  let headless = true;
  let detailPages = true;
  let abortOnFailure = false; // be tolerant for daily run
  let detailDelayMs = 400;
  let detailRetries = 3;
  let detailRetryBackoffMs = 600;
  let maxPages = 5; // safety cap for daily run

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--keywords') { const list = (args[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean); if (list.length) keywords = list; i++; }
    else if (a === '--output') { output = args[i + 1] || output; i++; }
    else if (a === '--headful') { headless = false; }
    else if (a === '--maxPages') { const mp = parseInt(args[i + 1], 10); if (!isNaN(mp) && mp > 0) maxPages = mp; i++; }
    else if (a === '--no-detail') { detailPages = false; }
    else if (a === '--detail-delay') { detailDelayMs = parseInt(args[i + 1], 10) || detailDelayMs; i++; }
    else if (a === '--detail-retries') { detailRetries = parseInt(args[i + 1], 10) || detailRetries; i++; }
    else if (a === '--detail-retry-backoff') { detailRetryBackoffMs = parseInt(args[i + 1], 10) || detailRetryBackoffMs; i++; }
  }

  const today = todayIsoDate();
  logInfo('Running today-only Scotland scrape', { today });

  try {
    const data = await runScotlandCategoryScrape({ keywords, headless, maxPages, detailPages, detailDelayMs, abortOnFailure, detailRetries, detailRetryBackoffMs });
    const filtered = data.items.filter(item => isTodayNotice(item, today));
    const payload = { ...data, __meta: { ...data.__meta, filter: 'today', today }, items: filtered, totalToday: filtered.length };
    fs.writeFileSync(path.resolve(output), JSON.stringify(payload, null, 2));
    logInfo('Today scrape complete', { output, totalToday: filtered.length, totalRaw: data.items.length });
    console.log(`Saved today-only results to ${output}`);
  } catch (err) {
    logError('Failed today-only Scotland scrape', { error: err.message });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { todayIsoDate, isTodayNotice };
