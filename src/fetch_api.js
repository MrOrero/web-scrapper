#!/usr/bin/env node
// Direct fetch of the public opportunities API.
// This script attempts to retrieve the JSON payload for analysis.

const ENDPOINT = 'https://gateway-pro-03.open-uk.org/opportunity/browse/all-public';

async function main() {
  try {
    const res = await fetch(ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NodeFetchScript/1.0'
      },
      method: 'GET'
    });

    console.error(`Status: ${res.status}`);
    if (!res.ok) {
      console.error('Non-OK response, exiting');
      process.exit(1);
    }
    const json = await res.json();
    // Provide a summarized view
    const summary = {
      keys: Object.keys(json),
      totalKeys: Object.keys(json).length,
    };
    // Attempt to find array-like data
    for (const k of Object.keys(json)) {
      if (Array.isArray(json[k])) {
        summary.firstArrayKey = k;
        summary.firstArrayLength = json[k].length;
        summary.firstArraySample = json[k].slice(0, 2);
        break;
      }
    }

    console.log(JSON.stringify({ summary }, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err.message);
    process.exit(1);
  }
}

main();
