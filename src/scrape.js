const puppeteer = require('puppeteer');
const { logInfo, logWarn, logError } = require('./utils/logger');

/**
 * scrapePage
 * @param {string} url - Target URL to scrape.
 * @param {Object<string,string>} selectors - Map of field names to CSS selectors.
 * @param {Object} options - Extra options.
 * @param {number} options.timeoutMs - Max time to wait for each selector.
 * @param {boolean} options.headless - Whether to run browser headless.
 * @param {string} options.waitUntil - Puppeteer page.goto waitUntil option.
 * @returns {Promise<Object>} Extracted data keyed by selectors map.
 */
async function scrapePage(url, selectors = {}, options = {}) {
  const {
    timeoutMs = 5000,
    headless = true,
    waitUntil = 'domcontentloaded'
  } = options;

  if (!url) throw new Error('url is required');
  if (typeof url !== 'string') throw new Error('url must be a string');

  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  logInfo('Navigating', { url });

  try {
    await page.goto(url, { waitUntil, timeout: timeoutMs + 2000 });
  } catch (err) {
    logWarn('Navigation issue (continuing)', { error: err.message });
  }

  const results = {};
  for (const [field, selector] of Object.entries(selectors)) {
    try {
      logInfo('Waiting for selector', { field, selector });
      await page.waitForSelector(selector, { timeout: timeoutMs });
      results[field] = await page.$eval(selector, el => el.innerText.trim());
    } catch (err) {
      logWarn('Failed to extract selector', { field, selector, error: err.message });
      results[field] = null; // Mark missing
    }
  }

  // Add metadata
  results.__meta = {
    url,
    fetchedAt: new Date().toISOString(),
    success: Object.values(results).filter(v => v !== null && typeof v !== 'object').length
  };

  await browser.close();
  return results;
}

module.exports = { scrapePage };
