#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runScotlandCategoryScrape, DEFAULT_KEYWORDS } = require('./categoryScraper');
const { logInfo, logError } = require('../utils/logger');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`Usage: node src/public-scotland/cli_scotland.js [--keywords k1,k2] [--output file.json] [--headful] [--delay 1500] [--maxPages N]\n\nScrapes categories on Public Contracts Scotland matching keywords and paginates all results.\n`);
    process.exit(0);
  }

  let keywords = DEFAULT_KEYWORDS.slice();
  let output = 'scotland_results.json';
  let headless = true;
  let delayMs = 1500;
  let maxPages = Infinity;
  let detailPages = true;
  let abortOnFailure = true;
  let detailDelayMs = 600;
  let detailRetries = 3;
  let detailRetryBackoffMs = 700;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--keywords') {
      const list = (args[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) keywords = list;
      i++;
    } else if (a === '--output') {
      output = args[i + 1] || output;
      i++;
    } else if (a === '--headful') {
      headless = false;
    } else if (a === '--delay') {
      delayMs = parseInt(args[i + 1], 10) || delayMs;
      i++;
    } else if (a === '--maxPages') {
      const mp = parseInt(args[i + 1], 10);
      if (!isNaN(mp) && mp > 0) maxPages = mp;
      i++;
    } else if (a === '--no-detail') {
      detailPages = false;
    } else if (a === '--detail-delay') {
      detailDelayMs = parseInt(args[i + 1], 10) || detailDelayMs;
      i++;
    } else if (a === '--detail-retries') {
      detailRetries = parseInt(args[i + 1], 10) || detailRetries;
      i++;
    } else if (a === '--detail-retry-backoff') {
      detailRetryBackoffMs = parseInt(args[i + 1], 10) || detailRetryBackoffMs;
      i++;
    } else if (a === '--no-abort') {
      abortOnFailure = false;
    }
  }

  try {
  const data = await runScotlandCategoryScrape({ keywords, headless, delayMs, maxPages, detailPages, detailDelayMs, abortOnFailure, detailRetries, detailRetryBackoffMs });
    fs.writeFileSync(path.resolve(output), JSON.stringify(data, null, 2));
    logInfo('Scrape complete', { output, selectedCategories: data.__meta.totalSelected, totalItems: data.__meta.totalItems });
    console.log(`Saved to ${output}`);
  } catch (err) {
    logError('Failed Scotland category scrape', { error: err.message });
    process.exit(1);
  }
}

main();
