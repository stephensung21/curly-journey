import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountSettings from '../app/account/[id]/settings';
import * as hooks from '../src/api/hooks';

const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ back: jest.fn(), dismissAll: mockDismissAll }),
}));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const account = {
  id: 7, source: 'pocketsmith', institution: 'CommBank', name: 'Everyday', displayName: null, kind: 'transaction',
  balanceCents: 1, balanceDate: null, countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false, icon: null,
};
const mutate = jest.fn();
const del = jest.fn();
let isError = false;
let kind = 'transaction';
let source = 'pocketsmith';
let displayName: string | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  isError = false;
  kind = 'transaction';
  source = 'pocketsmith';
  del.mockResolvedValue(undefined);
  (mocked.useDeleteAccount as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
  displayName = null;
  (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts: [{ ...account, kind, source, displayName }], lastSuccessAt: null } }));
  (mocked.useUpdateAccount as jest.Mock).mockImplementation(() => ({ mutate, isError }));
});

it('toggling Offset sends isOffset true', async () => {
  await renderScreen(<AccountSettings />);
  expect(screen.getByText('Everyday settings')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Offset for home loan'), 'valueChange', true);
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { isOffset: true } });
});

it('toggles spending and net worth', async () => {
  await renderScreen(<AccountSettings />);
  await fireEvent(screen.getByLabelText('Spending'), 'valueChange', false);
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { countsSpending: false } });
  await fireEvent(screen.getByLabelText('Net worth'), 'valueChange', false);
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { countsNetWorth: false } });
});

it('choosing Mortgage sends projections mortgage', async () => {
  await renderScreen(<AccountSettings />);
  await fireEvent.press(screen.getByText('Mortgage'));
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { projections: 'mortgage' } });
});

it('display name saves on blur, empty saves null', async () => {
  displayName = 'Daily';
  await renderScreen(<AccountSettings />);
  const input = screen.getByLabelText('Display name');
  await fireEvent.changeText(input, 'Other');
  await fireEvent(input, 'blur');
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { displayName: 'Other' } });
  await fireEvent.changeText(input, '');
  await fireEvent(input, 'blur');
  expect(mutate).toHaveBeenLastCalledWith({ id: 7, settings: { displayName: null } });
});

it('shows error line on failure', async () => {
  isError = true;
  await renderScreen(<AccountSettings />);
  expect(screen.getByText("Couldn't save. Try again.")).toBeTruthy();
});

it('HandNote only for manual_asset', async () => {
  await renderScreen(<AccountSettings />);
  expect(screen.queryByText(/super stays out/)).toBeNull();
  kind = 'manual_asset';
  await renderScreen(<AccountSettings />);
  expect(screen.getByText(/super stays out of your spending, promise/)).toBeTruthy();
});

it('blur with no change does not save', async () => {
  await renderScreen(<AccountSettings />);
  const input = screen.getByLabelText('Display name');
  await fireEvent(input, 'focus');
  await fireEvent(input, 'blur');
  await fireEvent.changeText(input, '  ');
  await fireEvent(input, 'blur');
  expect(mutate).not.toHaveBeenCalled();
});

it('trims the field after saving', async () => {
  await renderScreen(<AccountSettings />);
  const input = screen.getByLabelText('Display name');
  await fireEvent.changeText(input, '  Daily  ');
  await fireEvent(input, 'blur');
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { displayName: 'Daily' } });
  expect(screen.getByLabelText('Display name').props.value).toBe('Daily');
});

it('shows the default icon and saves a picked emoji', async () => {
  await renderScreen(<AccountSettings />);
  expect(screen.getByLabelText('Icon')).toBeTruthy();
  expect(screen.queryByText('Default')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Icon'));
  await fireEvent.press(screen.getByLabelText('🐷'));
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { icon: '🐷' } });
  expect(screen.queryByText('Default')).toBeNull();
});

it('Default tile resets the icon to null', async () => {
  await renderScreen(<AccountSettings />);
  await fireEvent.press(screen.getByLabelText('Icon'));
  await fireEvent.press(screen.getByText('Default'));
  expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { icon: null } });
});

it('offers no delete on bank accounts', async () => {
  await renderScreen(<AccountSettings />);
  expect(screen.queryByText('Delete this account')).toBeNull();
});

it('deletes a manual account after confirming, then returns to Accounts', async () => {
  kind = 'manual_asset';
  source = 'manual';
  displayName = 'AMP super';
  await renderScreen(<AccountSettings />);
  await fireEvent.press(screen.getByText('Delete this account'));
  expect(screen.getByText('Delete AMP super? Its value history goes too.')).toBeTruthy();
  expect(del).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Delete'));
  expect(del).toHaveBeenCalledWith(7);
  expect(mockDismissAll).toHaveBeenCalled();
});

it('Cancel keeps the account', async () => {
  kind = 'manual_asset';
  source = 'manual';
  await renderScreen(<AccountSettings />);
  await fireEvent.press(screen.getByText('Delete this account'));
  await fireEvent.press(screen.getByText('Cancel'));
  expect(del).not.toHaveBeenCalled();
});

describe('growth field', () => {
  beforeEach(() => {
    kind = 'manual_asset';
    source = 'manual';
  });

  it('is only on manual accounts', async () => {
    source = 'pocketsmith';
    await renderScreen(<AccountSettings />);
    expect(screen.queryByLabelText('Grows by % a year')).toBeNull();
  });

  it('saves 3.5 as 350 bps', async () => {
    await renderScreen(<AccountSettings />);
    const input = screen.getByLabelText('Grows by % a year');
    await fireEvent.changeText(input, '3.5');
    await fireEvent(input, 'blur');
    expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { growthBps: 350 } });
  });

  it('rejects 25', async () => {
    await renderScreen(<AccountSettings />);
    const input = screen.getByLabelText('Grows by % a year');
    await fireEvent.changeText(input, '25');
    await fireEvent(input, 'blur');
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Enter -20 to 20, one decimal.')).toBeTruthy();
  });

  it('blank clears to none', async () => {
    (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts: [{ ...account, kind, source, growthBps: 350 }], lastSuccessAt: null } }));
    await renderScreen(<AccountSettings />);
    const input = screen.getByLabelText('Grows by % a year');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');
    expect(mutate).toHaveBeenCalledWith({ id: 7, settings: { growthBps: null } });
  });
});
