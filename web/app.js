const form = document.getElementById('recommendation-form');
const results = document.getElementById('results');
const dateInput = document.getElementById('date');
const merchantSelect = document.getElementById('merchant');
const ruleMerchantSelect = document.getElementById('rule-merchant');
const merchantForm = document.getElementById('merchant-form');
const rewardRuleForm = document.getElementById('reward-rule-form');
const refreshCatalogButton = document.getElementById('refresh-catalog');
const catalogStatus = document.getElementById('catalog-status');
const rewardRules = document.getElementById('reward-rules');
const apiBaseUrl = `http://${window.location.hostname}:4000`;

const DEFAULT_OPTIONS = {
  merchantName: 'FamilyMart',
  amount: 500,
  date: new Date().toISOString().slice(0, 10)
};

dateInput.value = DEFAULT_OPTIONS.date;
document.getElementById('validity-start').value = DEFAULT_OPTIONS.date;
document.getElementById('validity-end').value = DEFAULT_OPTIONS.date;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message || 'Request failed');
  }

  return json;
}

async function fetchMerchants() {
  const json = await requestJson('/api/admin/merchants');
  return json.data || [];
}

async function fetchRewardRules() {
  const json = await requestJson('/api/admin/reward-rules');
  return json.data || [];
}

function renderMerchantOptions(merchants) {
  const options = merchants
    .map((merchant) => `<option value="${escapeHtml(merchant)}">${escapeHtml(merchant)}</option>`)
    .join('');

  merchantSelect.innerHTML = options;
  ruleMerchantSelect.innerHTML = options;
}

async function populateMerchantOptions() {
  try {
    const merchants = await fetchMerchants();
    if (!merchants.length) {
      merchantSelect.innerHTML = '<option value="">No merchants available</option>';
      ruleMerchantSelect.innerHTML = '<option value="">Add a merchant first</option>';
      return;
    }

    renderMerchantOptions(merchants);

    if (merchants.includes(DEFAULT_OPTIONS.merchantName)) {
      merchantSelect.value = DEFAULT_OPTIONS.merchantName;
    }
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
}

function renderRewardRules(rules) {
  if (!rules.length) {
    rewardRules.innerHTML = '<p class="muted">No reward rules configured.</p>';
    return;
  }

  rewardRules.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Merchant</th>
          <th>Method</th>
          <th>Rate</th>
          <th>Validity</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rules.map((rule) => `
          <tr>
            <td>${escapeHtml(rule.merchantName)}</td>
            <td>${escapeHtml(rule.paymentMethodId)}</td>
            <td>${(Number(rule.cashbackRate) * 100).toFixed(2)}%</td>
            <td>${escapeHtml(rule.validityStart)} - ${escapeHtml(rule.validityEnd)}</td>
            <td><button class="danger-button delete-rule" type="button" data-rule-id="${escapeHtml(rule.id)}">Delete</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function setCatalogStatus(message, isError = false) {
  catalogStatus.textContent = message;
  catalogStatus.className = `status${isError ? ' error' : ''}`;
}

async function refreshCatalog() {
  try {
    const [merchants, rules] = await Promise.all([fetchMerchants(), fetchRewardRules()]);
    renderMerchantOptions(merchants);
    renderRewardRules(rules);
    setCatalogStatus(`Loaded ${merchants.length} merchants and ${rules.length} reward rules.`);
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
}

async function fetchRecommendations(payload) {
  const params = new URLSearchParams({
    merchant_name: payload.merchantName,
    amount: String(payload.amount),
    date: payload.date
  });

  const response = await fetch(`${apiBaseUrl}/api/recommendations?${params.toString()}`);
  if (!response.ok) {
    throw new Error('backend not available');
  }
  const json = await response.json();
  return json.data || [];
}

refreshCatalog();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantName = merchantSelect.value;
  const amount = Number(document.getElementById('amount').value);
  const date = document.getElementById('date').value;

  results.innerHTML = '<p>Loading recommendations...</p>';

  try {
    const recommendations = await fetchRecommendations({ merchantName, amount, date });

    if (!recommendations.length) {
      results.innerHTML = '<p>No valid payment rewards found for this merchant/date.</p>';
      return;
    }

    results.innerHTML = recommendations
      .map((item) => `
        <article class="result-item">
          <h3>${item.paymentMethod}</h3>
          <p>Cashback rate: ${(item.cashbackRate * 100).toFixed(2)}%</p>
          <p>Estimated cashback: NT$ ${Number(item.estimatedCashback).toFixed(2)}</p>
          <p>${item.promotionNote || 'No promotion note'}</p>
        </article>
      `)
      .join('');
  } catch (error) {
    results.innerHTML = '<p>Backend is not available right now. Please start the API server first.</p>';
  }
});

merchantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantName = document.getElementById('merchant-name').value.trim();

  try {
    await requestJson('/api/admin/merchants', {
      method: 'POST',
      body: JSON.stringify({ merchantName })
    });
    merchantForm.reset();
    await refreshCatalog();
    setCatalogStatus(`Added merchant "${merchantName}".`);
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

rewardRuleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(rewardRuleForm);
  const payload = Object.fromEntries(formData.entries());
  payload.cashbackRate = Number(payload.cashbackRate);
  payload.amountThreshold = Number(payload.amountThreshold);

  try {
    await requestJson('/api/admin/reward-rules', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    rewardRuleForm.reset();
    document.getElementById('validity-start').value = DEFAULT_OPTIONS.date;
    document.getElementById('validity-end').value = DEFAULT_OPTIONS.date;
    await refreshCatalog();
    setCatalogStatus('Added reward rule.');
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

refreshCatalogButton.addEventListener('click', refreshCatalog);

rewardRules.addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-rule');
  if (!button) {
    return;
  }

  try {
    await requestJson(`/api/admin/reward-rules/${encodeURIComponent(button.dataset.ruleId)}`, {
      method: 'DELETE'
    });
    await refreshCatalog();
    setCatalogStatus('Deleted reward rule.');
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});
