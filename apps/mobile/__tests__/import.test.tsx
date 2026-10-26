import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import ImportScreen from '../app/import';
import * as hooks from '../src/api/hooks';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
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
const base = {
  source: 'pocketsmith', displayName: null, kind: 'transaction', balanceCents: 1, balanceDate: null,
  countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false,
};
const accounts = [
  { ...base, id: 1, institution: 'CommBank', name: 'Everyday' },
  { ...base, id: 2, institution: 'Amex', name: 'Gold' },
  { ...base, id: 3, source: 'manual', institution: 'Manual', name: 'House' },
];
const row = (d: string) => ({ date: '2026-10-01', amountCents: -1234, description: d });
const preview = {
  new: [row('Coffee'), row('Lunch'), row('Bus')],
  duplicates: [row('Rent')],
  skipped: [{ line: 9, reason: 'bad date' }],
};
const previewMutateAsync = jest.fn();
const commitMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockText = 'a,b\n1,2';
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.csv', name: 'x.csv', size: 100 }] });
  previewMutateAsync.mockResolvedValue(preview);
  commitMutateAsync.mockResolvedValue({ inserted: 3 });
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts, lastSuccessAt: null } });
  (mocked.useImportPreview as jest.Mock).mockReturnValue({ mutateAsync: previewMutateAsync });
  (mocked.useImportCommit as jest.Mock).mockReturnValue({ mutateAsync: commitMutateAsync });
});

async function toCheck() {
  await renderScreen(<ImportScreen />);
  await fireEvent.press(screen.getByText('Choose CSV file'));
}

it('shows preview counts and tagged rows', async () => {
  await toCheck();
  expect(await screen.findByText('Import 3 transactions')).toBeTruthy();
  expect(screen.getByLabelText('New: 3')).toBeTruthy();
  expect(screen.getByLabelText('Already have: 1')).toBeTruthy();
  expect(screen.getByLabelText('Skipped: 1')).toBeTruthy();
  expect(screen.getAllByText('NEW')).toHaveLength(3);
  expect(screen.getByText('HAVE IT')).toBeTruthy();
  expect(screen.getByText('Line 9: bad date')).toBeTruthy();
});

it('commit uses same accountId, format and csv, then shows Imported', async () => {
  await toCheck();
  await fireEvent.press(await screen.findByText('Import 3 transactions'));
  expect(previewMutateAsync).toHaveBeenCalledWith({ accountId: 1, format: 'commbank', csv: 'a,b\n1,2' });
  expect(commitMutateAsync).toHaveBeenCalledWith({ accountId: 1, format: 'commbank', csv: 'a,b\n1,2' });
  expect(await screen.findByText('Imported 3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Done'));
  expect(mockBack).toHaveBeenCalled();
});

it('amex account defaults to Amex format and lists no manual accounts', async () => {
  await renderScreen(<ImportScreen />);
  expect(screen.queryByText('House')).toBeNull();
  await fireEvent.press(screen.getByText('Gold'));
  await fireEvent.press(screen.getByText('Choose CSV file'));
  await waitFor(() => expect(previewMutateAsync).toHaveBeenCalled());
  expect(previewMutateAsync).toHaveBeenCalledWith({ accountId: 2, format: 'amex', csv: 'a,b\n1,2' });
});

it('rejects a 3 MB file and never previews', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.csv', name: 'x.csv', size: 3 * 1024 * 1024 }] });
  await toCheck();
  expect(await screen.findByText('That file is too big (max 2 MB)')).toBeTruthy();
  expect(previewMutateAsync).not.toHaveBeenCalled();
});

it('rejects by text length when size is missing', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.csv', name: 'x.csv' }] });
  mockText = 'x'.repeat(3 * 1024 * 1024);
  await toCheck();
  expect(await screen.findByText('That file is too big (max 2 MB)')).toBeTruthy();
  expect(previewMutateAsync).not.toHaveBeenCalled();
});

it('nothing new disables import', async () => {
  previewMutateAsync.mockResolvedValue({ new: [], duplicates: [row('Rent')], skipped: [] });
  await toCheck();
  expect(await screen.findByText('Nothing new to import')).toBeTruthy();
  await fireEvent.press(screen.getByText('Nothing new to import'));
  expect(commitMutateAsync).not.toHaveBeenCalled();
});

it('commit failure shows error and stays on check', async () => {
  commitMutateAsync.mockRejectedValue(new Error('x'));
  await toCheck();
  await fireEvent.press(await screen.findByText('Import 3 transactions'));
  expect(await screen.findByText('Import failed. Try again.')).toBeTruthy();
  expect(screen.getByText('Import 3 transactions')).toBeTruthy();
});
