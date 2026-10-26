import { fireEvent, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { ExitSheet } from '../src/components/ExitSheet';
import { shouldConfirmExit } from '../src/lib/exitConfirm';
import { renderScreen } from '../test-utils/renderScreen';

it('asks only on the first tab with nothing open on top', () => {
  expect(shouldConfirmExit(true, '/')).toBe(true);
  expect(shouldConfirmExit(true, '/spending')).toBe(false);
  expect(shouldConfirmExit(false, '/')).toBe(false);
});

describe('ExitSheet', () => {
  const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => {});
  const onClose = jest.fn();
  beforeEach(() => jest.clearAllMocks());

  it('asks in the app style, and Stay keeps the app open', async () => {
    await renderScreen(<ExitSheet visible onClose={onClose} />);
    expect(screen.getByText('Exit Curly Journey?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Stay'));
    expect(onClose).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('Exit closes the app', async () => {
    await renderScreen(<ExitSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByText('Exit'));
    expect(exit).toHaveBeenCalled();
  });
});
