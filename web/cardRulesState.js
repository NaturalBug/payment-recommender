function normalizeIds(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

function deriveHiddenCardRuleState(rules, visible) {
  const visibleNetworks = new Set((visible.visibleNetworkIds || []).map(Number));
  const visibleIssuers = new Set((visible.visibleIssuerIds || []).map(Number));
  const visibleCards = new Set((visible.visibleCardIds || []).map(Number));
  const hiddenIssuerIdsByNetwork = {};

  for (const [networkIdText, issuerIds] of Object.entries(rules.issuerIdsByNetwork || {})) {
    const networkId = Number(networkIdText);
    const hidden = normalizeIds((issuerIds || []).map(Number).filter((issuerId) => {
      return !visibleNetworks.has(networkId) || !visibleIssuers.has(issuerId);
    }));
    if (hidden.length > 0) {
      hiddenIssuerIdsByNetwork[networkId] = hidden;
    }
  }

  const hiddenExcludedCardIds = normalizeIds((rules.excludedCardIds || []).map(Number).filter((cardId) => {
    return !visibleCards.has(cardId);
  }));

  return { hiddenIssuerIdsByNetwork, hiddenExcludedCardIds };
}

function mergeCardRulePayload(visiblePayload, hiddenState) {
  const mergedIssuerIdsByNetwork = {};

  for (const [networkIdText, issuerIds] of Object.entries(visiblePayload.issuerIdsByNetwork || {})) {
    mergedIssuerIdsByNetwork[networkIdText] = normalizeIds((issuerIds || []).map(Number));
  }

  for (const [networkIdText, issuerIds] of Object.entries(hiddenState.hiddenIssuerIdsByNetwork || {})) {
    const merged = normalizeIds([...(mergedIssuerIdsByNetwork[networkIdText] || []), ...(issuerIds || []).map(Number)]);
    mergedIssuerIdsByNetwork[networkIdText] = merged;
  }

  return {
    issuerIdsByNetwork: mergedIssuerIdsByNetwork,
    excludedCardIds: normalizeIds([
      ...(visiblePayload.excludedCardIds || []).map(Number),
      ...((hiddenState.hiddenExcludedCardIds || []).map(Number))
    ])
  };
}

const api = { deriveHiddenCardRuleState, mergeCardRulePayload };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.cardRulesState = api;
}
