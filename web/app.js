const form = document.getElementById('recommendation-form');
const results = document.getElementById('results');
const dateInput = document.getElementById('date');
const merchantSelect = document.getElementById('merchant');

dateInput.value = new Date().toISOString().slice(0, 10);

async function fetchRecommendations(payload) {
  try {
    const params = new URLSearchParams({
      merchant_name: payload.merchantName,
      amount: String(payload.amount),
      date: payload.date
    });

    const response = await fetch(`http://localhost:4000/api/recommendations?${params.toString()}`);
    if (!response.ok) {
      throw new Error('backend not available');
    }

    const json = await response.json();
    return json.data || [];
  } catch (error) {
    return [
      { paymentMethod: 'LINE Pay', cashbackRate: 0.03, estimatedCashback: payload.amount * 0.03, promotionNote: 'Fallback demo result' },
      { paymentMethod: 'VISA', cashbackRate: 0.02, estimatedCashback: payload.amount * 0.02, promotionNote: 'Fallback demo result' }
    ].filter((item) => item.paymentMethod);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const merchantName = merchantSelect.value;
  const amount = Number(document.getElementById('amount').value);
  const date = document.getElementById('date').value;

  results.innerHTML = '<p>Loading recommendations...</p>';
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
});
