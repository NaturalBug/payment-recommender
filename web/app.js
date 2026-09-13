const form = document.getElementById('recommendation-form');
const results = document.getElementById('results');
const dateInput = document.getElementById('date');
const merchantSelect = document.getElementById('merchant');
const apiBaseUrl = `http://${window.location.hostname}:4000`;

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
  try {
    const merchants = await fetchMerchants();
    merchantSelect.innerHTML = merchants.length
      ? merchants.map((merchant) => `<option value="${escapeHtml(merchant.name)}">${escapeHtml(merchant.name)}</option>`).join('')
      : '<option value="">No merchants available</option>';

    if (merchants.some((merchant) => merchant.name === DEFAULT_OPTIONS.merchantName)) {
      merchantSelect.value = DEFAULT_OPTIONS.merchantName;
    }
  } catch (error) {
    merchantSelect.innerHTML = `<option value="${escapeHtml(DEFAULT_OPTIONS.merchantName)}">${escapeHtml(DEFAULT_OPTIONS.merchantName)}</option>`;
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

populateMerchantOptions();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantName = merchantSelect.value;
  const amount = Number(document.getElementById('amount').value);
  const date = dateInput.value;

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
          <h3>${escapeHtml(item.paymentMethod)}</h3>
          <p>Cashback rate: ${(item.cashbackRate * 100).toFixed(2)}%</p>
          <p>Estimated cashback: NT$ ${Number(item.estimatedCashback).toFixed(2)}</p>
          <p>${escapeHtml(item.promotionNote || 'No promotion note')}</p>
        </article>
      `)
      .join('');
  } catch (error) {
    results.innerHTML = '<p>Backend is not available right now. Please start the API server first.</p>';
  }
});
