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

async function fetchMerchants() {
  const response = await fetch(`${apiBaseUrl}/api/admin/merchants`);
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
      ? merchants.map((merchant) => `<option value="${merchant}">${merchant}</option>`).join('')
      : '<option value="">No merchants available</option>';

    if (merchants.includes(DEFAULT_OPTIONS.merchantName)) {
      merchantSelect.value = DEFAULT_OPTIONS.merchantName;
    }
  } catch (error) {
    merchantSelect.innerHTML = `<option value="${DEFAULT_OPTIONS.merchantName}">${DEFAULT_OPTIONS.merchantName}</option>`;
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
