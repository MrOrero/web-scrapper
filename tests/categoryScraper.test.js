const assert = require('assert');
const { filterCategories, DEFAULT_KEYWORDS } = require('../src/public-scotland/categoryScraper');

(async () => {
  // Test filtering logic
  const sampleCategories = [
    'Health Services',
    'Transport Solutions',
    'TRANSPORTATION SUPPORT',
    'Accommodation & Housing',
    'Accomodation Facilities',
    'Education Supplies'
  ];

  const filtered = filterCategories(sampleCategories, DEFAULT_KEYWORDS);
  const names = filtered.map(f => f.name);

  assert.ok(names.includes('Health Services'), 'Should include Health Services');
  assert.ok(names.includes('Transport Solutions'), 'Should include Transport Solutions');
  assert.ok(names.includes('TRANSPORTATION SUPPORT'), 'Should include TRANSPORTATION SUPPORT');
  assert.ok(names.includes('Accommodation & Housing'), 'Should include Accommodation & Housing');
  assert.ok(names.includes('Accomodation Facilities'), 'Should include Accomodation Facilities');

  // Ensure canonical merging does not drop misspelling
  const accommodationMatches = filtered.filter(f => f.matchedKeyword === 'accommodation');
  assert.ok(accommodationMatches.length >= 2, 'Both accommodation spellings map to canonical keyword');

  // Education should not match
  assert.ok(!names.includes('Education Supplies'), 'Should not include Education Supplies');

  console.log('categoryScraper.test.js passed');
})();
