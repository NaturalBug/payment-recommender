const rewards = [
  { merchantName: 'FamilyMart', paymentMethod: 'LINE Pay', cashbackRate: 0.03, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '3% cashback at FamilyMart' },
  { merchantName: 'FamilyMart', paymentMethod: 'VISA', cashbackRate: 0.02, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2% cashback at FamilyMart' },
  { merchantName: '7-ELEVEN', paymentMethod: 'LINE Pay', cashbackRate: 0.025, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2.5% at 7-ELEVEN' },
  { merchantName: 'Starbucks', paymentMethod: 'AMEX Gold', cashbackRate: 0.04, amountThreshold: 100, validityStart: '2026-08-01', validityEnd: '2026-08-31', promotionNote: '4% August coffee promotion' },
  { merchantName: 'Starbucks', paymentMethod: 'VISA', cashbackRate: 0.015, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.5% standard cashback' }
];

const form = document.getElementById('recommendation-form');
const results = document.getElementById('results');
const dateInput = document.getElementById('date');

dateInput.value = new Date().toISOString().slice(0, 10);

function recommend({ merchantName, amount, date }) {
  const purchaseDate = new Date(date);

  return rewards
    .filter((rule) => {
      const start = new Date(rule.validityStart);
      const end = new Date(rule.validityEnd);
      return (
        rule.merchantName.toLowerCase() === merchantName.toLowerCase() &&
        purchaseDate >= start &&
        purchaseDate <= end &&
        amount >= rule.amountThreshold
      );
    })
    .map((rule) => ({
      paymentMethod: rule.paymentMethod,
      cashbackRate: rule.cashbackRate,
      estimatedCashback: Number((amount * rule.cashbackRate).toFixed(2)),
      promotionNote: rule.promotionNote
    }))
    .sort((a, b) => b.cashbackRate - a.cashbackRate);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const merchantName = document.getElementById('merchant').value;
  const amount = Number(document.getElementById('amount').value);
  const date = document.getElementById('date').value;

  const recommendations = recommend({ merchantName, amount, date });

  if (!recommendations.length) {
    results.innerHTML = '<p>No valid payment rewards found for this merchant/date.</p>';
    return;
  }

  results.innerHTML = recommendations
    .map((item) => `
      <article class="result-item">
        <h3>${item.paymentMethod}</h3>
        <p>Cashback rate: ${(item.cashbackRate * 100).toFixed(2)}%</p>
        <p>Estimated cashback: NT$ ${item.estimatedCashback}</p>
        <p>${item.promotionNote}</p>
      </article>
    `)
    .join('');
});
