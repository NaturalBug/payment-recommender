const ruleMerchantSelect = document.getElementById('rule-merchant');
const merchantForm = document.getElementById('merchant-form');
const paymentMethodForm = document.getElementById('payment-method-form');
const rewardRuleForm = document.getElementById('reward-rule-form');
const refreshCatalogButton = document.getElementById('refresh-catalog');
const catalogStatus = document.getElementById('catalog-status');
const merchantsContainer = document.getElementById('merchants');
const paymentMethodsContainer = document.getElementById('payment-methods');
const acceptanceMerchantSelect = document.getElementById('acceptance-merchant');
const acceptedPaymentMethods = document.getElementById('accepted-payment-methods');
const rewardRules = document.getElementById('reward-rules');
const adminApiKeyInput = document.getElementById('admin-api-key');
const connectAdminButton = document.getElementById('connect-admin');
const catalogControls = document.getElementById('catalog-controls');
const apiBaseUrl = `http://${window.location.hostname}:4000`;
const today = new Date().toISOString().slice(0, 10);

let adminApiKey = '';
let merchants = [];
let paymentMethods = [];

refreshCatalogButton.disabled = true;
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
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-API-Key': adminApiKey,
      ...options.headers
    }
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message || 'Request failed');
  }

  return json;
}

async function connectAdmin() {
  const candidateKey = adminApiKeyInput.value.trim();

  if (!candidateKey) {
    setCatalogStatus('Enter an Admin API key before connecting.', true);
    return;
  }

  adminApiKey = candidateKey;
  catalogControls.disabled = true;
  refreshCatalogButton.disabled = true;
  connectAdminButton.disabled = true;
  connectAdminButton.textContent = 'Connecting...';
  setCatalogStatus('Connecting...');

  try {
    await refreshCatalog();
    catalogControls.disabled = false;
    refreshCatalogButton.disabled = false;
    connectAdminButton.textContent = 'Connected';
  } catch (error) {
    adminApiKey = '';
    connectAdminButton.textContent = 'Connect';
    setCatalogStatus(error.message, true);
  } finally {
    connectAdminButton.disabled = false;
  }
}

async function fetchMerchants() {
  const json = await requestJson('/api/admin/merchants');
  return json.data || [];
}

async function fetchPaymentMethods() {
  const json = await requestJson('/api/admin/payment-methods');
  return json.data || [];
}

async function fetchRewardRules() {
  const json = await requestJson('/api/admin/reward-rules');
  return json.data || [];
}

async function fetchAcceptedPaymentMethods(merchantId) {
  const json = await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}/payment-methods`);
  return json.data || [];
}

function renderMerchantOptions() {
  const options = merchants.length
    ? merchants.map((merchant) => `<option value="${merchant.id}">${escapeHtml(merchant.name)}</option>`).join('')
    : '<option value="">Add a merchant first</option>';

  ruleMerchantSelect.innerHTML = merchants.length
    ? merchants.map((merchant) => `<option value="${escapeHtml(merchant.name)}">${escapeHtml(merchant.name)}</option>`).join('')
    : options;
  acceptanceMerchantSelect.innerHTML = options;
}

function renderPaymentMethodOptions() {
  document.getElementById('payment-method').innerHTML = paymentMethods.length
    ? paymentMethods.map((method) => `<option value="${method.id}">${escapeHtml(method.name)}</option>`).join('')
    : '<option value="">Add a payment method first</option>';
}

function renderMerchants() {
  if (!merchants.length) {
    merchantsContainer.innerHTML = '<p class="muted">No merchants configured.</p>';
    return;
  }

  merchantsContainer.innerHTML = `
    <table>
      <thead><tr><th>Merchant</th><th></th></tr></thead>
      <tbody>
        ${merchants.map((merchant) => `
          <tr>
            <td>${escapeHtml(merchant.name)}</td>
            <td class="table-actions">
              <button class="secondary-button edit-merchant" type="button" data-merchant-id="${merchant.id}" data-merchant-name="${escapeHtml(merchant.name)}">Edit</button>
              <button class="danger-button delete-merchant" type="button" data-merchant-id="${merchant.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPaymentMethods() {
  if (!paymentMethods.length) {
    paymentMethodsContainer.innerHTML = '<p class="muted">No payment methods configured.</p>';
    return;
  }

  paymentMethodsContainer.innerHTML = `
    <table>
      <thead><tr><th>Payment method</th><th>Type</th><th></th></tr></thead>
      <tbody>
        ${paymentMethods.map((method) => `
          <tr>
            <td>${escapeHtml(method.name)}</td>
            <td>${escapeHtml(method.type)}</td>
            <td class="table-actions">
              <button class="secondary-button edit-payment-method" type="button" data-payment-method-id="${method.id}">Edit</button>
              <button class="danger-button delete-payment-method" type="button" data-payment-method-id="${method.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRewardRules(rules) {
  if (!rules.length) {
    rewardRules.innerHTML = '<p class="muted">No reward rules configured.</p>';
    return;
  }

  rewardRules.innerHTML = `
    <table>
      <thead><tr><th>Merchant</th><th>Method</th><th>Rate</th><th>Validity</th><th></th></tr></thead>
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

async function renderAcceptedPaymentMethods() {
  const merchantId = acceptanceMerchantSelect.value;

  if (!merchantId) {
    acceptedPaymentMethods.innerHTML = '<p class="muted">Add a merchant first.</p>';
    return;
  }

  const accepted = await fetchAcceptedPaymentMethods(merchantId);
  const acceptedIds = new Set(accepted.map((method) => method.id));

  acceptedPaymentMethods.innerHTML = paymentMethods.length
    ? paymentMethods.map((method) => `
      <label class="checkbox-row">
        <input type="checkbox" data-payment-method-id="${method.id}" ${acceptedIds.has(method.id) ? 'checked' : ''} />
        ${escapeHtml(method.name)}
      </label>
    `).join('')
    : '<p class="muted">Add a payment method first.</p>';
}

function setCatalogStatus(message, isError = false) {
  catalogStatus.textContent = message;
  catalogStatus.className = `status${isError ? ' error' : ''}`;
}

async function refreshCatalog() {
  const [merchantData, paymentMethodData, rewardRuleData] = await Promise.all([
    fetchMerchants(),
    fetchPaymentMethods(),
    fetchRewardRules()
  ]);
  merchants = merchantData;
  paymentMethods = paymentMethodData;
  renderMerchantOptions();
  renderPaymentMethodOptions();
  renderMerchants();
  renderPaymentMethods();
  renderRewardRules(rewardRuleData);
  await renderAcceptedPaymentMethods();
  setCatalogStatus(`Loaded ${merchants.length} merchants, ${paymentMethods.length} payment methods, and ${rewardRuleData.length} reward rules.`);
}

connectAdminButton.addEventListener('click', connectAdmin);
refreshCatalogButton.addEventListener('click', async () => {
  try {
    await refreshCatalog();
  } catch (error) {
    setCatalogStatus(error.message, true);
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

paymentMethodForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('payment-method-name').value.trim();
  const type = document.getElementById('payment-method-type').value.trim();

  try {
    await requestJson('/api/admin/payment-methods', {
      method: 'POST',
      body: JSON.stringify({ name, type })
    });
    paymentMethodForm.reset();
    await refreshCatalog();
    setCatalogStatus(`Added payment method "${name}".`);
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

merchantsContainer.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const merchantId = button.dataset.merchantId;
  try {
    if (button.classList.contains('edit-merchant')) {
      const name = window.prompt('Merchant name', button.dataset.merchantName);
      if (!name?.trim()) {
        return;
      }
      await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ merchantName: name.trim() })
      });
      setCatalogStatus('Updated merchant.');
    } else if (button.classList.contains('delete-merchant')) {
      await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}`, { method: 'DELETE' });
      setCatalogStatus('Deleted merchant.');
    } else {
      return;
    }
    await refreshCatalog();
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

paymentMethodsContainer.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const paymentMethodId = button.dataset.paymentMethodId;
  const method = paymentMethods.find((item) => String(item.id) === paymentMethodId);
  if (!method) {
    return;
  }

  try {
    if (button.classList.contains('edit-payment-method')) {
      const name = window.prompt('Payment method name', method.name);
      if (!name?.trim()) {
        return;
      }
      const type = window.prompt('Payment method type', method.type);
      if (!type?.trim()) {
        return;
      }
      await requestJson(`/api/admin/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), type: type.trim() })
      });
      setCatalogStatus('Updated payment method.');
    } else if (button.classList.contains('delete-payment-method')) {
      await requestJson(`/api/admin/payment-methods/${encodeURIComponent(paymentMethodId)}`, { method: 'DELETE' });
      setCatalogStatus('Deleted payment method.');
    } else {
      return;
    }
    await refreshCatalog();
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

acceptanceMerchantSelect.addEventListener('change', async () => {
  try {
    await renderAcceptedPaymentMethods();
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

acceptedPaymentMethods.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  if (!checkbox || !acceptanceMerchantSelect.value) {
    return;
  }

  const merchantId = acceptanceMerchantSelect.value;
  const paymentMethodId = checkbox.dataset.paymentMethodId;
  try {
    await requestJson(
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`,
      { method: checkbox.checked ? 'PUT' : 'DELETE' }
    );
    await renderAcceptedPaymentMethods();
    setCatalogStatus('Updated accepted payment methods.');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    setCatalogStatus(error.message, true);
  }
});

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

setCatalogStatus('Enter your Admin API key and connect to load the catalog.');
