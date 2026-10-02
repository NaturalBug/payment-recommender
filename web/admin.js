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
const promotionDraftStatusFilter = document.getElementById('promotion-draft-status');
const promotionDraftsContainer = document.getElementById('promotion-drafts');
const adminApiKeyInput = document.getElementById('admin-api-key');
const connectAdminButton = document.getElementById('connect-admin');
const catalogControls = document.getElementById('catalog-controls');
const apiBaseUrl = `http://${window.location.hostname}:4000`;
const today = new Date().toISOString().slice(0, 10);

let adminApiKey = '';
let merchants = [];
let paymentMethods = [];
let promotionDrafts = [];
let acceptedPaymentMethodCache = new Map();

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

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatOptionalValue(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function findMerchantName(merchantId) {
  return merchants.find((merchant) => merchant.id === merchantId)?.name || `Merchant #${merchantId}`;
}

function findPaymentMethodName(paymentMethodId) {
  return paymentMethods.find((method) => method.id === paymentMethodId)?.name || `Payment method #${paymentMethodId}`;
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

async function fetchPromotionDrafts(status = promotionDraftStatusFilter.value) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const json = await requestJson(`/api/admin/promotion-drafts${query}`);
  return json.data || [];
}

async function fetchAcceptedPaymentMethods(merchantId) {
  const json = await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}/payment-methods`);
  return json.data || [];
}

async function fetchAcceptedPaymentMethodIds(merchantId) {
  if (!merchantId) {
    return new Set();
  }

  const cacheKey = String(merchantId);
  if (acceptedPaymentMethodCache.has(cacheKey)) {
    return acceptedPaymentMethodCache.get(cacheKey);
  }

  const accepted = await fetchAcceptedPaymentMethods(merchantId);
  const acceptedIds = new Set(accepted.map((method) => Number(method.id)));
  acceptedPaymentMethodCache.set(cacheKey, acceptedIds);
  return acceptedIds;
}

async function primePromotionDraftAcceptanceCache(drafts) {
  const merchantIds = [...new Set(
    drafts
      .map((draft) => draft.merchantId)
      .filter((merchantId) => Number.isInteger(merchantId) && merchantId > 0)
  )];

  await Promise.all(merchantIds.map((merchantId) => fetchAcceptedPaymentMethodIds(merchantId)));
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

function renderDraftMerchantOptions(selectedMerchantId, readOnly) {
  const disabled = readOnly ? ' disabled' : '';
  const selectedValue = Number.isInteger(selectedMerchantId) ? String(selectedMerchantId) : '';
  const placeholder = merchants.length ? '<option value="">Select merchant</option>' : '<option value="">Add a merchant first</option>';
  const hasSelectedMerchant = selectedValue && merchants.some((merchant) => String(merchant.id) === selectedValue);
  const fallbackOption = selectedValue && !hasSelectedMerchant
    ? [`<option value="${selectedValue}" selected>${escapeHtml(findMerchantName(Number(selectedValue)))}</option>`]
    : [];

  return [
    placeholder,
    ...fallbackOption,
    ...merchants.map((merchant) => `
      <option value="${merchant.id}"${String(merchant.id) === selectedValue ? ' selected' : ''}${disabled}>${escapeHtml(merchant.name)}</option>
    `)
  ].join('');
}

function renderDraftPaymentMethodOptions({ draft, acceptedIds, selectedPaymentMethodId, readOnly }) {
  const selectedValue = Number.isInteger(selectedPaymentMethodId) ? selectedPaymentMethodId : null;
  const placeholder = !draft.merchantId
    ? '<option value="">Select merchant first</option>'
    : '<option value="">Select payment method</option>';

  if (readOnly) {
    if (!selectedValue) {
      return `${placeholder}`;
    }

    return `${placeholder}<option value="${selectedValue}" selected>${escapeHtml(findPaymentMethodName(selectedValue))}</option>`;
  }

  if (!draft.merchantId) {
    return placeholder;
  }

  const optionMethods = paymentMethods.filter((method) => acceptedIds.has(method.id) || method.id === selectedValue);
  if (!optionMethods.length) {
    return '<option value="">No accepted payment methods</option>';
  }

  return [
    placeholder,
    ...optionMethods.map((method) => {
      const isAccepted = acceptedIds.has(method.id);
      const label = isAccepted ? method.name : `${method.name} (not accepted)`;
      return `<option value="${method.id}"${method.id === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
  ].join('');
}

function describeDraftAcceptanceState(merchantId, paymentMethodId, acceptedIds) {
  if (!merchantId) {
    return 'Select a merchant to review this draft.';
  }

  if (!acceptedIds.size) {
    return 'This merchant has no accepted payment methods configured. Update Accepted payment methods before publishing.';
  }

  if (paymentMethodId && !acceptedIds.has(paymentMethodId)) {
    return 'The selected payment method is not accepted for this merchant. Update Accepted payment methods or choose a different method before publishing.';
  }

  return 'Publishing is available once the reviewed fields are complete.';
}

function renderPromotionDrafts() {
  if (!promotionDrafts.length) {
    const selectedStatus = promotionDraftStatusFilter.value.replace('_', ' ');
    promotionDraftsContainer.innerHTML = `<p class="muted">No imported promotions with status ${escapeHtml(selectedStatus)}.</p>`;
    return;
  }

  promotionDraftsContainer.innerHTML = promotionDrafts.map((draft) => {
    const readOnly = draft.status !== 'pending_review';
    const merchantId = Number.isInteger(draft.merchantId) ? draft.merchantId : null;
    const paymentMethodId = Number.isInteger(draft.paymentMethodId) ? draft.paymentMethodId : null;
    const cashbackRate = draft.cashbackRate ?? draft.parsedCashbackRate ?? '';
    const amountThreshold = draft.amountThreshold ?? draft.parsedAmountThreshold ?? '';
    const validityStart = draft.validityStart ?? draft.parsedValidityStart ?? '';
    const validityEnd = draft.validityEnd ?? draft.parsedValidityEnd ?? '';
    const promotionNote = draft.promotionNote ?? '';
    const safeUrl = safeHttpsUrl(draft.sourceUrl);
    const sourceUrlMarkup = safeUrl
      ? `<a class="promotion-draft-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(draft.sourceUrl)}</a>`
      : `<span class="promotion-draft-link-text">${escapeHtml(draft.sourceUrl)}</span>`;
    const acceptedIds = merchantId ? (acceptedPaymentMethodCache.get(String(merchantId)) || new Set()) : new Set();
    const acceptanceHint = describeDraftAcceptanceState(merchantId, paymentMethodId, acceptedIds);
    const disabled = readOnly ? ' disabled' : '';
    const readOnlySummary = draft.status === 'published'
      ? `<p class="promotion-draft-readonly-note">Published as reward rule #${escapeHtml(formatOptionalValue(draft.rewardRuleId))}.</p>`
      : draft.status === 'rejected'
        ? `<p class="promotion-draft-readonly-note">Rejected reason: ${escapeHtml(formatOptionalValue(draft.rejectionReason, 'Not provided'))}</p>`
        : '';

    return `
      <article class="promotion-draft-card" data-draft-id="${draft.id}">
        <div class="promotion-draft-header">
          <div>
            <p class="eyebrow">Imported promotion</p>
            <h3>${escapeHtml(draft.sourceTitle || `Draft #${draft.id}`)}</h3>
          </div>
          <span class="promotion-draft-status promotion-draft-status-${escapeHtml(draft.status)}">${escapeHtml(draft.status.replaceAll('_', ' '))}</span>
        </div>
        <dl class="promotion-draft-meta">
          <div><dt>Source</dt><dd>${escapeHtml(draft.source)}</dd></div>
          <div><dt>Fetched</dt><dd>${escapeHtml(new Date(draft.fetchedAt).toLocaleString())}</dd></div>
          <div class="promotion-draft-meta-wide"><dt>Source URL</dt><dd>${sourceUrlMarkup}</dd></div>
        </dl>
        <div class="promotion-draft-source-block">
          <h4>Captured source text</h4>
          <pre class="promotion-draft-source-content">${escapeHtml(draft.sourceContent)}</pre>
        </div>
        <form class="promotion-draft-form" data-draft-id="${draft.id}" data-draft-status="${escapeHtml(draft.status)}">
          <div class="promotion-draft-grid">
            <label>
              Merchant
              <select name="merchantId"${disabled}>${renderDraftMerchantOptions(merchantId, readOnly)}</select>
            </label>
            <label>
              Payment method
              <select name="paymentMethodId"${disabled}>${renderDraftPaymentMethodOptions({
                draft: { ...draft, merchantId },
                acceptedIds,
                selectedPaymentMethodId: paymentMethodId,
                readOnly
              })}</select>
            </label>
            <label>
              Cashback rate
              <input name="cashbackRate" type="number" min="0" step="0.001" value="${escapeHtml(cashbackRate)}"${disabled} />
            </label>
            <label>
              Amount threshold
              <input name="amountThreshold" type="number" min="0" step="1" value="${escapeHtml(amountThreshold)}"${disabled} />
            </label>
            <label>
              Valid from
              <input name="validityStart" type="date" value="${escapeHtml(validityStart)}"${disabled} />
            </label>
            <label>
              Valid until
              <input name="validityEnd" type="date" value="${escapeHtml(validityEnd)}"${disabled} />
            </label>
            <label class="promotion-draft-grid-wide">
              Review note
              <textarea name="promotionNote" rows="3" maxlength="500"${disabled}>${escapeHtml(promotionNote)}</textarea>
            </label>
            <label class="promotion-draft-grid-wide">
              Reject reason
              <input name="rejectReason" type="text" maxlength="500" placeholder="Explain why this draft should be rejected"${readOnly ? ` value="${escapeHtml(draft.rejectionReason ?? '')}" disabled` : ''} />
            </label>
          </div>
          <p class="promotion-draft-hint" data-role="acceptance-hint">${escapeHtml(acceptanceHint)}</p>
          ${readOnlySummary}
          ${readOnly ? '' : `
            <div class="promotion-draft-actions">
              <button type="button" class="secondary-button" data-action="save">Save review</button>
              <button type="button" data-action="publish">Publish</button>
              <button type="button" class="danger-button" data-action="reject">Reject</button>
            </div>
          `}
        </form>
      </article>
    `;
  }).join('');
}

async function renderAcceptedPaymentMethods() {
  const merchantId = acceptanceMerchantSelect.value;

  if (!merchantId) {
    acceptedPaymentMethods.innerHTML = '<p class="muted">Add a merchant first.</p>';
    return;
  }

  const accepted = await fetchAcceptedPaymentMethods(merchantId);
  const acceptedIds = new Set(accepted.map((method) => method.id));
  acceptedPaymentMethodCache.set(String(merchantId), new Set([...acceptedIds].map((id) => Number(id))));

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
  const [merchantData, paymentMethodData, rewardRuleData, promotionDraftData] = await Promise.all([
    fetchMerchants(),
    fetchPaymentMethods(),
    fetchRewardRules(),
    fetchPromotionDrafts()
  ]);
  merchants = merchantData;
  paymentMethods = paymentMethodData;
  promotionDrafts = promotionDraftData;
  acceptedPaymentMethodCache = new Map();
  renderMerchantOptions();
  renderPaymentMethodOptions();
  renderMerchants();
  renderPaymentMethods();
  renderRewardRules(rewardRuleData);
  await renderAcceptedPaymentMethods();
  await primePromotionDraftAcceptanceCache(promotionDrafts);
  renderPromotionDrafts();
  setCatalogStatus(`Loaded ${merchants.length} merchants, ${paymentMethods.length} payment methods, ${rewardRuleData.length} reward rules, and ${promotionDrafts.length} imported promotion drafts.`);
}

function getFormNumericValue(form, fieldName) {
  const element = form.elements.namedItem(fieldName);
  const value = element?.value?.trim?.() ?? '';
  return value ? Number(value) : null;
}

function collectPromotionDraftReviewPayload(form) {
  const merchantId = getFormNumericValue(form, 'merchantId');
  const paymentMethodId = getFormNumericValue(form, 'paymentMethodId');
  const cashbackRateRaw = form.elements.namedItem('cashbackRate').value.trim();
  const amountThresholdRaw = form.elements.namedItem('amountThreshold').value.trim();
  const validityStart = form.elements.namedItem('validityStart').value;
  const validityEnd = form.elements.namedItem('validityEnd').value;
  const promotionNote = form.elements.namedItem('promotionNote').value.trim();

  const payload = {
    promotionNote: promotionNote || null
  };

  if (merchantId !== null) {
    payload.merchantId = merchantId;
  }
  if (paymentMethodId !== null) {
    payload.paymentMethodId = paymentMethodId;
  }
  if (cashbackRateRaw) {
    payload.cashbackRate = Number(cashbackRateRaw);
  }
  if (amountThresholdRaw) {
    payload.amountThreshold = Number(amountThresholdRaw);
  }
  if (validityStart) {
    payload.validityStart = validityStart;
  }
  if (validityEnd) {
    payload.validityEnd = validityEnd;
  }

  return payload;
}

function setDraftFormPending(form, isPending) {
  form.querySelectorAll('button').forEach((button) => {
    button.disabled = isPending;
  });
  form.classList.toggle('is-pending', isPending);
}

async function syncDraftPaymentMethodOptions(form) {
  const merchantId = getFormNumericValue(form, 'merchantId');
  const paymentMethodSelect = form.elements.namedItem('paymentMethodId');
  const selectedPaymentMethodId = paymentMethodSelect.value ? Number(paymentMethodSelect.value) : null;
  const acceptedIds = merchantId ? await fetchAcceptedPaymentMethodIds(merchantId) : new Set();
  const draft = promotionDrafts.find((item) => String(item.id) === form.dataset.draftId);

  paymentMethodSelect.innerHTML = renderDraftPaymentMethodOptions({
    draft: { ...(draft || {}), merchantId },
    acceptedIds,
    selectedPaymentMethodId,
    readOnly: false
  });

  form.querySelector('[data-role="acceptance-hint"]').textContent = describeDraftAcceptanceState(
    merchantId,
    paymentMethodSelect.value ? Number(paymentMethodSelect.value) : null,
    acceptedIds
  );
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
  payload.paymentMethodId = Number(payload.paymentMethodId);
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
    renderPromotionDrafts();
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
    acceptedPaymentMethodCache.delete(String(merchantId));
    await renderAcceptedPaymentMethods();
    renderPromotionDrafts();
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

promotionDraftStatusFilter.addEventListener('change', async () => {
  try {
    await refreshCatalog();
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

promotionDraftsContainer.addEventListener('change', async (event) => {
  const form = event.target.closest('.promotion-draft-form');
  if (!form) {
    return;
  }

  try {
    if (event.target.name === 'merchantId') {
      await syncDraftPaymentMethodOptions(form);
      return;
    }

    if (event.target.name === 'paymentMethodId') {
      const merchantId = getFormNumericValue(form, 'merchantId');
      const acceptedIds = merchantId ? await fetchAcceptedPaymentMethodIds(merchantId) : new Set();
      form.querySelector('[data-role="acceptance-hint"]').textContent = describeDraftAcceptanceState(
        merchantId,
        getFormNumericValue(form, 'paymentMethodId'),
        acceptedIds
      );
    }
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

promotionDraftsContainer.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const form = button.closest('.promotion-draft-form');
  if (!form) {
    return;
  }

  const draftId = form.dataset.draftId;
  const action = button.dataset.action;

  setDraftFormPending(form, true);

  try {
    if (action === 'save') {
      await requestJson(`/api/admin/promotion-drafts/${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        body: JSON.stringify(collectPromotionDraftReviewPayload(form))
      });
      await refreshCatalog();
      setCatalogStatus(`Saved review fields for draft #${draftId}.`);
      return;
    }

    if (action === 'publish') {
      await requestJson(`/api/admin/promotion-drafts/${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        body: JSON.stringify(collectPromotionDraftReviewPayload(form))
      });
      const response = await requestJson(`/api/admin/promotion-drafts/${encodeURIComponent(draftId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      await refreshCatalog();
      setCatalogStatus(`Published draft #${draftId} as reward rule #${response.data.rewardRuleId}.`);
      return;
    }

    if (action === 'reject') {
      const reason = form.elements.namedItem('rejectReason').value.trim();
      if (!reason) {
        throw new Error('Enter a rejection reason before rejecting a draft.');
      }
      await requestJson(`/api/admin/promotion-drafts/${encodeURIComponent(draftId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      await refreshCatalog();
      setCatalogStatus(`Rejected draft #${draftId}.`);
    }
  } catch (error) {
    setCatalogStatus(error.message, true);
  } finally {
    setDraftFormPending(form, false);
  }
});

setCatalogStatus('Enter your Admin API key and connect to load the catalog.');
