import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import EventEditor from '../app/event/[id]';
import * as hooks from '../src/api/hooks';

const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'new' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-24T02:00:00Z') })); // 24 Oct, Sydney
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const create = jest.fn();
const update = jest.fn();
const del = jest.fn();
const acct = (id: number, name: string, countsSpending: boolean) => ({ id, name, displayName: null, countsSpending });
const seeded = { id: 5, name: 'Rent', emoji: '🏠', amountCents: 210000, accountId: 2, startDate: '2026-10-01', repeat: 'monthly', leadDays: 1, onDayAlert: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'new' };
  create.mockResolvedValue({});
  update.mockResolvedValue({});
  del.mockResolvedValue(undefined);
  (mocked.useEvents as jest.Mock).mockReturnValue({ data: { events: [seeded] } });
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts: [acct(2, 'Everyday', true), acct(3, 'Super', false)], lastSuccessAt: null } });
  (mocked.useCreateEvent as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false });
  (mocked.useUpdateEvent as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false });
  (mocked.useDeleteEvent as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
});

it('creates an event with the chosen values', async () => {
  await renderScreen(<EventEditor />);
  expect(screen.getByText('New event')).toBeTruthy();
  expect(screen.queryByText('Delete event')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Event name'), 'Strata levy');
  await fireEvent.changeText(screen.getByLabelText('Event amount'), '1150');
  await fireEvent.press(screen.getByText('Quarterly'));
  await fireEvent.press(screen.getByText('1 week before'));
  expect(screen.getByText("we'll tick it off when the payment shows up")).toBeTruthy();
  await fireEvent.press(screen.getByText('Save'));
  expect(create).toHaveBeenCalledWith({
    name: 'Strata levy', emoji: '📅', amountCents: 115000, accountId: null, startDate: '2026-10-24', repeat: 'quarterly', leadDays: 7, onDayAlert: false,
  });
  expect(mockBack).toHaveBeenCalled();
});

it('defaults to monthly, 2 days, and hides the note until payable', async () => {
  await renderScreen(<EventEditor />);
  expect(screen.getByText('Sat 24 Oct 2026')).toBeTruthy();
  expect(screen.queryByText("we'll tick it off when the payment shows up")).toBeNull();
  expect(screen.getByLabelText('Also remind me on the day')).toBeTruthy();
  await fireEvent.press(screen.getByText('On the day'));
  expect(screen.queryByLabelText('Also remind me on the day')).toBeNull();
  expect(screen.getByText('Everyday')).toBeTruthy();
  expect(screen.queryByText('Super')).toBeNull();
});

it('picks the first date from the month grid', async () => {
  await renderScreen(<EventEditor />);
  await fireEvent.press(screen.getByText('Sat 24 Oct 2026'));
  await fireEvent.press(screen.getByLabelText('Next month'));
  await fireEvent.press(screen.getByLabelText('Sun 15 Nov'));
  expect(screen.getByText('Sun 15 Nov 2026')).toBeTruthy();
});

it('edits a seeded event with a PATCH', async () => {
  mockParams = { id: '5' };
  await renderScreen(<EventEditor />);
  expect(screen.getByText('Edit event')).toBeTruthy();
  expect(screen.getByDisplayValue('Rent')).toBeTruthy();
  expect(screen.getByDisplayValue('2100')).toBeTruthy();
  expect(screen.getByText("we'll tick it off when the payment shows up")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Event name'), 'Rent due');
  await fireEvent.press(screen.getByText('Save'));
  expect(update).toHaveBeenCalledWith({
    id: 5, name: 'Rent due', emoji: '🏠', amountCents: 210000, accountId: 2, startDate: '2026-10-01', repeat: 'monthly', leadDays: 1, onDayAlert: true,
  });
  expect(create).not.toHaveBeenCalled();
});

it('shows an error and makes no call for an empty name', async () => {
  await renderScreen(<EventEditor />);
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Give it a name')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it('rejects a zero amount', async () => {
  await renderScreen(<EventEditor />);
  await fireEvent.changeText(screen.getByLabelText('Event name'), 'X');
  await fireEvent.changeText(screen.getByLabelText('Event amount'), '0');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Enter an amount above $0')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it('deletes and goes back', async () => {
  mockParams = { id: '5' };
  await renderScreen(<EventEditor />);
  await fireEvent.press(screen.getByText('Delete event'));
  expect(del).toHaveBeenCalledWith(5);
  expect(mockBack).toHaveBeenCalled();
});

it('a new event can start filled in from a transaction', async () => {
  mockParams = { id: 'new', name: 'Netflix', amount: '22.99', accountId: '2', date: '2026-10-03', emoji: '🎬' };
  await renderScreen(<EventEditor />);
  expect(screen.getByLabelText('Event name').props.value).toBe('Netflix');
  expect(screen.getByLabelText('Event amount').props.value).toBe('22.99');
  await fireEvent.press(screen.getByText('Save'));
  expect(create).toHaveBeenCalledWith({
    name: 'Netflix',
    emoji: '🎬',
    amountCents: 2299,
    accountId: 2,
    startDate: '2026-10-03',
    repeat: 'monthly',
    leadDays: 2,
    onDayAlert: false,
  });
});

it('an event that no longer exists says so, with a way back', async () => {
  mockParams = { id: '99' };
  await renderScreen(<EventEditor />);
  expect(screen.getByText('This event no longer exists.')).toBeTruthy();
  await fireEvent.press(screen.getByText('‹ Back'));
  expect(mockBack).toHaveBeenCalled();
});

it('says it is loading while events load', async () => {
  mockParams = { id: '5' };
  (mocked.useEvents as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
  await renderScreen(<EventEditor />);
  expect(screen.getByText('Loading…')).toBeTruthy();
});

it('a failed save message goes away when saving again', async () => {
  create.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(() => {}));
  await renderScreen(<EventEditor />);
  await fireEvent.changeText(screen.getByLabelText('Event name'), 'Gym');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText("Couldn't save the event. Try again.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.queryByText("Couldn't save the event. Try again.")).toBeNull();
});
