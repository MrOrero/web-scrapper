const { KEYWORDS } = require('./constants');

function matchesKeywords(opportunity) {
  const haystack = [
    opportunity.opportunityName,
    opportunity.description,
    opportunity.eventName,
    opportunity.group
  ].filter(Boolean).join(' ').toLowerCase();

  return KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

function filterOpportunities(items) {
  return items.filter(matchesKeywords);
}

module.exports = { filterOpportunities, matchesKeywords };
