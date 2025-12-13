export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const currencyNumberFormat = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });
export const percentageNumberFormat = new Intl.NumberFormat('en-SG', { style: 'percent', maximumFractionDigits: 2 });
