export type TabName = "index" | "spending" | "projections" | "more";

const ORDER: TabName[] = ["index", "spending", "projections", "more"];
const HREF: Record<TabName, "/" | "/spending" | "/projections" | "/more"> = {
  index: "/",
  spending: "/spending",
  projections: "/projections",
  more: "/more",
};
/** A swipe counts when it travels far, or is quick and travels a little. */
const FAR = 120;
const NEAR = 60;
const QUICK = 500;

/** Where a finished horizontal swipe on a tab goes: left swipe to the next tab, right swipe to the previous. */
export function swipeTarget(
  tab: TabName,
  dx: number,
  vx: number,
): (typeof HREF)[TabName] | null {
  const counts =
    Math.abs(dx) >= FAR || (Math.abs(dx) >= NEAR && Math.abs(vx) >= QUICK);
  if (!counts) return null;
  const next = ORDER.indexOf(tab) + (dx < 0 ? 1 : -1);
  const to = ORDER[next];
  return to ? HREF[to] : null;
}
