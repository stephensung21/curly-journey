import { slotOrder } from '../src/lib/slotOrder';

describe('slotOrder', () => {
  it('returns the new order when it covers the whole list', () => {
    expect(slotOrder([1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('refills only the slots the subset held, leaving the rest in place', () => {
    // 2 and 4 are hidden from the picker (e.g. they already have a limit).
    expect(slotOrder([1, 2, 3, 4, 5], [5, 3, 1])).toEqual([5, 2, 3, 4, 1]);
  });

  it('puts subset ids missing from the full list at the end', () => {
    expect(slotOrder([1, 2], [9, 2, 1])).toEqual([2, 1, 9]);
  });
});
