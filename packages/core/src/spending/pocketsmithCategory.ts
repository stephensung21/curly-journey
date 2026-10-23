const MAP: Record<string, string[]> = {
  Groceries: ['groceries', 'supermarket'],
  'Dining out': ['restaurants', 'dining', 'eating out', 'takeaway', 'fast food'],
  Coffee: ['coffee', 'cafe'],
  Transport: ['transport', 'fuel', 'petrol', 'public transport', 'parking', 'tolls', 'car'],
  Shopping: ['shopping', 'clothing', 'electronics', 'general merchandise'],
  'Bills & utilities': ['utilities', 'bills', 'electricity', 'gas', 'water', 'internet', 'phone', 'mobile phone'],
  Entertainment: ['entertainment', 'movies', 'music', 'games'],
  Subscriptions: ['subscriptions'],
  Health: ['health', 'medical', 'pharmacy', 'doctor'],
  Home: ['home', 'household', 'home improvement', 'furniture'],
  Insurance: ['insurance'],
  'Personal care': ['personal care', 'hair', 'beauty', 'fitness', 'gym'],
  Education: ['education'],
  Travel: ['travel', 'holidays', 'accommodation', 'flights'],
  'Gifts & donations': ['gifts', 'donations', 'charity'],
  Pets: ['pets'],
  'Fees & interest': ['fees', 'bank fees', 'interest'],
  Cash: ['cash', 'atm'],
  'Government & tax': ['tax', 'government'],
  // Not 'refunds': a refund reduces its spending category (spec 9.5).
  Income: ['salary', 'income', 'wages', 'interest income'],
};

const LOOKUP = new Map<string, string>(
  Object.entries(MAP).flatMap(([category, titles]) => titles.map((t) => [t, category] as const)),
);

export function mapPocketSmithCategory(title: string | null): string | null {
  if (!title) return null;
  return LOOKUP.get(title.trim().toLowerCase()) ?? null;
}

export function institutionGroup(institution: string): string {
  if (/commonwealth|commbank|\bcba\b/i.test(institution)) return 'CommBank';
  if (/american express|amex/i.test(institution)) return 'Amex';
  if (/^up\b|up bank/i.test(institution)) return 'Up';
  return institution;
}
