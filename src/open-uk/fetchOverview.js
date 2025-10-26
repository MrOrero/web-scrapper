const { OVERVIEW_ENDPOINT } = require('./constants');

async function fetchOverview(id) {
  const url = OVERVIEW_ENDPOINT + id;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpenUKHarvester/1.0'
    }
  });
  if (!res.ok) {
    return { id, error: `Overview fetch failed: ${res.status}` };
  }
  try {
    const json = await res.json();
    return json;
  } catch (e) {
    return { id, error: 'Failed to parse JSON: ' + e.message };
  }
}

module.exports = { fetchOverview };
