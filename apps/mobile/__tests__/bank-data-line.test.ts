import { bankCheckedLine, bankDataLine } from '../src/lib/bankDataLine';

// 25 Oct 2026, 6:30pm in Sydney (AEDT, UTC+11).
const now = new Date('2026-10-25T07:30:00Z');

describe('bankDataLine', () => {
  it('fits one line: the time if today, else yesterday or the date, in Sydney time', () => {
    expect(
      bankDataLine(
        [
          { institution: 'CommBank (Commonwealth Bank)', at: '2026-10-24T20:41:00Z' }, // 7:41am today
          { institution: 'American Express', at: '2026-10-24T10:02:00Z' }, // 9:02pm yesterday
          { institution: 'Up', at: '2026-10-20T04:10:00Z' }, // 3:10pm Tue 20 Oct
        ],
        now,
      ),
    ).toBe('Bank data: CommBank 7:41am · Amex yesterday · Up 20 Oct');
  });

  it('is null with no bank data yet', () => {
    expect(bankDataLine([], now)).toBeNull();
  });
});

describe('bankCheckedLine', () => {
  it('names each bank with when PocketSmith last updated its accounts, skipping banks it never said', () => {
    expect(
      bankCheckedLine(
        [
          { institution: 'CommBank (Commonwealth Bank)', at: '2026-10-24T20:41:00Z', checkedAt: '2026-10-25T05:15:00Z' }, // 4:15pm today
          { institution: 'American Express', at: '2026-10-24T10:02:00Z', checkedAt: null },
          { institution: 'Up', at: '2026-10-20T04:10:00Z' },
        ],
        now,
      ),
    ).toBe('Checked by PocketSmith: CommBank today 4:15pm');
  });

  it('is null when no bank has a check time', () => {
    expect(bankCheckedLine([{ institution: 'Up', at: '2026-10-20T04:10:00Z', checkedAt: null }], now)).toBeNull();
  });
});
