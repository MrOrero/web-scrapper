const { BROWSE_ENDPOINT } = require('./constants');

async function fetchAllPublic() {
  const res = await fetch(BROWSE_ENDPOINT, {
    headers: {
      'Accept': 'application/json',
      // Spoof more typical browser headers to reduce 403 likelihood
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Referer': 'https://open-uk.org/opportunities'
    }
  });
  if (!res.ok) throw new Error(`Browse endpoint failed: ${res.status}`);
  const json = await res.json();
  if (!json.items || !Array.isArray(json.items)) throw new Error('Unexpected response shape: missing items array');
  return json.items;
}

module.exports = { fetchAllPublic };
