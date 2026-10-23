export type CategoryColor = 'orange' | 'lime' | 'blue' | 'yellow' | 'pink' | 'purple' | 'line';
export type CategorySeed = {
  name: string;
  emoji: string;
  color: CategoryColor;
  kind: 'spending' | 'income';
};

const s = (name: string, emoji: string, color: CategoryColor): CategorySeed => ({
  name,
  emoji,
  color,
  kind: 'spending',
});

export const SEED_CATEGORIES: readonly CategorySeed[] = [
  s('Groceries', '🛒', 'lime'),
  s('Dining out', '🍜', 'orange'),
  s('Coffee', '☕', 'orange'),
  s('Transport', '🚗', 'yellow'),
  s('Shopping', '🛍️', 'pink'),
  s('Bills & utilities', '💡', 'blue'),
  s('Entertainment', '🎬', 'purple'),
  s('Subscriptions', '📺', 'pink'),
  s('Health', '🏥', 'blue'),
  s('Home', '🏠', 'blue'),
  s('Insurance', '🛡️', 'blue'),
  s('Personal care', '💇', 'pink'),
  s('Education', '🎓', 'purple'),
  s('Travel', '✈️', 'yellow'),
  s('Gifts & donations', '🎁', 'pink'),
  s('Pets', '🐾', 'yellow'),
  s('Fees & interest', '🏦', 'purple'),
  s('Cash', '💵', 'lime'),
  s('Government & tax', '🏛️', 'purple'),
  s('Other spending', '📦', 'line'),
  { name: 'Income', emoji: '💰', color: 'lime', kind: 'income' },
];
