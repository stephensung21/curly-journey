import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import CalendarScreen from '../app/calendar';
import * as hooks from '../src/api/hooks';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-24T02:00:00Z') })); // 24 Oct, Sydney
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const ev = (id: number, name: string, o: object = {}) => ({
  id, name, emoji: '💳', amountCents: null, accountId: null, startDate: '2026-10-01', repeat: 'monthly', leadDays: 1, onDayAlert: false, ...o,
});
const occ = (eventId: number, date: string, o: object = {}) => ({ eventId, date, status: null, source: null, transactionId: null, payable: true, ...o });

const data = {
  events: [
    ev(1, 'Internet', { amountCents: 8900 }),
    ev(2, 'Amex statement closes'),
    ev(3, 'Netflix', { amountCents: 1699 }),
    ev(4, 'Rent', { amountCents: 210000 }),
    ev(5, 'Gym', { amountCents: 2000 }),
    ev(6, 'Rego', { amountCents: 50000, repeat: 'yearly' }),
  ],
  occurrences: [
    occ(3, '2026-10-14', { status: 'paid', source: 'auto', transactionId: 9 }),
    occ(4, '2026-10-20'),
    occ(5, '2026-10-10', { status: 'skipped', source: 'user' }),
    occ(2, '2026-10-25', { payable: false }),
    occ(1, '2026-10-27'),
    occ(6, '2026-11-05'),
  ],
};
const setOcc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  (mocked.useOccurrences as jest.Mock).mockReturnValue({ data });
  (mocked.useSetOccurrence as jest.Mock).mockReturnValue({ mutate: setOcc });
});

it('lists coming up with relative sublines and amounts', async () => {
  await renderScreen(<CalendarScreen />);
  expect(screen.getByText('Bills & dates')).toBeTruthy();
  expect(screen.getByText('Coming up')).toBeTruthy();
  expect(screen.getByText('Internet')).toBeTruthy();
  expect(screen.getByText('Tue 27 Oct · in 3 days')).toBeTruthy();
  expect(screen.getByText('Sun 25 Oct · tomorrow')).toBeTruthy();
  expect(screen.getByText('Thu 5 Nov · yearly')).toBeTruthy(); // inside the 14 days ahead
  expect(screen.getByText('$89.00')).toBeTruthy();
});

it('lists earlier rows with sublines and pills', async () => {
  await renderScreen(<CalendarScreen />);
  expect(screen.getByText('Earlier this month')).toBeTruthy();
  expect(screen.getByText('Netflix')).toBeTruthy();
  expect(screen.getByText('Wed 14 Oct · matched to transaction')).toBeTruthy();
  expect(screen.getByText('Sat 10 Oct · skipped')).toBeTruthy();
  expect(screen.getByText('PAID')).toBeTruthy();
  expect(screen.getByText('PAID?')).toBeTruthy();
});

it('tapping a PAID? row and Yes marks it paid', async () => {
  await renderScreen(<CalendarScreen />);
  await fireEvent.press(screen.getByText('Rent'));
  expect(screen.getByText('Did this get paid?')).toBeTruthy();
  expect(screen.getByText('Rent · due Tue 20 Oct')).toBeTruthy();
  expect(screen.queryByText('Mark as not paid')).toBeNull();
  await fireEvent.press(screen.getByText("Yes, it's paid"));
  expect(setOcc).toHaveBeenCalledWith({ eventId: 4, date: '2026-10-20', status: 'paid' });
});

it('Skip this one skips; Not yet only closes', async () => {
  await renderScreen(<CalendarScreen />);
  await fireEvent.press(screen.getByText('Rent'));
  await fireEvent.press(screen.getByText('Not yet'));
  expect(setOcc).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Rent'));
  await fireEvent.press(screen.getByText('Skip this one'));
  expect(setOcc).toHaveBeenCalledWith({ eventId: 4, date: '2026-10-20', status: 'skipped' });
});

it('a paid row offers Mark as not paid', async () => {
  await renderScreen(<CalendarScreen />);
  await fireEvent.press(screen.getByText('Netflix'));
  await fireEvent.press(screen.getByText('Mark as not paid'));
  expect(setOcc).toHaveBeenCalledWith({ eventId: 3, date: '2026-10-14', status: null });
});

it('?ask opens the sheet for that occurrence', async () => {
  mockParams = { ask: '4:2026-10-20' };
  await renderScreen(<CalendarScreen />);
  expect(screen.getByText('Rent · due Tue 20 Oct')).toBeTruthy();
});

it('other rows open the event; the add button goes to new', async () => {
  await renderScreen(<CalendarScreen />);
  await fireEvent.press(screen.getByText('Internet'));
  expect(mockPush).toHaveBeenCalledWith('/event/1');
  await fireEvent.press(screen.getByLabelText('Add event'));
  expect(mockPush).toHaveBeenCalledWith('/event/new');
  await fireEvent.press(screen.getByText('‹ More'));
  expect(mockBack).toHaveBeenCalled();
});

it('requests the viewed month plus 14 days ahead for the current month', async () => {
  await renderScreen(<CalendarScreen />);
  expect(mocked.useOccurrences).toHaveBeenCalledWith('2026-10-01', '2026-11-07');
});
