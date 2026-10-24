const form = document.getElementById('recommendation-form');
const results = document.getElementById('results');
const dateInput = document.getElementById('date');
const merchantSelect = document.getElementById('merchant');
const branchSelect = document.getElementById('branch');
const outletSelect = document.getElementById('outlet');
const apiBaseUrl = `http://${window.location.hostname}:4000`;
let shoppingOutlets = [];
let merchantBranches = [];

const DEFAULT_OPTIONS = {
  merchantName: 'FamilyMart',
  amount: 500,
  date: new Date().toISOString().slice(0, 10)
};

dateInput.value = DEFAULT_OPTIONS.date;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchMerchants() {
  const response = await fetch(`${apiBaseUrl}/api/merchants`);
  if (!response.ok) {
    throw new Error('merchant catalog unavailable');
  }

  const json = await response.json();
  return json.data || [];
}

async function populateMerchantOptions() {
  let merchants;
  try {
    merchants = await fetchMerchants();
  } catch (error) {
    merchantSelect.innerHTML = `<option value="">Merchant catalog unavailable</option>`;
    branchSelect.innerHTML = '<option value="">Branches unavailable</option>';
    outletSelect.innerHTML = '<option value="">Outlets unavailable</option>';
    return;
  }

  merchantSelect.innerHTML = merchants.length
    ? merchants.map((merchant) => `<option value="${escapeHtml(merchant.id)}" data-merchant-name="${escapeHtml(merchant.name)}">${escapeHtml(merchant.name)}</option>`).join('')
    : '<option value="">No merchants available</option>';

  const defaultMerchant = merchants.find((merchant) => merchant.name === DEFAULT_OPTIONS.merchantName);
  if (defaultMerchant) {
    merchantSelect.value = String(defaultMerchant.id);
  }

  try {
    await populateOutletOptions();
  } catch (error) {
    outletSelect.innerHTML = '<option value="">Outlets unavailable; Outlet-specific offers are excluded</option>';
  }
  try {
    await populateBranchOptions();
  } catch (error) {
    branchSelect.innerHTML = '<option value="">Branches unavailable; branch-specific offers are excluded</option>';
  }
}

async function populateOutletOptions() {
  outletSelect.innerHTML = '<option value="">No Outlet selected</option>';
  const response = await fetch(`${apiBaseUrl}/api/outlets`);
  if (!response.ok) {
    throw new Error('Outlets unavailable');
  }
  const json = await response.json();
  shoppingOutlets = json.data || [];
  outletSelect.innerHTML = [
    '<option value="">No Outlet selected</option>',
    ...shoppingOutlets.map((outlet) => `<option value="${escapeHtml(outlet.id)}">${escapeHtml(outlet.name)}${outlet.location ? ` — ${escapeHtml(outlet.location)}` : ''}</option>`)
  ].join('');
}

async function populateBranchOptions() {
  const merchantId = merchantSelect.value;
  merchantBranches = [];
  branchSelect.innerHTML = '<option value="">No branch selected</option>';
  if (!merchantId || !/^\d+$/.test(merchantId)) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/merchants/${encodeURIComponent(merchantId)}/branches`);
  if (!response.ok) {
    throw new Error('Merchant branches unavailable');
  }
  const json = await response.json();
  const branches = json.data || [];
  merchantBranches = branches;
  branchSelect.innerHTML = [
    '<option value="">No branch selected</option>',
    ...branches.map((branch) => {
      const outlet = shoppingOutlets.find((item) => item.id === branch.outletId);
      const location = [branch.location, outlet ? `at ${outlet.name}` : ''].filter(Boolean).join(' · ');
      return `<option value="${escapeHtml(branch.id)}" data-outlet-id="${escapeHtml(branch.outletId ?? '')}">${escapeHtml(branch.name)}${location ? ` — ${escapeHtml(location)}` : ''}</option>`;
    })
  ].join('');
  filterBranchOptionsByOutlet();
}

function filterBranchOptionsByOutlet() {
  const selectedOutletId = outletSelect.value;
  for (const option of branchSelect.options) {
    const branchOutletId = option.dataset.outletId;
    option.disabled = Boolean(selectedOutletId && branchOutletId !== selectedOutletId);
    if (option.selected && option.disabled) {
      branchSelect.value = '';
    }
  }
}

async function fetchRecommendations(payload) {
  const params = new URLSearchParams({
    merchant_name: payload.merchantName,
    amount: String(payload.amount),
    date: payload.date
  });
  if (payload.branchId) {
    params.set('branch_id', payload.branchId);
  }
  if (payload.outletId) {
    params.set('outlet_id', payload.outletId);
  }

  const response = await fetch(`${apiBaseUrl}/api/recommendations?${params.toString()}`);
  if (!response.ok) {
    throw new Error('backend not available');
  }
  const json = await response.json();
  return json.data || [];
}

populateMerchantOptions();

merchantSelect.addEventListener('change', async () => {
  try {
    await populateBranchOptions();
  } catch (error) {
    branchSelect.innerHTML = '<option value="">Branches unavailable; branch-specific offers are excluded</option>';
  }
});

outletSelect.addEventListener('change', () => {
  filterBranchOptionsByOutlet();
  venueSelection.syncBranchFromOutlet(branchSelect, outletSelect, merchantBranches);
});

branchSelect.addEventListener('change', () => {
  venueSelection.syncOutletFromBranch(branchSelect, outletSelect, merchantBranches);
  filterBranchOptionsByOutlet();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantName = merchantSelect.selectedOptions[0]?.dataset.merchantName || merchantSelect.value;
  const amount = Number(document.getElementById('amount').value);
  const date = dateInput.value;
  const branchId = branchSelect.value;
  const outletId = outletSelect.value;

  results.innerHTML = '<p>Loading recommendations...</p>';

  try {
    const recommendations = await fetchRecommendations({ merchantName, amount, date, branchId, outletId });

    if (!recommendations.length) {
      results.innerHTML = '<p>No valid payment rewards found for this merchant/date.</p>';
      return;
    }

    results.innerHTML = recommendations
      .map((item) => {
        const benefit = item.benefitType === 'fixed_discount'
          ? `Fixed discount: NT$ ${Number(item.fixedDiscountAmount).toFixed(0)}`
          : `Cashback rate: ${(Number(item.cashbackRate) * 100).toFixed(2)}%`;
        const sourceUrl = safeHttpsUrl(item.sourceUrl);
        const sourceLink = sourceUrl
          ? `<p><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer noopener">View official promotion terms</a></p>`
          : '';
        const originNote = item.originType
          ? `<p>Promotion origin: ${escapeHtml(item.originName || '—')}</p>`
          : '';
        const branchNote = item.branchName ? `<p>Merchant branch: ${escapeHtml(item.branchName)}</p>` : '';
        const outletNote = item.outletName ? `<p>Shopping Outlet/Mall: ${escapeHtml(item.outletName)}</p>` : '';
        const thresholdNote = Number(item.amountThreshold) > 0
          ? `<p>Minimum spend: NT$ ${Number(item.amountThreshold).toFixed(0)}</p>`
          : '';

        return `
          <article class="result-item">
            <h3>${escapeHtml(item.paymentMethod)}</h3>
            <p>${benefit}</p>
            <p>Estimated savings: NT$ ${Number(item.estimatedSavings).toFixed(2)}</p>
            ${thresholdNote}
            ${originNote}
            ${branchNote}
            ${outletNote}
            <p>${escapeHtml(item.promotionNote || 'No additional promotion terms')}</p>
            ${sourceLink}
          </article>
        `;
      })
      .join('');
  } catch (error) {
    results.innerHTML = '<p>Backend is not available right now. Please start the API server first.</p>';
  }
});

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
