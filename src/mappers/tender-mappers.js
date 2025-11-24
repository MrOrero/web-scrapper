
function parseDate(dateStr, fallbackEpochIfInvalid = true) {
  if (!dateStr) return fallbackEpochIfInvalid ? new Date(0) : null;
  let d = new Date(dateStr);
  return isNaN(d.getTime()) ? (fallbackEpochIfInvalid ? new Date(0) : null) : d;
}

function parseScotlandDate(date, time) {
  if (!date) return new Date(0);
  let [d, m, y] = date.split('/').map(Number);
  let t = time ? time.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, t[0] || 0, t[1] || 0);
}

function mapScotlandTenderToProcessedTender(item) {
  const contact = (item.contactInfo && item.contactInfo.main) || {};
  return {
    governmentId: item.referenceNo || item.ocid || '',
    title: item.title || '',
    tenderStatus: item.noticeType || '',
    description: item.abstract || '',
    deadline: parseScotlandDate(item.deadlineDate, item.deadlineTime),
    category: item.category || '',
    type: '', 
    budget: 0, 
    classificationId: item.cpvCodes && item.cpvCodes[0] || '',
    classificationScheme: 'CPV',
    buyer: item.publishedBy || '',
    region: 'Scotland',
    regionCode: 'S92000003',
    counties: [],
    link: item.detailUrl || '',
    governmentPublishedDate: parseDate(item.publicationDate || item.date),
    regulatoryBodies: '',
    currency: 'GBP',
    tenderCategory: item.category || '',
    tenderServiceType: '',
    bidSubmissionPortal: item.detailUrl || '',
    timeline: {
      openingDate: parseDate(item.publicationDate),
      closingDate: parseScotlandDate(item.deadlineDate, item.deadlineTime),
      evaluationPeriod: new Date(0),
      contractAwardDate: new Date(0)
    },
    contactInfo: {
      issuingAuthority: item.publishedBy || '',
      contactPerson: (contact.name ? contact.name : ''),
      email: (contact.emails && contact.emails[0]) || '',
      phoneNo: '' 
    }
  };
}

function mapOpenUkTenderToProcessedTender(t) {
  const o = t.overview || {};
  const account = o.account || {};
  const delivery = (o.deliveryAreaInfo && o.deliveryAreaInfo[0]) || {};
  const user = o.user || {};
  const contactDetails = (user.contactDetails) || {};
  return {
    governmentId: o.referenceNumber || t.id || '',
    title: o.title || '',
    tenderStatus: o.opportunityType || '',
    description: o.description || '',
    deadline: parseDate(o.submissionEndDate || o.contractEndDate),
    category: (o.industryInfo && o.industryInfo[0] && o.industryInfo[0].category) || '',
    type: o.opportunityType || '',
    budget: parseFloat(o.contractValue) || 0,
    classificationId: (o.industryInfo && o.industryInfo[0] && o.industryInfo[0].classificationID) || '',
    classificationScheme: 'CPV',
    buyer: account.companyName || '',
    region: delivery.description || '',
    regionCode: delivery.code || '',
    counties: o.deliveryAreaInfo ? o.deliveryAreaInfo.map(x => x.description) : [],
    link: '', 
    governmentPublishedDate: parseDate(o.createdOn),
    regulatoryBodies: '',
    currency: 'GBP',
    tenderCategory: '',
    tenderServiceType: '',
    bidSubmissionPortal: '',
    timeline: {
      openingDate: parseDate(o.expressionInterestStartDate),
      closingDate: parseDate(o.expressionInterestEndDate),
      evaluationPeriod: new Date(0),
      contractAwardDate: new Date(0)
    },
    contactInfo: {
      issuingAuthority: account.companyName || '',
      contactPerson: [contactDetails.firstname, contactDetails.surname].filter(Boolean).join(' '),
      email: user.email || '',
      phoneNo: contactDetails.mobile || ''
    }
  };
}

module.exports = {
  mapScotlandTenderToProcessedTender,
  mapOpenUkTenderToProcessedTender
};
