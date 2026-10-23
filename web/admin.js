const ruleMerchantSelect = document.getElementById('rule-merchant');
const merchantForm = document.getElementById('merchant-form');
const paymentMethodForm = document.getElementById('payment-method-form');
const physicalOutletForm = document.getElementById('physical-outlet-form');
const branchForm = document.getElementById('branch-form');
const rewardRuleForm = document.getElementById('reward-rule-form');
const refreshCatalogButton = document.getElementById('refresh-catalog');
const catalogStatus = document.getElementById('catalog-status');
const merchantsContainer = document.getElementById('merchants');
const paymentMethodsContainer = document.getElementById('payment-methods');
const outletsContainer = document.getElementById('outlets');
const branchesContainer = document.getElementById('branches');
const acceptanceMerchantSelect = document.getElementById('acceptance-merchant');
const branchMerchantSelect = document.getElementById('branch-merchant');
const branchOutletSelect = document.getElementById('branch-outlet');
const acceptedPaymentMethods = document.getElementById('accepted-payment-methods');
const rewardRules = document.getElementById('reward-rules');
const ruleOutletSelect = document.getElementById('rule-outlet');
const benefitTypeSelect = document.getElementById('benefit-type');
const cashbackRateInput = document.getElementById('cashback-rate');
const fixedDiscountAmountInput = document.getElementById('fixed-discount-amount');
const promotionDraftStatusFilter = document.getElementById('promotion-draft-status');
const importRunsContainer = document.getElementById('import-runs');
const promotionDraftsContainer = document.getElementById('promotion-drafts');
const adminApiKeyInput = document.getElementById('admin-api-key');
const connectAdminButton = document.getElementById('connect-admin');
const catalogControls = document.getElementById('catalog-controls');
const apiBaseUrl = `http://${window.location.hostname}:4000`;
const today = new Date().toISOString().slice(0, 10);

let adminApiKey = '';
let merchants = [];
let paymentMethods = [];
let physicalOutlets = [];
let merchantBranches = [];
let importRuns = [];
let promotionDrafts = [];

refreshCatalogButton.disabled = true;
document.getElementById('validity-start').value = today;
document.getElementById('validity-end').value = today;
cashbackRateInput.required = true;
fixedDiscountAmountInput.required = false;

function syncBenefitInputs() {
  const isCashback = benefitTypeSelect.value === 'cashback';
  cashbackRateInput.required = isCashback;
  fixedDiscountAmountInput.required = !isCashback;
  cashbackRateInput.disabled = !isCashback;
  fixedDiscountAmountInput.disabled = isCashback;
}

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

async function fetchMerchantBranches(merchantId) {
  const json = await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}/branches`);
  return json.data || [];
}

async function fetchOutlets() {
  const json = await requestJson('/api/admin/outlets');
  return json.data || [];
}

async function fetchRewardRules() {
  const json = await requestJson('/api/admin/reward-rules');
  return json.data || [];
}

async function fetchImportRuns() {
  const json = await requestJson('/api/admin/import-runs');
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

function renderMerchantOptions() {
  const options = merchants.length
    ? merchants.map((merchant) => `<option value="${merchant.id}">${escapeHtml(merchant.name)}</option>`).join('')
    : '<option value="">Add a merchant first</option>';

  ruleMerchantSelect.innerHTML = options;
  acceptanceMerchantSelect.innerHTML = options;
  branchMerchantSelect.innerHTML = options;
  branchOutletSelect.innerHTML = [
    '<option value="">No Outlet association</option>',
    ...physicalOutlets.map((outlet) => `<option value="${outlet.id}">${escapeHtml(outlet.name)}${outlet.location ? ` — ${escapeHtml(outlet.location)}` : ''}</option>`)
  ].join('');
  renderOutletOptions(ruleOutletSelect, ruleMerchantSelect.value, null);
}

function renderOutletOptions(select, merchantId, selectedOutletId, readOnly = false) {
  const options = merchantBranches.filter((branch) => String(branch.merchantId) === String(merchantId));
  const disabled = readOnly ? ' disabled' : '';
  select.innerHTML = [
    '<option value="">All branches</option>',
    ...options.map((outlet) => `
      <option value="${outlet.id}"${String(outlet.id) === String(selectedOutletId ?? '') ? ' selected' : ''}${disabled}>
        ${escapeHtml(outlet.name)}${outlet.location ? ` — ${escapeHtml(outlet.location)}` : ''}
      </option>
    `)
  ].join('');
  if (readOnly && selectedOutletId && !options.some((outlet) => outlet.id === selectedOutletId)) {
    select.innerHTML += `<option value="${selectedOutletId}" selected disabled>Branch #${selectedOutletId}</option>`;
  }
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
      <thead><tr><th>Merchant</th><th>Method</th><th>Benefit</th><th>Branch</th><th>Validity</th><th></th></tr></thead>
      <tbody>
        ${rules.map((rule) => `
          <tr>
            <td>${escapeHtml(rule.merchantName)}</td>
            <td>${escapeHtml(rule.paymentMethodId)}</td>
            <td>${rule.benefitType === 'fixed_discount'
              ? `NT$ ${escapeHtml(rule.fixedDiscountAmount)} off`
              : `${(Number(rule.cashbackRate) * 100).toFixed(2)}% cashback`}</td>
            <td>${escapeHtml(rule.outletName || 'All branches')}</td>
            <td>${escapeHtml(rule.validityStart)} - ${escapeHtml(rule.validityEnd)}</td>
            <td><button class="danger-button delete-rule" type="button" data-rule-id="${escapeHtml(rule.id)}">Delete</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderOutlets() {
  if (!physicalOutlets.length) {
    outletsContainer.innerHTML = '<p class="muted">No outlets configured.</p>';
    return;
  }

  outletsContainer.innerHTML = `
    <table>
      <thead><tr><th>Shopping Outlet</th><th>Location</th></tr></thead>
      <tbody>${physicalOutlets.map((outlet) => `
        <tr>
          <td>${escapeHtml(outlet.name)}</td>
          <td>${escapeHtml(outlet.location || '—')}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

function renderBranches() {
  if (!merchantBranches.length) {
    branchesContainer.innerHTML = '<p class="muted">No merchant branches configured.</p>';
    return;
  }

  branchesContainer.innerHTML = `
    <table>
      <thead><tr><th>Merchant</th><th>Branch</th><th>Location</th><th>Shopping Outlet</th></tr></thead>
      <tbody>${merchantBranches.map((branch) => `
        <tr>
          <td>${escapeHtml(findMerchantName(branch.merchantId))}</td>
          <td>${escapeHtml(branch.name)}</td>
          <td>${escapeHtml(branch.location || '—')}</td>
          <td>${escapeHtml(physicalOutlets.find((outlet) => outlet.id === branch.outletId)?.name || '—')}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

function formatImportRunOutcome(run) {
  if (run.status === 'completed') {
    const draftCount = Number(run.draftCount) || 0;
    return `Imported ${draftCount} draft${draftCount === 1 ? '' : 's'}.`;
  }

  if (run.status === 'failed') {
    return run.errorMessage || 'Import failed without a recorded error message.';
  }

  return 'Import is still running.';
}

function renderImportRuns() {
  if (!importRuns.length) {
    importRunsContainer.innerHTML = '<p class="muted">No import runs recorded yet.</p>';
    return;
  }

  importRunsContainer.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Source</th>
            <th>Status</th>
            <th>Drafts</th>
            <th>Completed</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          ${importRuns.map((run) => `
            <tr>
              <td>${escapeHtml(new Date(run.startedAt).toLocaleString())}</td>
              <td>${escapeHtml(run.source)}</td>
              <td><span class="promotion-draft-status promotion-draft-status-${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></td>
              <td>${escapeHtml(formatOptionalValue(run.draftCount, '0'))}</td>
              <td>${escapeHtml(run.completedAt ? new Date(run.completedAt).toLocaleString() : '—')}</td>
              <td class="promotion-import-run-outcome">${escapeHtml(formatImportRunOutcome(run))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getReviewedDraftValue(draft, reviewedField, reviewedValue, parsedValue) {
  if (draft[reviewedField]) {
    return draft[reviewedValue] ?? '';
  }

  return draft[parsedValue] ?? '';
}

function renderPromotionScopeOptions({ draft, disabled }) {
  const disabledAttribute = disabled ? ' disabled' : '';
  const selectedPaymentMethodIds = new Set(draft.paymentMethodIds || []);
  const selectedEligibleBranchIds = new Set(draft.eligibleBranchIds || []);
  const selectedExcludedMerchantIds = new Set(draft.excludedMerchantIds || []);
  const selectedExcludedBranchIds = new Set(draft.excludedBranchIds || []);

  const options = (items, selectedIds, label) => items.map((item) => `
    <option value="${item.id}"${selectedIds.has(item.id) ? ' selected' : ''}>${escapeHtml(label(item))}</option>
  `).join('');
  const originMerchantOptions = [
    '<option value="">Select origin Merchant</option>',
    ...merchants.map((merchant) => `<option value="${merchant.id}"${merchant.id === draft.originMerchantId ? ' selected' : ''}>${escapeHtml(merchant.name)}</option>`)
  ].join('');
  const originOutletOptions = [
    '<option value="">Select origin Outlet</option>',
    ...physicalOutlets.map((outlet) => `<option value="${outlet.id}"${outlet.id === draft.originOutletId ? ' selected' : ''}>${escapeHtml(outlet.name)}${outlet.location ? ` — ${escapeHtml(outlet.location)}` : ''}</option>`)
  ].join('');
  const branchOptions = (selectedIds) => merchantBranches.map((branch) => {
    const outlet = physicalOutlets.find((item) => item.id === branch.outletId);
    const location = [branch.location, outlet ? `at ${outlet.name}` : ''].filter(Boolean).join(' ');
    const label = `${findMerchantName(branch.merchantId)} — ${branch.name}${location ? ` (${location})` : ''}`;
    return `<option value="${branch.id}" data-merchant-id="${branch.merchantId}" data-outlet-id="${branch.outletId ?? ''}"${selectedIds.has(branch.id) ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  return `
    <label>
      Promotion origin
      <select name="originType"${disabledAttribute}>
        <option value="">Select origin</option>
        <option value="merchant"${draft.originType === 'merchant' ? ' selected' : ''}>Merchant</option>
        <option value="outlet"${draft.originType === 'outlet' ? ' selected' : ''}>Shopping Outlet</option>
      </select>
    </label>
    <label>
      Origin Merchant
      <select name="originMerchantId"${disabledAttribute}>${originMerchantOptions}</select>
    </label>
    <label>
      Origin Outlet
      <select name="originOutletId"${disabledAttribute}>${originOutletOptions}</select>
    </label>
    <label>
      Eligibility
      <select name="eligibilityType"${disabledAttribute}>
        <option value="">Select eligibility</option>
        <option value="merchant_wide"${draft.eligibilityType === 'merchant_wide' ? ' selected' : ''}>Merchant-wide</option>
        <option value="selected_branches"${draft.eligibilityType === 'selected_branches' ? ' selected' : ''}>Selected Merchant branches</option>
        <option value="outlet"${draft.eligibilityType === 'outlet' ? ' selected' : ''}>Selected Outlet</option>
      </select>
    </label>
    <label>
      Payment methods (select one or more)
      <select name="paymentMethodIds" multiple${disabledAttribute}>
        ${options(paymentMethods, selectedPaymentMethodIds, (method) => method.name)}
      </select>
    </label>
    <label>
      Eligible branches
      <select name="eligibleBranchIds" multiple${disabledAttribute}>
        ${branchOptions(selectedEligibleBranchIds)}
      </select>
    </label>
    <label>
      Excluded Merchants
      <select name="excludedMerchantIds" multiple${disabledAttribute}>
        ${options(merchants, selectedExcludedMerchantIds, (merchant) => merchant.name)}
      </select>
    </label>
    <label>
      Excluded branches
      <select name="excludedBranchIds" multiple${disabledAttribute}>
        ${branchOptions(selectedExcludedBranchIds)}
      </select>
    </label>
  `;
}

function renderPromotionDrafts() {
  if (!promotionDrafts.length) {
    const selectedStatus = promotionDraftStatusFilter.value.replace('_', ' ');
    promotionDraftsContainer.innerHTML = `<p class="muted">No imported promotions with status ${escapeHtml(selectedStatus)}.</p>`;
    return;
  }

  promotionDraftsContainer.innerHTML = promotionDrafts.map((draft) => {
    const readOnly = draft.status !== 'pending_review';
    const cashbackRate = getReviewedDraftValue(
      draft,
      'cashbackRateReviewed',
      'cashbackRate',
      'parsedCashbackRate'
    );
    const benefitType = draft.benefitTypeReviewed
      ? draft.benefitType
      : draft.parsedBenefitType || 'cashback';
    const fixedDiscountAmount = getReviewedDraftValue(
      draft,
      'fixedDiscountAmountReviewed',
      'fixedDiscountAmount',
      'parsedFixedDiscountAmount'
    );
    const amountThreshold = getReviewedDraftValue(
      draft,
      'amountThresholdReviewed',
      'amountThreshold',
      'parsedAmountThreshold'
    );
    const validityStart = getReviewedDraftValue(
      draft,
      'validityStartReviewed',
      'validityStart',
      'parsedValidityStart'
    );
    const validityEnd = getReviewedDraftValue(
      draft,
      'validityEndReviewed',
      'validityEnd',
      'parsedValidityEnd'
    );
    const promotionNote = draft.promotionNote ?? '';
    const safeUrl = safeHttpsUrl(draft.sourceUrl);
    const sourceUrlMarkup = safeUrl
      ? `<a class="promotion-draft-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(draft.sourceUrl)}</a>`
      : `<span class="promotion-draft-link-text">${escapeHtml(draft.sourceUrl)}</span>`;
    const sourceUpdatedNotice = draft.status === 'pending_review' &&
      draft.reviewedAt &&
      new Date(draft.fetchedAt) > new Date(draft.reviewedAt)
      ? '<p class="promotion-draft-readonly-note">Source data was refreshed after the last review. Check the latest captured text and parsed values before publishing.</p>'
      : '';
    const disabled = readOnly ? ' disabled' : '';
    const readOnlySummary = draft.status === 'published'
      ? '<p class="promotion-draft-readonly-note">Published as a canonical Promotion.</p>'
      : draft.status === 'rejected'
        ? `<p class="promotion-draft-readonly-note">Rejected reason: ${escapeHtml(formatOptionalValue(draft.rejectionReason, 'Not provided'))}</p>
          <button type="button" class="secondary-button" data-action="reopen">Reopen for review</button>`
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
        ${sourceUpdatedNotice}
        <form class="promotion-draft-form" data-draft-id="${draft.id}" data-draft-status="${escapeHtml(draft.status)}">
          <div class="promotion-draft-grid">
            ${renderPromotionScopeOptions({ draft, disabled: readOnly })}
            <label>
              Benefit type
              <select name="benefitType"${disabled}>
                <option value="cashback"${benefitType === 'cashback' ? ' selected' : ''}>Percentage cashback</option>
                <option value="fixed_discount"${benefitType === 'fixed_discount' ? ' selected' : ''}>Fixed cash discount</option>
              </select>
            </label>
            <label>
              Cashback rate
              <input name="cashbackRate" type="number" min="0" step="0.001" value="${escapeHtml(cashbackRate)}"${disabled} />
            </label>
            <label>
              Fixed discount (TWD)
              <input name="fixedDiscountAmount" type="number" min="1" step="1" value="${escapeHtml(fixedDiscountAmount)}"${disabled} />
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
              <textarea name="promotionNote" rows="3" maxlength="500" placeholder="User-facing exclusions, limits, or quantity caveats"${disabled}>${escapeHtml(promotionNote)}</textarea>
            </label>
            <label class="promotion-draft-grid-wide">
              Reject reason
              <input name="rejectReason" type="text" maxlength="500" placeholder="Explain why this draft should be rejected"${readOnly ? ` value="${escapeHtml(draft.rejectionReason ?? '')}" disabled` : ''} />
            </label>
          </div>
          <p class="promotion-draft-hint">A Merchant's accepted payment methods are checked when recommendations are generated.</p>
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
  promotionDraftsContainer.querySelectorAll('.promotion-draft-form').forEach(updatePromotionScopeControls);
}

function updatePromotionScopeControls(form) {
  const editable = form.dataset.draftStatus === 'pending_review';
  const originType = form.elements.namedItem('originType').value;
  const eligibilityType = form.elements.namedItem('eligibilityType').value;
  form.elements.namedItem('originMerchantId').disabled = !editable || originType !== 'merchant';
  form.elements.namedItem('originOutletId').disabled = !editable || originType !== 'outlet';
  const eligibilitySelect = form.elements.namedItem('eligibilityType');
  eligibilitySelect.disabled = !editable || !originType;
  [...eligibilitySelect.options].forEach((option) => {
    option.disabled = option.value !== '' && (
      (originType === 'merchant' && option.value === 'outlet') ||
      (originType === 'outlet' && option.value !== 'outlet') ||
      !originType
    );
  });
  form.elements.namedItem('eligibleBranchIds').disabled =
    !editable || originType !== 'merchant' || eligibilityType !== 'selected_branches';
  form.elements.namedItem('excludedMerchantIds').disabled = !editable || originType !== 'outlet';
  form.elements.namedItem('excludedBranchIds').disabled = !editable || originType !== 'outlet';
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
  const [merchantData, paymentMethodData, rewardRuleData, importRunData, promotionDraftData, outletData] = await Promise.all([
    fetchMerchants(),
    fetchPaymentMethods(),
    fetchRewardRules(),
    fetchImportRuns(),
    fetchPromotionDrafts(),
    fetchOutlets()
  ]);
  merchants = merchantData;
  paymentMethods = paymentMethodData;
  physicalOutlets = outletData;
  merchantBranches = (await Promise.all(merchants.map((merchant) => fetchMerchantBranches(merchant.id)))).flat();
  importRuns = importRunData;
  promotionDrafts = promotionDraftData;
  renderMerchantOptions();
  renderPaymentMethodOptions();
  renderMerchants();
  renderPaymentMethods();
  renderOutlets();
  renderBranches();
  renderRewardRules(rewardRuleData);
  renderImportRuns();
  await renderAcceptedPaymentMethods();
  renderPromotionDrafts();
  setCatalogStatus(`Loaded ${merchants.length} merchants, ${paymentMethods.length} payment methods, ${rewardRuleData.length} reward rules, ${importRuns.length} import runs, and ${promotionDrafts.length} imported promotion drafts.`);
}

function getFormNumericValue(form, fieldName) {
  const element = form.elements.namedItem(fieldName);
  const value = element?.value?.trim?.() ?? '';
  return value ? Number(value) : null;
}

function collectPromotionDraftReviewPayload(form) {
  const selectedIds = (fieldName) => [...form.elements.namedItem(fieldName).selectedOptions].map((option) => Number(option.value));
  const originMerchantId = getFormNumericValue(form, 'originMerchantId');
  const originOutletId = getFormNumericValue(form, 'originOutletId');
  const eligibleBranchIds = selectedIds('eligibleBranchIds');
  const paymentMethodIds = selectedIds('paymentMethodIds');
  const benefitType = form.elements.namedItem('benefitType').value;
  const cashbackRateRaw = form.elements.namedItem('cashbackRate').value.trim();
  const fixedDiscountAmountRaw = form.elements.namedItem('fixedDiscountAmount').value.trim();
  const amountThresholdRaw = form.elements.namedItem('amountThreshold').value.trim();
  const validityStart = form.elements.namedItem('validityStart').value;
  const validityEnd = form.elements.namedItem('validityEnd').value;
  const promotionNote = form.elements.namedItem('promotionNote').value.trim();

  const payload = {
    originType: form.elements.namedItem('originType').value || null,
    originMerchantId,
    originOutletId,
    eligibilityType: form.elements.namedItem('eligibilityType').value || null,
    eligibleBranchIds,
    excludedMerchantIds: selectedIds('excludedMerchantIds'),
    excludedBranchIds: selectedIds('excludedBranchIds'),
    paymentMethodIds,
    benefitType,
    cashbackRate: cashbackRateRaw ? Number(cashbackRateRaw) : null,
    fixedDiscountAmount: fixedDiscountAmountRaw ? Number(fixedDiscountAmountRaw) : null,
    amountThreshold: amountThresholdRaw ? Number(amountThresholdRaw) : null,
    validityStart: validityStart || null,
    validityEnd: validityEnd || null,
    promotionNote: promotionNote || null
  };

  return payload;
}

function setDraftFormPending(form, isPending) {
  form.querySelectorAll('button').forEach((button) => {
    button.disabled = isPending;
  });
  form.classList.toggle('is-pending', isPending);
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
  const merchant = merchants.find((item) => String(item.id) === String(payload.merchantName));
  payload.merchantName = merchant?.name || '';
  payload.paymentMethodId = Number(payload.paymentMethodId);
  payload.outletId = payload.outletId ? Number(payload.outletId) : null;
  if (payload.benefitType === 'cashback') {
    payload.cashbackRate = Number(payload.cashbackRate);
    delete payload.fixedDiscountAmount;
  } else {
    payload.fixedDiscountAmount = Number(payload.fixedDiscountAmount);
    delete payload.cashbackRate;
  }
  payload.amountThreshold = Number(payload.amountThreshold);
  payload.sourceUrl = String(payload.sourceUrl || '').trim() || null;

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

benefitTypeSelect.addEventListener('change', syncBenefitInputs);
document.getElementById('rule-merchant').addEventListener('change', () => {
  renderOutletOptions(ruleOutletSelect, ruleMerchantSelect.value, null);
});

physicalOutletForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('physical-outlet-name').value.trim();
  const location = document.getElementById('physical-outlet-location').value.trim();

  try {
    await requestJson('/api/admin/outlets', {
      method: 'POST',
      body: JSON.stringify({ name, location: location || undefined })
    });
    physicalOutletForm.reset();
    await refreshCatalog();
    setCatalogStatus(`Added shopping Outlet "${name}".`);
  } catch (error) {
    setCatalogStatus(error.message, true);
  }
});

branchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantId = branchMerchantSelect.value;
  const name = document.getElementById('branch-name').value.trim();
  const location = document.getElementById('branch-location').value.trim();
  const outletId = branchOutletSelect.value ? Number(branchOutletSelect.value) : null;

  try {
    await requestJson(`/api/admin/merchants/${encodeURIComponent(merchantId)}/branches`, {
      method: 'POST',
      body: JSON.stringify({ name, location: location || undefined, outletId })
    });
    branchForm.reset();
    await refreshCatalog();
    setCatalogStatus(`Added merchant branch "${name}".`);
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
    await renderAcceptedPaymentMethods();
    setCatalogStatus('Updated accepted payment methods.');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    setCatalogStatus(error.message, true);
  }
});

promotionDraftsContainer.addEventListener('change', (event) => {
  const form = event.target.closest('.promotion-draft-form');
  if (!form) {
    return;
  }

  const originType = form.elements.namedItem('originType');
  const originMerchantId = form.elements.namedItem('originMerchantId');
  const originOutletId = form.elements.namedItem('originOutletId');
  const eligibilityType = form.elements.namedItem('eligibilityType');
  const eligibleBranchIds = form.elements.namedItem('eligibleBranchIds');
  const excludedBranchIds = form.elements.namedItem('excludedBranchIds');

  if (event.target === originType) {
    if (originType.value === 'merchant') {
      originOutletId.value = '';
      if (eligibilityType.value === 'outlet') {
        eligibilityType.value = 'merchant_wide';
      }
      [...eligibleBranchIds.options].forEach((option) => {
        option.selected = false;
      });
      [...form.elements.namedItem('excludedMerchantIds').options].forEach((option) => {
        option.selected = false;
      });
      [...excludedBranchIds.options].forEach((option) => {
        option.selected = false;
      });
    } else if (originType.value === 'outlet') {
      originMerchantId.value = '';
      eligibilityType.value = 'outlet';
      [...eligibleBranchIds.options].forEach((option) => {
        option.selected = false;
      });
    } else {
      originMerchantId.value = '';
      originOutletId.value = '';
      eligibilityType.value = '';
      [...eligibleBranchIds.options].forEach((option) => {
        option.selected = false;
      });
      [...form.elements.namedItem('excludedMerchantIds').options].forEach((option) => {
        option.selected = false;
      });
      [...excludedBranchIds.options].forEach((option) => {
        option.selected = false;
      });
    }
  }

  if (event.target === eligibilityType && eligibilityType.value !== 'selected_branches') {
    [...eligibleBranchIds.options].forEach((option) => {
      option.selected = false;
    });
  }

  if (event.target === originMerchantId) {
    [...eligibleBranchIds.options].forEach((option) => {
      if (option.dataset.merchantId !== originMerchantId.value) {
        option.selected = false;
      }
    });
  }

  if (event.target === originOutletId && originOutletId.value) {
    [...excludedBranchIds.options].forEach((option) => {
      if (option.dataset.outletId !== originOutletId.value) {
        option.selected = false;
      }
    });
  }

  updatePromotionScopeControls(form);
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
      setCatalogStatus(`Published draft #${draftId} as Promotion #${response.data.promotion.id}.`);
      return;
    }

    if (action === 'reopen') {
      await requestJson(`/api/admin/promotion-drafts/${encodeURIComponent(draftId)}/reopen`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      promotionDraftStatusFilter.value = 'pending_review';
      await refreshCatalog();
      setCatalogStatus(`Reopened draft #${draftId} for review.`);
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
