# Web Scrapper (Puppeteer)

A minimal Node.js web scraping utility using Puppeteer. Supports specifying CSS selectors via CLI.

## Features
- Headless (default) or headful mode (`--headful`)
- Timeout control per selector (`--timeout <ms>`)
- Multiple selectors (`--selector name=CSS` repeated)
- Structured JSON output
- Basic logging
- Simple integration test using Node's test runner

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

## Next Ideas
- Add concurrency with a queue.
- Export to CSV/JSON lines.
- Add stealth plugin / retries.
- Add rotating user agents & proxy support.

## License
ISC
