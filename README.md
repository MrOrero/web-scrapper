# Web Scrapper (Puppeteer)

A minimal Node.js web scraping utility using Puppeteer. Supports specifying CSS selectors via CLI.

## Features
- Headless (default) or headful mode (`--headful`)
- Timeout control per selector (`--timeout <ms>`)
- Multiple selectors (`--selector name=CSS` repeated)
- Structured JSON output
- Basic logging
- Simple integration test using Node's test runner
 - Scotland category scraping with pagination (Public Contracts Scotland)

## Installation
```bash
npm install
```
(Puppeteer installs Chromium; expect a larger download.)

## Usage
```bash
npm run scrape -- https://example.com --selector heading=h1
```
Output:
```json
{
  "heading": "Example Domain",
  "__meta": { "url": "https://example.com", "fetchedAt": "2025-10-22T...Z", "success": 1 }
}
```

Multiple selectors:
```bash
npm run scrape -- https://news.ycombinator.com --selector firstTitle=.athing .titleline a --selector subtext=.subtext --timeout 10000
```

Headful mode (for debugging):
```bash
npm run scrape -- https://example.com --headful
```

### Scotland Category Scrape
Scrape all pages for categories whose names contain any keyword:

Default keywords: `health, accommodation, accomodation, transport, transportation`

```bash
npm run public-scotland:categories
```

Custom keywords, headful mode, delay override, cap pages:
```bash
node src/public-scotland/cli_scotland.js --keywords health,transport --headful --delay 2000 --maxPages 50 --output scotland_results.json
```

Output structure:
```json
{
  "__meta": {
    "fetchedAt": "2025-10-26T12:34:56.000Z",
    "baseUrl": "https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx",
    "totalCategories": 3,
    "keywords": ["health","accommodation","transport","transportation"],
    "totalItems": 142
  },
  "categories": [
    {
      "category": "Health Services",
      "matchedKeyword": "health",
      "items": [
        {"text": "Row text...", "cells": ["Ref","Title","Buyer"], "detailUrl": "https://...", "category": "Health Services"}
      ]
    }
  ]
}
```

## Programmatic Use
```js
const { scrapePage } = require('./src/scrape');
(async () => {
  const data = await scrapePage('https://example.com', { heading: 'h1' }, { timeoutMs: 6000 });
  console.log(data);
})();
```

## Testing
```bash
npm test
```

## Notes & Ethics
- Always review a site's Terms of Service.
- Respect `robots.txt` and rate-limit for larger scrapes.
- Avoid overloading servers; add delays for bulk operations.
- For Public Contracts Scotland, ensure usage aligns with any published terms and do not hammer pagination aggressively (tune `--delay`).

## Next Ideas
- Add concurrency with a queue.
- Export to CSV/JSON lines.
- Add stealth plugin / retries.
- Add rotating user agents & proxy support.

## License
ISC
