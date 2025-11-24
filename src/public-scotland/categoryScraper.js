const puppeteer = require('puppeteer');
const { logInfo, logWarn, logError } = require('../utils/logger');
const { mapScotlandTenderToProcessedTender } = require('../mappers/tender-mappers');

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
  noResults: '.no-results, #noResults, .noRecords',
  // Detail tab panels (best-effort stable IDs)
  fullNoticePanel: '#ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_Page2',
  contactInfoPanel: '#ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_Page4'
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
    abortOnFailure = true,
    detailRetries = 3,
    detailRetryBackoffMs = 700
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
        const detailData = await fetchDetailData(page, item.detailUrl, { timeoutMs, retries: detailRetries, backoffMs: detailRetryBackoffMs });
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

  // Map raw scraped data to processed tender format
  const processedItems = aggregatedItems.map(item => mapScotlandTenderToProcessedTender(item));

  const payload = {
    __meta: {
      fetchedAt: new Date().toISOString(),
      baseUrl: url,
      selectedCategories: actuallySelected,
      totalSelected: actuallySelected.length,
      keywords: keywords.map(canonicalKeyword),
      totalItems: processedItems.length,
      detailEnriched: !!detailPages
    },
    items: processedItems
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
async function fetchDetailData(page, detailUrl, { timeoutMs, retries = 0, backoffMs = 600 }) {
  logInfo('Fetching detail page', { detailUrl });
  // Navigation with retry & exponential-ish backoff (1.5x)
  let attempt = 0;
  while (true) {
    try {
      if (attempt > 0) {
        const wait = Math.round(backoffMs * Math.pow(1.5, attempt - 1));
        logWarn('Detail navigation retry', { attempt, waitMs: wait, detailUrl });
        await sleep(wait);
      }
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      break;
    } catch (e) {
      attempt++;
      if (attempt > retries) {
        logError('Detail navigation failed after retries', { attempts: attempt, error: e.message, detailUrl });
        throw e;
      }
    }
  }
  // Helper to safely get trimmed innerText by exact ID
  async function getById(id) {
    try {
      return await page.$eval(`#${id}`, el => (el.innerText || '').trim());
    } catch (_) { return null; }
  }

  // IDs observed in provided HTML snippet
  const ids = {
    title: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblTitle',
    referenceNo: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblTenderID',
    ocid: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblOCID',
    publishedBy: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblAuth',
    publicationDate: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblPubDate',
    deadlineDate: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblDeadlineDate',
    deadlineTime: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblDeadlineTime',
    noticeType: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblDocType',
    hasDocuments: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblHasDocs',
    hasSpd: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblHasESPD',
    abstract: 'ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lblAbstract'
  };

  const title = await getById(ids.title);
  const referenceNo = await getById(ids.referenceNo);
  const ocid = await getById(ids.ocid);
  // publishedBy may contain an anchor
  let publishedBy = await getById(ids.publishedBy);
  // Strip potential nested anchor markup remnants
  if (publishedBy) publishedBy = publishedBy.replace(/\s+/g, ' ').trim();
  const publicationDate = await getById(ids.publicationDate);
  const deadlineDate = await getById(ids.deadlineDate);
  const deadlineTime = await getById(ids.deadlineTime);
  const noticeType = await getById(ids.noticeType);
  const hasDocumentsRaw = await getById(ids.hasDocuments);
  const hasSpdRaw = await getById(ids.hasSpd);
  const abstract = await getById(ids.abstract);

  // Derive booleans
  const hasDocuments = /yes/i.test(hasDocumentsRaw || '');
  const hasSpd = /yes/i.test(hasSpdRaw || '');

  // Extract CPV codes from abstract text (e.g., 'CPV: 66510000, 66515200')
  let cpvCodes = [];
  if (abstract) {
    const match = abstract.match(/CPV:\s*([0-9,\s]+)/i);
    if (match) {
      cpvCodes = match[1]
        .split(/[,\s]+/)
        .filter(c => /\d{5,}/.test(c));
    }
  }

  // Raw main content fallback (in case we need broader context later)
  let rawText = null;
  try {
    rawText = await page.$eval('body', el => el.innerText.trim());
  } catch (_) { rawText = null; }

  return {
    noticeId: extractNoticeId(detailUrl),
    detailUrl,
    title,
    referenceNo,
    ocid,
    publishedBy,
    publicationDate,
    deadlineDate,
    deadlineTime,
    noticeType,
    hasDocuments,
    hasSpd,
    abstract,
    cpvCodes,
    rawText
  };
}

/**
 * Fallback generic table parsing if specific IDs are missing.
 * Attempts to build a key/value map by scanning table rows with <strong> labels.
 * @param {puppeteer.Page} page
 * @returns {Promise<Object>} key/value pairs
 */
async function parseDetailTableFallback(page) {
  try {
    return await page.evaluate(() => {
      const data = {};
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      rows.forEach(r => {
        const strong = r.querySelector('td strong');
        const valueCell = r.querySelector('td:nth-child(2)');
        if (!strong || !valueCell) return;
        const keyRaw = strong.innerText.replace(/:\s*$/, '').trim();
        let val = valueCell.innerText.trim();
        // Remove excessive whitespace
        val = val.replace(/\s+/g, ' ').trim();
        if (keyRaw) data[keyRaw.toLowerCase()] = val;
      });
      return data;
    });
  } catch (e) {
    logWarn('Fallback table parse failed', { error: e.message });
    return {};
  }
}

// Wrap original fetchDetailData to inject fallback merging
const _origFetchDetailData = fetchDetailData;
fetchDetailData = async function(page, detailUrl, { timeoutMs, retries = 0, backoffMs = 600 }) {
  const primary = await _origFetchDetailData(page, detailUrl, { timeoutMs, retries, backoffMs });
  // If critical fields missing, attempt fallback
  if (!primary.title || !primary.referenceNo || !primary.ocid) {
    logWarn('Primary detail extraction incomplete; invoking fallback');
    const fallbackMap = await parseDetailTableFallback(page);
    // Normalize keys to expected property names if present
    const mapped = {
      title: primary.title || fallbackMap['title'],
      referenceNo: primary.referenceNo || fallbackMap['reference no'],
      ocid: primary.ocid || fallbackMap['ocid'],
      publishedBy: primary.publishedBy || fallbackMap['published by'],
      publicationDate: primary.publicationDate || fallbackMap['publication date'],
      deadlineDate: primary.deadlineDate || fallbackMap['deadline date'],
      deadlineTime: primary.deadlineTime || fallbackMap['deadline time'],
      noticeType: primary.noticeType || fallbackMap['notice type'],
      abstract: primary.abstract || fallbackMap['abstract']
    };
    return { ...primary, ...mapped, fallbackApplied: true };
  }
  return primary;
};

// --- Full Notice Text Tab Extraction Extension ---
// Re-wrap again to add tab click & deep content parsing without losing fallback behavior.
const _wrappedFetchDetailData = fetchDetailData;
fetchDetailData = async function(page, detailUrl, { timeoutMs, retries = 0, backoffMs = 600 }) {
  const data = await _wrappedFetchDetailData(page, detailUrl, { timeoutMs, retries, backoffMs });
  try {
    // Attempt to locate a tab with text 'Full Notice Text'
    const tabClicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('li.rtsLI a.rtsLink, a#Tab2, li.rtsLI span.rtsTxt'));
      for (const c of candidates) {
        const txt = (c.innerText || '').trim();
        if (/^Full Notice Text$/i.test(txt)) {
          const link = c.closest('a.rtsLink') || c;
          link.click();
          return true;
        }
      }
      return false;
    });
    if (tabClicked) {
      // Wait briefly for content panel to appear
      await sleep(600);
      // Capture panel text if available
      const fullNotice = await page.evaluate(() => {
        const panel = document.querySelector('#ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_Page2');
        if (!panel) return null;
        const raw = panel.innerText.trim();
        // Extract lots using heuristic regex
        const lotRegex = /Lot No:\s*(\d+)([\s\S]*?)(?=Lot No:|Section VI:|$)/g;
        const lots = [];
        let m;
        while ((m = lotRegex.exec(raw))) {
          const lotNumber = m[1];
          const block = m[2];
          const titleMatch = block.match(/II\.2\.1\) Title[\s\S]*?(?:\n)(.+)/);
          const title = titleMatch ? titleMatch[1].trim() : null;
          const cpvMatches = Array.from(block.matchAll(/\b(\d{8})\b/g)).map(x => x[1]);
          const startMatch = block.match(/Start:\s*(\d{2}\/\d{2}\/\d{4})/);
          const endMatch = block.match(/End:\s*(\d{2}\/\d{2}\/\d{4})/);
          const renewal = /subject to renewal:\s*Yes/i.test(block);
          const renewalDescMatch = block.match(/Description of renewals:\s*(.+)/);
          lots.push({
            lotNumber,
            title,
            cpvCodes: Array.from(new Set(cpvMatches)),
            startDate: startMatch ? startMatch[1] : null,
            endDate: endMatch ? endMatch[1] : null,
            renewal,
            renewalDescription: renewalDescMatch ? renewalDescMatch[1].trim() : null
          });
        }
        // Sections headings extraction
        const sectionRegex = /Section\s+([IVX]+):\s*([^\n]+)/g;
        const sections = [];
        let s;
        while ((s = sectionRegex.exec(raw))) {
          sections.push({ roman: s[1], heading: s[2].trim() });
        }
        return { raw, lots, sections };
      });
      if (fullNotice) {
        data.fullNotice = fullNotice;
      }
    }
  } catch (e) {
    logWarn('Full Notice Text extraction failed', { error: e.message });
  }
  return data;
};

// --- Contact Info Tab Extraction Extension ---
const _fullNoticeWrappedFetchDetailData = fetchDetailData;
fetchDetailData = async function(page, detailUrl, { timeoutMs, retries = 0, backoffMs = 600 }) {
  const data = await _fullNoticeWrappedFetchDetailData(page, detailUrl, { timeoutMs, retries, backoffMs });
  try {
    const tabClicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('li.rtsLI a.rtsLink, li.rtsLI span.rtsTxt, a[id*="Tab"]'));
      for (const el of candidates) {
        const txt = (el.innerText || '').trim();
        if (/Contact Info/i.test(txt)) {
          const link = el.closest('a.rtsLink') || el;
          try { link.click(); } catch (_) {}
          return true;
        }
      }
      return false;
    });
    if (tabClicked) {
      await sleep(600);
      const contactInfo = await page.evaluate(() => {
        const panel = document.querySelector('#ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_Page4');
        if (!panel) return null;
        const raw = panel.innerText.trim();
        function capture(label) {
          const regex = new RegExp(label + '\\s*:?\\s*([\\s\\S]*?)(?=\\n(?:Main|Admin|Technical|Other) Contact|$)', 'i');
          const match = raw.match(regex);
          return match ? match[1].trim() : null;
        }
        function emailsFrom(text) { return text ? Array.from(new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.trim()))) : []; }
        function nameFrom(text) { if (!text) return null; const line = text.split('\n').find(l => /Name/i.test(l)); return line ? line.replace(/Name\s*:?\s*/i, '').trim() : null; }
        const main = capture('Main Contact');
        const admin = capture('Admin Contact');
        const technical = capture('Technical Contact');
        const other = capture('Other Contact');
        return {
          raw,
          main: { raw: main, name: nameFrom(main), emails: emailsFrom(main) },
          admin: { raw: admin, name: nameFrom(admin), emails: emailsFrom(admin) },
          technical: { raw: technical, name: nameFrom(technical), emails: emailsFrom(technical) },
          other: { raw: other, name: nameFrom(other), emails: emailsFrom(other) }
        };
      });
      if (contactInfo) data.contactInfo = contactInfo;
    }
  } catch (e) {
    logWarn('Contact Info extraction failed', { error: e.message });
  }
  return data;
};
