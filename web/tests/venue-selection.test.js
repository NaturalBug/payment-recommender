const test = require('node:test');
const assert = require('node:assert/strict');
const {
  syncBranchFromOutlet,
  syncOutletFromBranch
} = require('../venue-selection.js');

test('selecting a branch selects its linked Outlet', () => {
  const branchSelect = { value: 'branch-1' };
  const outletSelect = { value: '' };
  const branches = [{ id: 'branch-1', outletId: 'outlet-1' }];

  syncOutletFromBranch(branchSelect, outletSelect, branches);

  assert.equal(outletSelect.value, 'outlet-1');
});

test('selecting a branch without an Outlet leaves the Outlet selection unchanged', () => {
  const branchSelect = { value: 'branch-1' };
  const outletSelect = { value: 'outlet-2' };
  const branches = [{ id: 'branch-1', outletId: null }];

  syncOutletFromBranch(branchSelect, outletSelect, branches);

  assert.equal(outletSelect.value, 'outlet-2');
});

test('selecting an Outlet selects its only branch for the Merchant', () => {
  const branchSelect = { value: '' };
  const outletSelect = { value: 'outlet-1' };
  const branches = [
    { id: 'branch-1', outletId: 'outlet-1' },
    { id: 'branch-2', outletId: 'outlet-2' }
  ];

  syncBranchFromOutlet(branchSelect, outletSelect, branches);

  assert.equal(branchSelect.value, 'branch-1');
});

test('selecting an Outlet with multiple branches leaves the branch unselected', () => {
  const branchSelect = { value: 'branch-1' };
  const outletSelect = { value: 'outlet-1' };
  const branches = [
    { id: 'branch-1', outletId: 'outlet-1' },
    { id: 'branch-2', outletId: 'outlet-1' }
  ];

  syncBranchFromOutlet(branchSelect, outletSelect, branches);

  assert.equal(branchSelect.value, '');
});
