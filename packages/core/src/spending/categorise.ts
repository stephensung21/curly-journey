import type { Cents } from '../money';
import { merchantCategory } from './merchant';
import { mapPocketSmithCategory } from './pocketsmithCategory';

export type Flow = 'normal' | 'transfer' | 'mortgage' | 'not_spending';
export type CategorySource = 'rule' | 'learned' | 'past' | 'merchant' | 'pocketsmith' | 'default' | 'user';
export type Rule = {
  id: number;
  origin: 'user' | 'learned';
  matchText: string;
  accountId: number | null;
  amountCents: number | null;
  categoryId: number | null;
  flow: Flow | null;
  createdAt: string;
};
export type CategoriseInput = {
  accountId: number;
  amountCents: Cents;
  description: string;
  merchant: string;
  psCategory: string | null;
  isCreditCard: boolean;
};
export type CategoriseContext = {
  rules: Rule[];
  /** merchant -> categoryId of the latest user-set row */
  pastByMerchant: Map<string, number>;
  categoryIdByName: Map<string, number>;
};
export type CategoriseResult = {
  categoryId: number | null;
  source: Exclude<CategorySource, 'user'> | null;
  flow: Flow | null;
  ruleId: number | null;
};

export function ruleMatches(rule: Rule, t: CategoriseInput): boolean {
  const needle = rule.matchText.toUpperCase();
  return (
    (t.description.toUpperCase().includes(needle) || t.merchant.toUpperCase().includes(needle)) &&
    (rule.accountId === null || rule.accountId === t.accountId) &&
    (rule.amountCents === null || rule.amountCents === t.amountCents)
  );
}

/** Ordered copies of each rules list seen, so a pipeline run sorts its rules once rather than once per row. */
const ordered = new WeakMap<Rule[], Rule[]>();

/** user before learned, then newest first (higher id breaks ties). Treat a rules list as immutable once passed in. */
function orderRules(rules: Rule[]): Rule[] {
  let out = ordered.get(rules);
  if (!out) {
    out = [...rules].sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === 'user' ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return b.id - a.id;
    });
    ordered.set(rules, out);
  }
  return out;
}

/** The only income-kind category the merchant list and the PocketSmith map can name. */
const INCOME = 'Income';

export function categorise(t: CategoriseInput, ctx: CategoriseContext): CategoriseResult {
  const matched = orderRules(ctx.rules).filter((r) => ruleMatches(r, t));
  const first = matched[0];
  // Like the category: the first matching rule that sets a flow, so a newer category-only rule can't hide it.
  const flow = matched.find((r) => r.flow !== null)?.flow ?? null;
  const ruleId = first?.id ?? null;
  const done = (categoryId: number | null, source: CategoriseResult['source']): CategoriseResult => ({
    categoryId,
    source: categoryId === null ? null : source,
    flow,
    ruleId,
  });

  const byRule = matched.find((r) => r.categoryId !== null);
  if (byRule) return done(byRule.categoryId, byRule.origin === 'user' ? 'rule' : 'learned');

  const past = ctx.pastByMerchant.get(t.merchant);
  if (past !== undefined) return done(past, 'past');

  // A credit on a credit card is a refund or a payment, never income: it falls through instead (spec 9.5).
  const cardCredit = t.isCreditCard && t.amountCents > 0;
  const fromName = (name: string | null) =>
    name === null || (cardCredit && name === INCOME) ? undefined : ctx.categoryIdByName.get(name);

  const merchantId = fromName(merchantCategory(t.merchant));
  if (merchantId !== undefined) return done(merchantId, 'merchant');

  const psId = fromName(mapPocketSmithCategory(t.psCategory));
  if (psId !== undefined) return done(psId, 'pocketsmith');

  if (t.amountCents > 0 && !t.isCreditCard) {
    const income = ctx.categoryIdByName.get(INCOME);
    if (income !== undefined) return done(income, 'default');
  }
  return done(null, null);
}
