const ruleMerchantSelect = document.getElementById('rule-merchant');
const merchantForm = document.getElementById('merchant-form');
const rewardRuleForm = document.getElementById('reward-rule-form');
const refreshCatalogButton = document.getElementById('refresh-catalog');
const catalogStatus = document.getElementById('catalog-status');
const rewardRules = document.getElementById('reward-rules');
const apiBaseUrl = `http://${window.location.hostname}:4000`;
const today = new Date().toISOString().slice(0, 10);

document.getElementById('validity-start').value = today;
document.getElementById('validity-end').value = today;

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
  ruleMerchantSelect.innerHTML = merchants.length
    ? merchants.map((merchant) => `<option value="${escapeHtml(merchant)}">${escapeHtml(merchant)}</option>`).join('')
    : '<option value="">Add a merchant first</option>';
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
    document.getElementById('validity-start').value = today;
    document.getElementById('validity-end').value = today;
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

refreshCatalog();
