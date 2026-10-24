(function exposeVenueSelection(global) {
  function syncOutletFromBranch(branchSelect, outletSelect, branches) {
    const selectedBranch = branches.find((branch) => String(branch.id) === branchSelect.value);
    if (selectedBranch?.outletId != null) {
      outletSelect.value = String(selectedBranch.outletId);
    }
  }

  function syncBranchFromOutlet(branchSelect, outletSelect, branches) {
    if (!outletSelect.value) {
      return;
    }

    const matchingBranches = branches.filter(
      (branch) => String(branch.outletId ?? '') === outletSelect.value
    );
    branchSelect.value = matchingBranches.length === 1
      ? String(matchingBranches[0].id)
      : '';
  }

  const venueSelection = { syncBranchFromOutlet, syncOutletFromBranch };
  global.venueSelection = venueSelection;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = venueSelection;
  }
})(globalThis);
