const assert = require('assert');
const { scrapePage } = require('../src/scrape');

// Basic integration test against example.com (stable)
// This test may fail if network is blocked.

(async () => {
  const data = await scrapePage('https://example.com', { heading: 'h1' }, { timeoutMs: 8000, headless: true });
  assert.ok(data.heading, 'Expected to extract heading');
  assert.match(data.heading.toLowerCase(), /example domain/, 'Heading should mention Example Domain');
  console.log('scrape.test.js passed');
})();
