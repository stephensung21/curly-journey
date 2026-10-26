import { swipeTarget } from '../src/lib/tabSwipe';

it('a quick or long left swipe goes to the tab on the right, a right swipe to the left', () => {
  expect(swipeTarget('index', -140, -100)).toBe('/spending');
  expect(swipeTarget('spending', -70, -900)).toBe('/projections');
  expect(swipeTarget('spending', 140, 0)).toBe('/');
  expect(swipeTarget('more', 90, 600)).toBe('/projections');
});

it('ignores short slow drags and swipes past either end', () => {
  expect(swipeTarget('index', -40, -100)).toBeNull();
  expect(swipeTarget('index', 200, 900)).toBeNull();
  expect(swipeTarget('more', -200, -900)).toBeNull();
});
