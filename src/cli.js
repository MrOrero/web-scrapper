#!/usr/bin/env node
const { scrapePage } = require('./scrape');
const { logInfo, logError } = require('./utils/logger');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`Usage: node src/cli.js <url> --selector name=CSS_SELECTOR [--selector title=h1] [--headful] [--timeout 8000]\n\nExamples:\n  node src/cli.js https://example.com --selector heading=h1\n  node src/cli.js https://news.ycombinator.com --selector title=.storylink --timeout 10000`);
    process.exit(0);
  }

  const url = args.find(a => /^https?:\/\//i.test(a));
  const selectors = {};
  let timeoutMs = 5000;
  let headless = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--selector') {
      const pair = args[i + 1];
      if (!pair || !pair.includes('=')) {
        logError('Invalid --selector usage, expected name=CSS');
        process.exit(1);
      }
      const [name, css] = pair.split('=');
      selectors[name] = css;
      i++;
    } else if (arg === '--timeout') {
      timeoutMs = parseInt(args[i + 1], 10) || timeoutMs;
      i++;
    } else if (arg === '--headful') {
      headless = false;
    }
  }

  if (!url) {
    logError('No URL provided. Use --help for usage.');
    process.exit(1);
  }

  if (Object.keys(selectors).length === 0) {
    // Provide a default demonstration selector
    selectors.heading = 'h1';
    logInfo('No selectors provided, defaulting to { heading: "h1" }');
  }

  try {
    const data = await scrapePage(url, selectors, { timeoutMs, headless });
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    logError('Scrape failed', { error: err.message });
    process.exit(1);
  }
}

main();
