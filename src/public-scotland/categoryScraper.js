const puppeteer = require('puppeteer');
const { logInfo, logWarn, logError } = require('../utils/logger');

// Default keyword list (normalized to lowercase)
const DEFAULT_KEYWORDS = [
  'health', 'accommodation', 'accomodation', 'transport', 'transportation'
];

// Selectors derived from provided button snippet & modal intention
// NOTE: These may need refinement after inspecting live DOM.
const SELECTORS = {
  browseCategoriesButton: '#ctl00_maincontent_categoryPickerModal_bc_btn',
  categoriesModal: '#ctl00_maincontent_categoryPickerModal_categoryPickerModal',
  // Precise Add Codes submit button (acts as search trigger)
  addCodesButton: 'input[type="submit"][name="ctl00$maincontent$categoryPickerModal$categoryPickerModal$ctl03$ctl00"]',
  // Within modal: checkboxes for CPV codes
  modalCheckboxes: '#ctl00_maincontent_categoryPickerModal_categoryPickerModal input[type="checkbox"]',
  // Potential plus expanders ("+") inside modal
  // Specific plus expanders inside tree (e.g., Telerik style rtPlus spans)
  plusIcon: '#ctl00_maincontent_categoryPickerModal_categoryPickerModal .rtPlus',
  // Loading spinner displayed while results update
  loadingSpinner: '.pcs-updateprogress',
  // Results & pagination
  resultsRow: 'tbody > tr.pcs-tbl-row, tbody > tr.pcs-tbl-altrow',
  nextPage: 'a[title="Next"], .pagination a.next, .pager a.next, a[id*="lnkNext"]',
  disabledNext: '.pagination a.next.disabled, .pager a.next.disabled',
  noResults: '.no-results, #noResults, .noRecords'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

// Merge accomodation misspelling into accommodation canonical form
function canonicalKeyword(k) {
  const n = normalize(k);
  if (n === 'accomodation') return 'accommodation';
  return n;
}

/**
 * filterCategories
 * @param {Array<string>} categories Raw category names
 * @param {Array<string>} keywords Keyword list
 * @returns {Array<{name:string, matchedKeyword:string}>}
 */
function filterCategories(categories, keywords = DEFAULT_KEYWORDS) {
  const normKeywords = Array.from(new Set(keywords.map(canonicalKeyword)));
  const selected = [];
  const seen = new Set();
  for (const cat of categories) {
    const nCat = normalize(cat);
    for (const kw of normKeywords) {
      // Direct match OR accommodation misspelling fallback
      if (nCat.includes(kw) || (kw === 'accommodation' && nCat.includes('accomodation'))) {
        if (!seen.has(nCat)) {
          selected.push({ name: cat.trim(), matchedKeyword: kw });
          seen.add(nCat);
        }
        break; // Avoid duplicate keyword matches
      }
    }
  }
  return selected;
}

/**
 * Open the CPV category modal.
 * @param {puppeteer.Page} page
 */
async function openCategoriesModal(page) {
  logInfo('Opening categories modal');
  await page.waitForSelector(SELECTORS.browseCategoriesButton, { timeout: 12000 });
  await page.click(SELECTORS.browseCategoriesButton);
  await page.waitForSelector(SELECTORS.categoriesModal, { timeout: 12000 });
}

/**
 * Expand all plus (+) nodes inside the modal to reveal nested categories.
 * Heuristic: finds elements whose innerText is exactly '+' and clicks them.
 * @param {puppeteer.Page} page
 */
async function expandAllModalPlus(page) {
  logInfo('Expanding modal tree plus icons');
  const maxIterations = 30; // safety cap
  for (let i = 0; i < maxIterations; i++) {
    // Click all currently visible plus icons this iteration
    const clicked = await page.$$eval(SELECTORS.plusIcon, icons => {
      let count = 0;
      icons.forEach(icon => {
        const style = window.getComputedStyle(icon);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          try { icon.click(); count++; } catch (_) {}
        }
      });
      return count;
    });
    if (clicked === 0) {
      logInfo('No more plus icons to expand', { iterations: i });
      break;
    }
    logInfo('Expanded plus icons batch', { clicked, iteration: i + 1 });
    await sleep(400); // brief wait for DOM to update
  }
}

/**
 * Extract all category option texts from the modal.
 * @param {puppeteer.Page} page
 * @returns {Promise<string[]>}
 */
async function extractModalCategories(page) {
  const cats = await page.$$eval(SELECTORS.modalCheckboxes, inputs => {
    return inputs.map(i => {
      // Assume label text near checkbox within parent or sibling.
      let txt = '';
      const parent = i.closest('div, li, span, tr') || i.parentElement;
      if (parent) txt = parent.innerText || '';
      return txt.trim();
    }).filter(Boolean);
  });
  logInfo('Extracted modal categories', { count: cats.length });
  return cats;
}

/**
 * Select (tick) all checkboxes whose surrounding text matches keywords.
 * Returns array of matched category texts actually clicked.
 * @param {puppeteer.Page} page
 * @param {string[]} keywords
 */
async function selectMatchingCategories(page, keywords) {
  const matched = await page.$$eval(SELECTORS.modalCheckboxes, (inputs, keywords) => {
    const normKw = keywords.map(k => k.toLowerCase());
    const chosen = [];
    inputs.forEach(cb => {
      const container = cb.closest('div, li, span, tr') || cb.parentElement;
      const txt = (container ? container.innerText : cb.innerText || '').trim();
      const low = txt.toLowerCase();
      if (normKw.some(kw => low.includes(kw))) {
        cb.click();
        chosen.push(txt);
      }
    });
    return chosen;
  }, keywords);
  logInfo('Selected matching categories', { count: matched.length });
  return matched;
}

/**
 * Click "Add Codes" inside modal.
 * @param {puppeteer.Page} page
 */
async function confirmAddCodes(page) {
  logInfo('Confirming Add Codes');
  try {
    await page.waitForSelector(SELECTORS.addCodesButton, { timeout: 10000 });
    await page.click(SELECTORS.addCodesButton);
  } catch (err) {
    logError('Failed to click Add Codes button', { error: err.message });
    throw err; // Abort early; cannot proceed without search trigger
  }
  // Wait for either spinner + disappearance OR first results row
  try {
    const spinnerAppeared = await Promise.race([
      page.waitForSelector(SELECTORS.loadingSpinner, { timeout: 8000 }).then(() => true).catch(() => false),
      page.waitForSelector(SELECTORS.resultsRow, { timeout: 8000 }).then(() => false).catch(() => false)
    ]);
    if (spinnerAppeared) {
      // Wait until spinner gone OR results rows visible
      try {
        await Promise.race([
          page.waitForFunction(sel => !document.querySelector(sel), { timeout: 45000 }, SELECTORS.loadingSpinner),
          page.waitForSelector(SELECTORS.resultsRow, { timeout: 45000 })
        ]);
      } catch (e) {
        logWarn('Spinner/results wait race timed out', { error: e.message });
      }
    }
    logInfo('Proceeding to results after Add Codes');
  } catch (e) {
    logWarn('General wait after Add Codes failed', { error: e.message });
  }
}

/**
 * Select a category. This is heuristic; may need refinement.
 * @param {puppeteer.Page} page 
 * @param {string} categoryName 
 */
async function selectCategory(page, categoryName) {
  const targetNorm = normalize(categoryName);
  logInfo('Selecting category', { category: categoryName });
  const candidates = await page.$$(SELECTORS.categoryItems);
  for (const el of candidates) {
    const text = await page.evaluate(e => (e.innerText || e.textContent || '').trim(), el);
    if (normalize(text) === targetNorm) {
      try { await el.click(); } catch (e) { logWarn('Click failed on category', { category: categoryName, error: e.message }); }
      return true;
    }
  }
  logWarn('Category not matched in DOM', { category: categoryName });
  return false;
}

/**
 * Trigger search after category selection.
 * @param {puppeteer.Page} page 
 */
async function triggerSearch(page) {
  // Deprecated: Add Codes now performs the search.
  logInfo('triggerSearch() no-op (search initiated via Add Codes)');
}

/**
 * Extract result rows from current page.
 * @param {puppeteer.Page} page 
 * @param {string} categoryName
 */
async function extractResultsPage(page, categoryName) {
  // Wait a bit for results to load (use sleep to avoid puppeteer version issues)
  await sleep(800);
  // Detect no results
  const noRes = await page.$(SELECTORS.noResults);
  if (noRes) {
    logInfo('No results for category page', { category: categoryName });
    return [];
  }
  let rows;
  try {
    await page.waitForSelector(SELECTORS.resultsRow, { timeout: 10000 });
    rows = await page.$$(SELECTORS.resultsRow);
  } catch (err) {
    logWarn('No result rows found (timeout)', { category: categoryName, error: err.message });
    return [];
  }

  const data = [];
  for (const row of rows) {
    const item = await page.evaluate(r => {
      const tds = r.querySelectorAll('td');
      const metaCell = tds[0];
      const contentCell = tds[1];
      const dateText = metaCell ? metaCell.innerText.split('\n')[0].trim() : null;
      const anchor = contentCell ? contentCell.querySelector('a.ns-list-link') : null;
      const detailHref = anchor ? anchor.getAttribute('href') : null;
      const title = anchor ? anchor.childNodes[0].textContent.trim() : null;
      const nsItemDiv = contentCell ? contentCell.querySelector('div.ns-item') : null;
      const fields = {};
      if (nsItemDiv) {
        // Extract key-value pairs like "Reference No:" etc.
        const spans = Array.from(nsItemDiv.querySelectorAll('span.ns-item-title'));
        spans.forEach(span => {
          const label = (span.innerText || '').replace(/:\s*$/, '').trim();
          const remainder = span.nextSibling && span.nextSibling.nodeType === Node.TEXT_NODE ? span.nextSibling.textContent.trim() : '';
          if (label) fields[label] = remainder;
        });
      }
      const iconAlts = Array.from(r.querySelectorAll('img.ns-item-icon')).map(i => i.getAttribute('alt'));
      return {
        date: dateText,
        title,
        detailUrl: detailHref ? new URL(detailHref, 'https://www.publiccontractsscotland.gov.uk').toString() : null,
        referenceNo: fields['Reference No'] || null,
        ocid: fields['OCID'] || null,
        publishedBy: fields['Published By'] || null,
        deadlineDate: fields['Deadline Date'] || null,
        noticeType: fields['Notice Type'] || null,
        iconFlags: iconAlts,
        rawRowText: (r.innerText || '').trim()
      };
    }, row);
    data.push({ ...item, category: categoryName });
  }
  logInfo('Extracted results page rows', { category: categoryName, count: data.length });
  return data;
}

/**
 * Paginate through all pages collecting results.
 * @param {puppeteer.Page} page 
 * @param {string} categoryName 
 * @param {Object} opts
 * @param {number} opts.maxPages Optional safety cap (default Infinity)
 */
async function extractAllPages(page, categoryName, opts = {}) {
  const { maxPages = Infinity, delayBetweenPagesMs = 800 } = opts;
  let all = [];
  let pageNum = 1;
  while (pageNum <= maxPages) {
    const part = await extractResultsPage(page, categoryName);
    all = all.concat(part);
    // Try next page
    const nextDisabled = await page.$(SELECTORS.disabledNext);
    const nextBtn = await page.$(SELECTORS.nextPage);
    if (!nextBtn || nextDisabled) {
      logInfo('No next page or disabled', { category: categoryName, pageNum });
      break;
    }
    logInfo('Navigating to next page', { category: categoryName, pageNum: pageNum + 1 });
    try {
      await nextBtn.click();
      await page.waitForNetworkIdle({ timeout: 15000 });
    } catch (err) {
      logWarn('Failed clicking next page; stopping pagination', { error: err.message });
      break;
    }
    pageNum++;
    await sleep(delayBetweenPagesMs);
  }
  return all;
}

/**
 * Main entry: run category scraping for Scotland site.
 * @param {Object} opts
 * @param {Array<string>} opts.keywords
 * @param {boolean} opts.headless
 * @param {number} opts.timeoutMs navigation timeout
 * @param {string} opts.url override URL (default main search page)
 * @param {number} opts.delayMs delay between category searches
 * @param {number} opts.maxPages optional cap (Infinity)
 */
async function runScotlandCategoryScrape(opts = {}) {
  const {
    keywords = DEFAULT_KEYWORDS,
    headless = true,
    timeoutMs = 30000,
    url = 'https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx',
    delayMs = 1500,
    maxPages = Infinity,
    detailPages = true,
    detailDelayMs = 600,
    abortOnFailure = true
  } = opts;

  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  logInfo('Navigating to Scotland search page', { url });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  // New workflow: select all matching categories at once, then single search.
  await openCategoriesModal(page);
  await expandAllModalPlus(page); // reveal nested nodes iteratively
  const modalCats = await extractModalCategories(page);
  const filtered = filterCategories(modalCats, keywords);
  const filteredNames = filtered.map(f => f.name);
  const actuallySelected = await selectMatchingCategories(page, filteredNames);
  await confirmAddCodes(page);
  // triggerSearch removed – Add Codes already initiates search and we waited for spinner.
  // Aggregate results (no per-category granularity now)
  const aggregatedItems = await extractAllPages(page, 'ALL_SELECTED', { maxPages });

  // Optionally enrich each with detail page data
  if (detailPages) {
    logInfo('Beginning detail page enrichment', { count: aggregatedItems.length });
    for (let i = 0; i < aggregatedItems.length; i++) {
      const item = aggregatedItems[i];
      if (!item.detailUrl) {
        logWarn('Missing detailUrl for item; skipping enrichment', { index: i });
        continue;
      }
      try {
        const detailData = await fetchDetailData(page, item.detailUrl, { timeoutMs });
        aggregatedItems[i] = { ...item, ...detailData };
      } catch (err) {
        logError('Detail page fetch failed', { url: item.detailUrl, error: err.message, index: i });
        if (abortOnFailure) {
          throw new Error('Aborting due to detail page failure');
        }
      }
      await sleep(detailDelayMs);
    }
  }

  const payload = {
    __meta: {
      fetchedAt: new Date().toISOString(),
      baseUrl: url,
      selectedCategories: actuallySelected,
      totalSelected: actuallySelected.length,
      keywords: keywords.map(canonicalKeyword),
      totalItems: aggregatedItems.length,
      detailEnriched: !!detailPages
    },
    items: aggregatedItems
  };

  await browser.close();
  return payload;
}

module.exports = {
  runScotlandCategoryScrape,
  filterCategories,
  DEFAULT_KEYWORDS
};

/**
 * Extract ID query param from a detail URL.
 * @param {string} detailUrl
 * @returns {string|null}
 */
function extractNoticeId(detailUrl) {
  try {
    const u = new URL(detailUrl);
    return u.searchParams.get('ID');
  } catch (_) {
    return null;
  }
}

/**
 * Fetch detail page and extract structured fields with fallback selectors.
 * @param {puppeteer.Page} page
 * @param {string} detailUrl
 * @param {Object} options
 * @param {number} options.timeoutMs
 */
async function fetchDetailData(page, detailUrl, { timeoutMs }) {
  logInfo('Fetching detail page', { detailUrl });
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  async function getFirstText(selectors) {
    for (const sel of selectors) {
      try {
        const handle = await page.$(sel);
        if (handle) {
          const txt = (await page.evaluate(el => el.innerText.trim(), handle)) || '';
          if (txt) return txt;
        }
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  const title = await getFirstText([
    '#ctl00_maincontent_lblNoticeTitle',
    '.notice-title',
    'h1'
  ]);
  const buyer = await getFirstText([
    '#ctl00_maincontent_lblBuyer',
    '.buyer',
    '.org-name'
  ]);
  const description = await getFirstText([
    '#ctl00_maincontent_lblShortDescription',
    '#ctl00_maincontent_lblDescription',
    '.description'
  ]);
  const closingDate = await getFirstText([
    '#ctl00_maincontent_lblDeadlineDate',
    '.closing-date',
    '.deadline'
  ]);
  const publishedDate = await getFirstText([
    '#ctl00_maincontent_lblPublicationDate',
    '.published-date'
  ]);

  // Raw main content fallback
  let rawText = null;
  try {
    rawText = await page.$eval('#maincontent', el => el.innerText.trim());
  } catch (_) {
    try {
      rawText = await page.$eval('body', el => el.innerText.trim());
    } catch (_) { rawText = null; }
  }

  return {
    noticeId: extractNoticeId(detailUrl),
    detailUrl,
    title,
    buyer,
    description,
    closingDate,
    publishedDate,
    rawText
  };
}
