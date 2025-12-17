export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const currencyNumberFormat = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });
export const percentageNumberFormat = new Intl.NumberFormat('en-SG', { style: 'percent', maximumFractionDigits: 2 });
export const dateFormat = new Intl.DateTimeFormat('en-SG', {
  hour12: false,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
