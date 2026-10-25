
export const CURRENCIES = ['USD', 'EUR', 'GEL', 'GBP', 'CHF', 'JPY'] as const;
export const CURRENCY_SYMBOLS = ['$', '€', '₾', '£', 'CHF', '¥'] as const;

export const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GEL: '₾',
  GBP: '£',
  CHF: 'CHF',
  JPY: '¥',
};

export const IBAN_POOL = [
  'GE29NB0000000101904917',
  'GE84BG0000000582910482',
  'DE89370400440532013000',
  'GB29NWBK60161331926819',
  'FR7630006000011234567890189',
  'NL91ABNA0417164300',
  'CH9300762011623852957',
] as const;

export const BIC_SWIFT_POOL = [
  'CHASUS33',
  'BAGAGE22',
  'NBRBGE22',
  'COBADEFF',
  'NWBKGB2L',
  'BNPAFRPP',
  'ABNANL2A',
  'UBSWCHZH',
] as const;

export const ACCOUNT_NAMES = [
  'Main Checking Account',
  'Multi-Currency Savings',
  'Business Reserve Account',
  'Treasury Operations Account',
  'Premier Wealth Deposit',
  'Digital Card Settlement',
  'International Escrow Account',
  'High-Yield Reserve Vault',
] as const;

export const CARD_NAMES = [
  'Visa Platinum Digital',
  'Mastercard Gold',
  'Concept Black Elite',
  'Visa Infinite Metal',
  'Mastercard World Elite',
  'Virtual Shopping Card',
] as const;

export const CARD_NUMBERS = [
  '4532 •••• •••• 8891',
  '5412 •••• •••• 3409',
  '4916 •••• •••• 7721',
  '4024 •••• •••• 1904',
  '5289 •••• •••• 6138',
  '4716 •••• •••• 9245',
] as const;

export const EXPIRY_DATES = [
  '08/28',
  '11/29',
  '04/30',
  '09/28',
  '02/31',
  '12/29',
] as const;

export const CVV_CODES = ['842', '391', '519', '704', '268', '915'] as const;

export const CATEGORY_NAMES = [
  'Utilities & Telecom',
  'Shopping & Retail',
  'Food & Dining',
  'Transfers & Savings',
  'Travel & Airlines',
  'Healthcare & Pharmacy',
  'Entertainment & Media',
  'Education & Courses',
] as const;

export const SERVICE_NAMES = [
  'City Power & Electric',
  'Fiber Internet & TV',
  'Water & Sanitation',
  'Mobile Communications',
  'Municipal Parking & Transit',
  'Natural Gas Distribution',
  'Cloud Hosting & Domains',
  'Property Insurance Plan',
] as const;

export const LOAN_PURPOSES = [
  'Home Renovation',
  'Vehicle Purchase',
  'Consumer Express',
  'Education & Tuition',
  'Solar Energy Installation',
  'Small Business Expansion',
  'Medical Equipment',
  'Mortgage Refinancing',
] as const;

export const LOAN_STATUS_NAMES = ['Pending', 'Approved', 'Declined'] as const;

export const MERCHANT_NAMES = [
  'Apple Store Online',
  'Amazon Web Services',
  'Spotify AB',
  'Carrefour Hypermarket',
  'Bolt Mobility',
  'Airbnb Payments UK',
  'Wolt Delivery',
  'Booking.com BV',
  'GitHub Enterprise',
  'Netflix International',
] as const;

export const TRANSACTION_DESCRIPTIONS = [
  'Software Subscription — JetBrains IDE Tooling',
  'Monthly Cloud Infrastructure & CDN Subscription',
  'POS Purchase — Apple Store Fifth Avenue',
  'International Wire Transfer — Invoice #INV-2049',
  'Utility Bill Settlement — City Power & Electric',
  'Salary & Performance Bonus Direct Deposit',
  'Contactless Payment — Carrefour Market',
  'Flight Reservation — Lufthansa Airlines',
] as const;

export function buildCardSvgDataUri(itemIndex: number): string {
  const palettes = [
    ['#0F172A', '#1D4ED8', 'VISA PLATINUM', '4532 •••• •••• 8891', 'JOHN DOE', '08/28'],
    ['#064E3B', '#059669', 'MASTERCARD GOLD', '5412 •••• •••• 3409', 'ELENA ROSTOVA', '11/29'],
    ['#1E1B4B', '#7C3AED', 'CONCEPT BLACK', '4916 •••• •••• 7721', 'MARCUS VANCE', '04/30'],
    ['#18181B', '#3F3F46', 'VISA INFINITE METAL', '4024 •••• •••• 1904', 'SOPHIA CHEN', '09/28'],
    ['#31102F', '#BE185D', 'WORLD ELITE', '5289 •••• •••• 6138', 'LIAM O CONNOR', '02/31'],
    ['#0C4A6E', '#0284C7', 'VIRTUAL DIGITAL', '4716 •••• •••• 9245', 'NINO BERIDZE', '12/29'],
  ] as const;
  const [c1, c2, label, pan, holder, exp] = palettes[itemIndex % palettes.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="360" height="220" rx="16" fill="url(#g)"/><circle cx="310" cy="40" r="60" fill="#FFFFFF" opacity="0.06"/><rect x="28" y="68" width="44" height="32" rx="6" fill="#FBBF24" opacity="0.9"/><text x="28" y="40" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="1.5">${label}</text><text x="28" y="148" fill="#FFFFFF" font-family="monospace" font-size="19" letter-spacing="2">${pan}</text><text x="28" y="188" fill="#E2E8F0" font-family="sans-serif" font-size="12" letter-spacing="1">${holder}</text><text x="280" y="188" fill="#E2E8F0" font-family="sans-serif" font-size="12">${exp}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}
