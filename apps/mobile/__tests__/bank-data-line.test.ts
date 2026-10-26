import { bankDataLine } from '../src/lib/bankDataLine';

// 25 Oct 2026, 6:30pm in Sydney (AEDT, UTC+11).
const now = new Date('2026-10-25T07:30:00Z');

describe('bankDataLine', () => {
  it('names each bank with when PocketSmith last got its data, in Sydney time', () => {
    expect(
      bankDataLine(
        [
          { institution: 'CommBank (Commonwealth Bank)', at: '2026-10-24T20:41:00Z' }, // 7:41am today
          { institution: 'American Express', at: '2026-10-24T10:02:00Z' }, // 9:02pm yesterday
          { institution: 'Up', at: '2026-10-20T04:10:00Z' }, // 3:10pm Tue 20 Oct
        ],
        now,
      ),
    ).toBe('Bank data: CommBank today 7:41am · Amex yesterday 9:02pm · Up Tue 20 Oct 3:10pm');
  });

  it('is null with no bank data yet', () => {
    expect(bankDataLine([], now)).toBeNull();
  });
});
