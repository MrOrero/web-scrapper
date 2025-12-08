const { OPEN_UK_TARGET_CODES } = require('./constants');

function matchesCodes(opportunity) {
  if (!opportunity.industryCodes || !Array.isArray(opportunity.industryCodes)) return false;
  return opportunity.industryCodes.some(code => OPEN_UK_TARGET_CODES.includes(code));
}

function filterOpportunities(items) {
  return items.filter(matchesCodes);
}

module.exports = { filterOpportunities, matchesCodes };
