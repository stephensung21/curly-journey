import { wobblePath } from '../src/components/doodles/wobble';

it('wobblePath is deterministic per seed', () =>
  expect(wobblePath(150, { seed: 7 })).toBe(wobblePath(150, { seed: 7 })));

it('wobblePath differs across seeds', () =>
  expect(wobblePath(150, { seed: 1 })).not.toBe(wobblePath(150, { seed: 2 })));

it('wobblePath stays in bounds', () => {
  const nums = wobblePath(150, { seed: 3, amplitude: 3 }).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  ys.forEach(y => expect(Math.abs(y - 7)).toBeLessThanOrEqual(3));
  expect(nums[0]).toBe(3);
  expect(nums[nums.length - 2]).toBe(147);
});
