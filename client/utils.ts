export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const SG_LOCALE = 'en-SG';
export const currencyNumberFormat = new Intl.NumberFormat(SG_LOCALE, { style: 'currency', currency: 'SGD' });
export const percentageNumberFormat = new Intl.NumberFormat(SG_LOCALE, { style: 'percent', maximumFractionDigits: 2 });
export const dateFormat = new Intl.DateTimeFormat(SG_LOCALE, {
  hour12: false,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const monthDayFormat = new Intl.DateTimeFormat(SG_LOCALE, {
  day: '2-digit',
  month: 'short',
});

export const coordinateFormat = new Intl.NumberFormat(SG_LOCALE, {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
  useGrouping: false,
});

export const SG_CENTER = { lat: 1.3521, lng: 103.8198 };
