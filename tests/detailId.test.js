const assert = require('assert');
const { URL } = require('url');

function extractId(detailUrl) {
  const u = new URL(detailUrl);
  return u.searchParams.get('ID');
}

(async () => {
  const url = 'https://www.publiccontractsscotland.gov.uk/search/show/search_view.aspx?ID=OCT542085';
  assert.strictEqual(extractId(url), 'OCT542085', 'Should extract OCT542085 ID');
  console.log('detailId.test.js passed');
})();
