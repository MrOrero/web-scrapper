#!/usr/bin/env node
// Minimal browser-assisted collection: navigate once to set cookies, then use in-page fetch.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { KEYWORDS, BROWSE_ENDPOINT, OVERVIEW_ENDPOINT } = require('./constants');

function keywordMatch(o){
  const text = [o.opportunityName, o.description, o.eventName, o.group].filter(Boolean).join(' ').toLowerCase();
  return KEYWORDS.some(k=>text.includes(k));
}

(async ()=>{
  const outputFile = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output')+1] : 'open_uk_filtered_browser.json';
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://open-uk.org/opportunities', { waitUntil: 'domcontentloaded' });

  // Use Node-side fetch with browser cookies to bypass CORS restrictions.
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  async function nodeFetchJson(url){
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0 Safari/537.36',
        'Referer': 'https://open-uk.org/opportunities',
        'Cookie': cookieHeader
      }
    });
    return res;
  }
  const browseRes = await nodeFetchJson(BROWSE_ENDPOINT);
  if(!browseRes.ok) throw new Error('browse failed '+browseRes.status);
  const browseJson = await browseRes.json();
  const items = Array.isArray(browseJson.items)? browseJson.items: [];
  const filtered = items.filter(keywordMatch);
  const results = [];
  for(const f of filtered){
    const r = await nodeFetchJson(OVERVIEW_ENDPOINT + f.opportunityID);
    if(!r.ok){
      results.push({ id: f.opportunityID, status: r.status, error: 'overview non-ok', base:{name:f.opportunityName} });
      continue;
    }
    try {
      const ov = await r.json();
      results.push({ id: f.opportunityID, status: r.status, overview: ov, base:{name:f.opportunityName, value:f.estimatedValue} });
    } catch(e){
      results.push({ id: f.opportunityID, status: r.status, error: 'parse fail '+e.message });
    }
  }
  const data = { total: items.length, filtered: filtered.length, results };

  await browser.close();
  fs.writeFileSync(path.resolve(outputFile), JSON.stringify({ meta:{ ts:new Date().toISOString(), keywords: KEYWORDS }, ...data }, null, 2));
  console.log(JSON.stringify({ summary:{ outputFile, total:data.total, filtered:data.filtered, withOverview:data.results.filter(r=>r.overview).length } }, null, 2));
})().catch(e=>{ console.error('collect_browser failed', e.message); process.exit(1); });
