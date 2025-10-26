#!/usr/bin/env node
const puppeteer = require('puppeteer');
const { logInfo, logWarn, logError } = require('./utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const targetUrl = args.find(a => /^https?:\/\//i.test(a)) || 'https://open-uk.org/opportunities';
  const filterArgIndex = args.indexOf('--filter');
  const filter = filterArgIndex !== -1 ? args[filterArgIndex + 1] : null;
  const headful = args.includes('--headful');

  logInfo('Starting network capture', { targetUrl, filter });

  const browser = await puppeteer.launch({ headless: !headful });
  const page = await browser.newPage();

  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

  const captured = [];

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (filter && !url.includes(filter)) return;
      const status = response.status();
      const req = response.request();
      const method = req.method();

      let bodySummary = null;
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('application/json')) {
        try {
          const json = await response.json();
          bodySummary = {
            keys: Object.keys(json).slice(0, 15),
            sample: JSON.stringify(json).slice(0, 300) + '...'
          };
        } catch (e) {
          bodySummary = { error: e.message };
        }
      } else if (ct.includes('text')) {
        try {
          const text = await response.text();
          bodySummary = { textSnippet: text.slice(0, 200) + '...' };
        } catch (e) {
          bodySummary = { error: e.message };
        }
      }

      const entry = { url, status, method, contentType: ct, bodySummary };
      captured.push(entry);
      if (!filter || (filter && url.includes(filter))) {
        logInfo('Captured', { url, status, method, contentType: ct });
      }
    } catch (err) {
      logWarn('Failed to process response', { error: err.message });
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Ensure body is present
    await page.waitForSelector('body', { timeout: 15000 }).catch(() => logWarn('Body selector wait failed'));
    // Passive delay for additional network requests
    await new Promise(r => setTimeout(r, 8000));
  } catch (err) {
    logWarn('Navigation error', { error: err.message });
  }

  await browser.close();

  const filtered = filter ? captured.filter(c => c.url.includes(filter)) : captured;
  console.log(JSON.stringify({ targetUrl, totalCaptured: captured.length, filtered: filtered }, null, 2));
}

run().catch(e => { logError('network_capture failed', { error: e.message }); process.exit(1); });
