import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AboutYou from '../app/about-you';
import * as hooks from '../src/api/hooks';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-24T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const save = jest.fn();
let profile: object;

beforeEach(() => {
  jest.clearAllMocks();
  save.mockResolvedValue({});
  profile = { birthDate: null, taxRateBps: null };
  mocked.useProjections.mockImplementation((() => ({ data: { profile, prefill: {} } })) as any);
  mocked.useUpdateProfile.mockImplementation((() => ({ mutateAsync: save, isPending: false })) as any);
});

it('saves the birth date and the 30% pill', async () => {
  await renderScreen(<AboutYou />);
  await fireEvent.changeText(screen.getByLabelText('Birth date'), '05/03/1990');
  await fireEvent.press(screen.getByText('30%'));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ birthDate: '1990-03-05', taxRateBps: 3000 }));
  expect(mockBack).toHaveBeenCalled();
});

it('shows all pills and the Medicare hint', async () => {
  await renderScreen(<AboutYou />);
  for (const p of ['0%', '16%', '30%', '37%', '45%', 'Other']) expect(screen.getByText(p)).toBeTruthy();
  expect(screen.getByText('plus 2% Medicare levy if it applies')).toBeTruthy();
});

it('saves a free tax rate from Other', async () => {
  await renderScreen(<AboutYou />);
  await fireEvent.press(screen.getByText('Other'));
  await fireEvent.changeText(screen.getByLabelText('Tax rate %'), '32.5');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ birthDate: null, taxRateBps: 3250 }));
});

it('rejects a future date', async () => {
  await renderScreen(<AboutYou />);
  await fireEvent.changeText(screen.getByLabelText('Birth date'), '25/10/2026');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText("Birth date can't be in the future")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('rejects an unreadable date', async () => {
  await renderScreen(<AboutYou />);
  await fireEvent.changeText(screen.getByLabelText('Birth date'), '31/02/1990');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Use dd/mm/yyyy')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('starts from the saved profile', async () => {
  profile = { birthDate: '1985-12-01', taxRateBps: 4500 };
  await renderScreen(<AboutYou />);
  expect(screen.getByLabelText('Birth date').props.value).toBe('01/12/1985');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ birthDate: '1985-12-01', taxRateBps: 4500 }));
});

it('shows an inline error when saving fails', async () => {
  save.mockRejectedValue(new Error('boom'));
  await renderScreen(<AboutYou />);
  await fireEvent.press(screen.getByText('Save'));
  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it('says so when the details fail to load', async () => {
  mocked.useProjections.mockImplementation((() => ({ data: undefined, isError: true })) as any);
  await renderScreen(<AboutYou />);
  expect(screen.getByText("Couldn't load your details. Go back and try again.")).toBeTruthy();
});
