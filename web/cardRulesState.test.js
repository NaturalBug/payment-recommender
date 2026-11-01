const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveHiddenCardRuleState,
  mergeCardRulePayload
} = require('./cardRulesState');

test('derives hidden issuer/card rule IDs missing from current controls', () => {
  const hidden = deriveHiddenCardRuleState(
    {
      issuerIdsByNetwork: { 10: [1, 2], 99: [8] },
      excludedCardIds: [7, 11]
    },
    {
      visibleNetworkIds: [10],
      visibleIssuerIds: [1],
      visibleCardIds: [7]
    }
  );

  assert.deepEqual(hidden.hiddenIssuerIdsByNetwork, { 10: [2], 99: [8] });
  assert.deepEqual(hidden.hiddenExcludedCardIds, [11]);
});

test('merges hidden rules into the submitted payload', () => {
  const payload = mergeCardRulePayload(
    {
      issuerIdsByNetwork: { 10: [1] },
      excludedCardIds: [7]
    },
    {
      hiddenIssuerIdsByNetwork: { 10: [2], 99: [8] },
      hiddenExcludedCardIds: [11]
    }
  );

  assert.deepEqual(payload, {
    issuerIdsByNetwork: { 10: [1, 2], 99: [8] },
    excludedCardIds: [7, 11]
  });
});
