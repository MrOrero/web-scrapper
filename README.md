# Web Scrapper

Node.js web scraping utility for UK government tender opportunities using Puppeteer.

## Features
- Public Contracts Scotland category scraping with pagination
- Open UK opportunities collection
- Standardized tender data format with mapper
- Headless (default) or headful mode
- Detailed enrichment from detail pages
- Structured JSON output

## Installation
```bash
npm install
```

## Main Scripts

### Scotland Tenders - All Categories
Scrape all matching category tenders with full detail pages:

```bash
node src/public-scotland/cli_scotland.js --keywords health,transport --output scotland_results.json
```

Options:
- `--keywords` - Comma-separated keywords (default: health,accommodation,transport,transportation)
- `--output` - Output file name
- `--headful` - Run browser in visible mode (for debugging)
- `--delay` - Delay between category searches in ms (default: 1500)
- `--maxPages` - Cap number of pages to scrape (default: unlimited)
- `--no-detail` - Skip detail page enrichment
- `--detail-delay` - Delay between detail pages in ms (default: 600)

### Scotland Tenders - Today Only
Scrape only today's tender notices:

```bash
node src/public-scotland/cli_scotland_today.js --output scotland_today.json
```

### Open UK Opportunities
Collect filtered opportunities from Open UK:

```bash
node src/open-uk/collect_browser.js --output open_uk_filtered.json
```

## Output Format
## Output Format

All scraped data is transformed into a standardized format with the following fields:
- `governmentId` - Reference number or opportunity ID
- `title` - Tender title
- `tenderStatus` - Status/type of tender
- `description` - Tender description/abstract
- `deadline` - Submission deadline date
- `category` - Tender category
- `budget` - Contract value
- `buyer` - Issuing authority/organization
- `region` - Geographic region
- `timeline` - Opening/closing dates, evaluation period, contract award date
- `contactInfo` - Authority contact details including person, email, phone

## Testing
```bash
npm test
```

## Notes & Ethics
- Always review a site's Terms of Service
- Respect `robots.txt` and rate-limit for larger scrapes
- Avoid overloading servers; add delays for bulk operations
- For Public Contracts Scotland, tune `--delay` to avoid aggressive pagination

## License
ISC
