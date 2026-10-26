import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderScreen } from '../test-utils/renderScreen';
import CommsecScreen from '../app/commsec';
import CommsecImport from '../app/commsec-import';
import AccountDetail from '../app/account/[id]';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-24T02:00:00Z') })); // Sat 24 Oct
jest.mock('../src/api/hooks');

let mockText = '';
// Raw bytes when a test needs a non-UTF-8 file; otherwise the bytes of mockText.
let mockBytes: Uint8Array | null = null;
jest.mock('expo-file-system', () => ({
  File: class {
    text() {
      return Promise.resolve(mockText);
    }
    bytes() {
      return Promise.resolve(mockBytes ?? new TextEncoder().encode(mockText));
    }
  },
}));
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));

const mocked = hooks as jest.Mocked<typeof hooks>;
const holding = (symbol: string, units: number, valueCents: number, costCents: number) => ({
  symbol, units, costCents, closeMicros: 1, priceDate: '2026-10-23', valueCents,
  avgCostMicros: Math.round((costCents / units) * 10000), gainCents: valueCents - costCents,
  gainBps: Math.round(((valueCents - costCents) / costCents) * 10000),
});
const trade = (id: number, date: string, side: 'buy' | 'sell', symbol: string, units: number) => ({
  id, source: 'csv' as const, date, reference: null, side, symbol, units, priceMicros: 70_800_000, brokerageCents: 1000, totalCents: 213400,
});
const data = {
  accountId: 9, valueCents: 8_490_000, costCents: 7_366_000, gainCents: 1_124_000, gainBps: 1526, priceDate: '2026-10-23', missingPrices: [] as string[],
  holdings: [holding('VDHG', 620, 4_415_000, 3_850_000), holding('VGS', 176, 2_377_000, 2_084_000), holding('VAS', 163, 1_698_000, 1_432_000)],
  trades: [trade(2, '2026-10-15', 'buy', 'VGS', 12), trade(1, '2026-10-01', 'buy', 'VDHG', 30)],
};
const dismiss = jest.fn();
const del = jest.fn();
const add = jest.fn();
let commsec: object;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  commsec = data;
  useSettings.setState({ hideBalances: false });
  dismiss.mockResolvedValue(undefined);
  del.mockResolvedValue(undefined);
  add.mockResolvedValue({ trade: {} });
  (mocked.useCommsec as jest.Mock).mockImplementation(() => ({ data: commsec, isLoading: false }));
  (mocked.useDismissHint as jest.Mock).mockReturnValue({ mutateAsync: dismiss, isPending: false });
  (mocked.useDeleteTrade as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
  (mocked.useAddTrade as jest.Mock).mockReturnValue({ mutateAsync: add, isPending: false });
});

describe('commsec screen', () => {
  it('shows total, gain note, holdings and the allocation bar', async () => {
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('$84,900')).toBeTruthy();
    expect(screen.getByText(/on what you paid/)).toBeTruthy();
    expect(screen.getByText('VDHG')).toBeTruthy();
    expect(screen.getByText(/620 units/)).toBeTruthy();
    expect(screen.getByLabelText('Allocation VDHG')).toBeTruthy();
    expect(screen.getByLabelText('Allocation VGS')).toBeTruthy();
    expect(screen.getByLabelText('Allocation VAS')).toBeTruthy();
    expect(screen.getByText('VDHG 52%')).toBeTruthy();
    expect(screen.getByText('Buy VGS')).toBeTruthy();
  });

  it('always says which day the prices are from', async () => {
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('Prices from 23 Oct')).toBeTruthy();
  });

  it('says the prices are old when they are from before the last weekday', async () => {
    commsec = { ...data, priceDate: '2026-10-21' };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('Prices from 21 Oct (not updated since)')).toBeTruthy();
  });

  it('names ETFs past the 10 that get daily prices', async () => {
    commsec = { ...data, notUpdated: ['VTS', 'VEU'] };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('Prices update for 10 ETFs a day. Not updated: VTS, VEU.')).toBeTruthy();
  });

  it('lists symbols with no price and says they are valued at cost', async () => {
    commsec = { ...data, missingPrices: ['VAS', 'VGS'] };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('No price yet for VAS, VGS — valued at what you paid.')).toBeTruthy();
  });

  it('shows no missing-price line when every holding has a price', async () => {
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText(/No price yet/)).toBeNull();
  });

  it('hide balances masks dollars and units', async () => {
    useSettings.setState({ hideBalances: true });
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText('$84,900.00')).toBeNull();
    expect(screen.queryByText(/620/)).toBeNull();
    expect(screen.queryAllByText(/\d,\d{3}|\d\.\d\d|\d{3} units/)).toHaveLength(0);
  });

  it('buttons go to import and open the trade sheet', async () => {
    await renderScreen(<CommsecScreen />);
    await fireEvent.press(screen.getByText('Import CSV'));
    expect(mockPush).toHaveBeenCalledWith('/commsec-import');
    await fireEvent.press(screen.getByText('Add trade'));
    expect(await screen.findByText('Save trade')).toBeTruthy();
  });

  it('empty state offers both buttons', async () => {
    commsec = { accountId: null, valueCents: 0, costCents: 0, gainCents: 0, gainBps: 0, priceDate: null, holdings: [], trades: [] };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('No trades yet')).toBeTruthy();
    expect(screen.getByText('Import CSV')).toBeTruthy();
    expect(screen.getByText('Add trade')).toBeTruthy();
  });

  it('long-press confirms then deletes a trade', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen(<CommsecScreen />);
    await fireEvent(screen.getByText('Buy VGS'), 'longPress');
    expect(alert).toHaveBeenCalledWith('Delete this trade?', undefined, expect.any(Array));
    const buttons = alert.mock.calls[0]![2]!;
    await buttons.find(b => b.text === 'Delete')!.onPress!();
    expect(del).toHaveBeenCalledWith(2);
    alert.mockRestore();
  });

  it('hint banner: Not a trade dismisses and clears the param', async () => {
    mockParams = { hint: '55' };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('Looks like you bought something on CommSec.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not a trade'));
    expect(dismiss).toHaveBeenCalledWith(55);
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ hint: undefined }));
  });

  it('hint banner also offers Import CSV and Add trade', async () => {
    mockParams = { hint: '55' };
    await renderScreen(<CommsecScreen />);
    const banner = screen.getAllByText('Import CSV');
    expect(banner).toHaveLength(2); // banner + the page buttons
    expect(screen.getAllByText('Add trade')).toHaveLength(2);
    await fireEvent.press(banner[0]!);
    expect(mockPush).toHaveBeenCalledWith('/commsec-import');
    await fireEvent.press(screen.getAllByText('Add trade')[0]!);
    expect(await screen.findByText('Save trade')).toBeTruthy();
  });

  it('adding the trade the hint is about clears the banner', async () => {
    mockParams = { hint: '55' };
    await renderScreen(<CommsecScreen />);
    await fireEvent.press(screen.getAllByText('Add trade')[0]!);
    await fireEvent.changeText(screen.getByLabelText('Symbol'), 'vgs');
    await fireEvent.changeText(screen.getByLabelText('Units'), '12');
    await fireEvent.changeText(screen.getByLabelText('Price per unit'), '134.90');
    await fireEvent.press(screen.getByText('Save trade'));
    // The server stops hinting once a trade sits near the payment, so this only clears the banner.
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ hint: undefined }));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('links to the account settings', async () => {
    await renderScreen(<CommsecScreen />);
    await fireEvent.press(screen.getByLabelText('Account settings'));
    expect(mockPush).toHaveBeenCalledWith('/account/9/settings');
  });

  it('shows dollar values without cents, unit prices with cents', async () => {
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('$44,150')).toBeTruthy(); // VDHG value
    expect(screen.getAllByText('$2,134')).toHaveLength(2); // both trade totals
    expect(screen.getAllByText('$70.80')).toHaveLength(2); // unit prices keep cents
  });

  it('shows dividends: last 12 months, yield on cost, this financial year and the payments', async () => {
    commsec = {
      ...data,
      dividends: {
        last12Cents: 41_200, fyCents: 12_000, yieldBps: 56,
        payments: [
          { transactionId: 31, date: '2026-10-15', amountCents: 12_000, symbol: 'VGS' },
          { transactionId: 30, date: '2026-04-16', amountCents: 29_200, symbol: null },
        ],
      },
    };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText('Dividends')).toBeTruthy();
    expect(screen.getByText('$412 in the last 12 months · 0.6% on what you paid')).toBeTruthy();
    expect(screen.getByText('$120 since 1 July')).toBeTruthy();
    expect(screen.getByText('VGS · 15 Oct')).toBeTruthy();
    expect(screen.getByText('Dividend · 16 Apr')).toBeTruthy();
    await fireEvent.press(screen.getByText('VGS · 15 Oct'));
    expect(mockPush).toHaveBeenCalledWith('/transaction/31');
  });

  it('dividend dollars hide with hide balances', async () => {
    useSettings.setState({ hideBalances: true });
    commsec = { ...data, dividends: { last12Cents: 41_200, fyCents: 12_000, yieldBps: 56, payments: [] } };
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText(/\$412/)).toBeNull();
  });

  it('explains how dividends are found when there are none yet', async () => {
    commsec = { ...data, dividends: { last12Cents: 0, fyCents: 0, yieldBps: 0, payments: [] } };
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText(/No dividends found in the last 12 months/)).toBeTruthy();
  });

  it('shows no banner for a non-numeric hint', async () => {
    mockParams = { hint: 'abc' };
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText('Not a trade')).toBeNull();
  });

  it('shows a load error, not the empty state', async () => {
    (mocked.useCommsec as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: false, isError: true, refetch: jest.fn() }));
    await renderScreen(<CommsecScreen />);
    expect(screen.getByText("Couldn't load CommSec. Pull to try again.")).toBeTruthy();
    expect(screen.queryByText('No trades yet')).toBeNull();
  });

  it('shows no empty state while loading', async () => {
    (mocked.useCommsec as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() }));
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText('No trades yet')).toBeNull();
  });

  it('shows an inline error when delete fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    del.mockRejectedValueOnce(new Error('x'));
    await renderScreen(<CommsecScreen />);
    await fireEvent(screen.getByText('Buy VGS'), 'longPress');
    await alert.mock.calls[0]![2]!.find(b => b.text === 'Delete')!.onPress!();
    expect(await screen.findByText("Couldn't delete that trade. Try again.")).toBeTruthy();
    alert.mockRestore();
  });

  it('no hint banner without the param', async () => {
    await renderScreen(<CommsecScreen />);
    expect(screen.queryByText('Not a trade')).toBeNull();
  });
});

describe('TradeSheet', () => {
  async function open() {
    await renderScreen(<CommsecScreen />);
    await fireEvent.press(screen.getByText('Add trade'));
    await screen.findByText('Save trade');
  }
  async function fill(units: string) {
    await fireEvent.changeText(screen.getByLabelText('Symbol'), 'vgs');
    await fireEvent.changeText(screen.getByLabelText('Units'), units);
    await fireEvent.changeText(screen.getByLabelText('Price per unit'), '134.90');
  }

  it('rejects 1.5 units', async () => {
    await open();
    await fill('1.5');
    await fireEvent.press(screen.getByText('Save trade'));
    expect(screen.getByText('Units must be a whole number')).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it('saves an upper-cased buy with default brokerage 0', async () => {
    await open();
    await fill('12');
    await fireEvent.press(screen.getByText('Save trade'));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({ date: '2026-10-24', side: 'buy', symbol: 'VGS', units: 12, price: '134.90', brokerage: '0' }),
    );
  });

  it('shows a save error inline', async () => {
    add.mockRejectedValueOnce(new Error('x'));
    await open();
    await fill('12');
    await fireEvent.press(screen.getByText('Save trade'));
    expect(await screen.findByText("Couldn't save the trade. Try again.")).toBeTruthy();
  });
});

describe('import flow', () => {
  const t = (d: string, sym: string) => trade(0, d, 'buy', sym, 12);
  const preview = {
    new: [t('2026-10-15', 'VGS'), t('2026-10-01', 'VDHG')],
    have: [t('2026-09-03', 'VDHG')],
    replacing: 0,
    skipped: [{ line: 9, reason: 'bad date' }],
    ignored: 2,
  };
  const previewM = jest.fn();
  const importM = jest.fn();
  beforeEach(() => {
    mockText = 'csv-text';
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.csv', size: 10 }] });
    previewM.mockResolvedValue(preview);
    importM.mockResolvedValue({ imported: 2 });
    (mocked.useCommsecPreview as jest.Mock).mockReturnValue({ mutateAsync: previewM });
    (mocked.useCommsecImport as jest.Mock).mockReturnValue({ mutateAsync: importM });
  });

  it('reads a UTF-16 file (as Excel saves "Unicode text") as text', async () => {
    const text = 'Date,Reference';
    mockBytes = new Uint8Array([0xff, 0xfe, ...[...text].flatMap(ch => [ch.charCodeAt(0), 0])]);
    await renderScreen(<CommsecImport />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    await screen.findByText('Import 2 trades');
    expect(previewM).toHaveBeenCalledWith('Date,Reference');
    mockBytes = null;
  });

  it('walks pick, check, done', async () => {
    await renderScreen(<CommsecImport />);
    expect(screen.getByLabelText('Step 1 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Import 2 trades')).toBeTruthy();
    expect(previewM).toHaveBeenCalledWith('csv-text');
    expect(screen.getByLabelText('New: 2')).toBeTruthy();
    expect(screen.getByLabelText('Already have: 1')).toBeTruthy();
    expect(screen.getByLabelText('Skipped: 1')).toBeTruthy();
    expect(screen.getAllByText('NEW')).toHaveLength(2);
    expect(screen.getByText('HAVE IT')).toBeTruthy();
    expect(screen.getByText('Line 9: bad date')).toBeTruthy();
    await fireEvent.press(screen.getByText('Import 2 trades'));
    expect(importM).toHaveBeenCalledWith('csv-text');
    expect(await screen.findByText('Imported 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back to CommSec'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('disables import at zero new and zero replacing', async () => {
    previewM.mockResolvedValue({ ...preview, new: [] });
    await renderScreen(<CommsecImport />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    await screen.findByLabelText('New: 0');
    await fireEvent.press(screen.getByText('Import 0 trades'));
    expect(importM).not.toHaveBeenCalled();
  });

  it('shows the replacing line and Update label', async () => {
    previewM.mockResolvedValue({ ...preview, new: [], replacing: 2 });
    await renderScreen(<CommsecImport />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Replaces 2 you added by hand')).toBeTruthy();
    await fireEvent.press(screen.getByText('Update 2 trades'));
    expect(importM).toHaveBeenCalledWith('csv-text');
  });

  it('keeps Import N label with replacing', async () => {
    previewM.mockResolvedValue({ ...preview, replacing: 1 });
    await renderScreen(<CommsecImport />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Import 2 trades')).toBeTruthy();
    expect(screen.getByText('Replaces 1 you added by hand')).toBeTruthy();
  });
});

describe('account redirect', () => {
  it('sends a CommSec account to /commsec', async () => {
    mockParams = { id: '9' };
    (mocked.useAccounts as jest.Mock).mockReturnValue({
      data: { accounts: [{ id: 9, source: 'commsec', kind: 'brokerage', institution: 'CommSec', name: 'CommSec' }], lastSuccessAt: null },
    });
    await renderScreen(<AccountDetail />);
    expect(screen.getByText('redirect:/commsec')).toBeTruthy();
  });
});
