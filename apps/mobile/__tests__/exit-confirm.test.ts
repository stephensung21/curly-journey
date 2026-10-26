import { Alert, BackHandler } from 'react-native';
import { confirmExit, shouldConfirmExit } from '../src/lib/exitConfirm';

it('asks only on the first tab with nothing open on top', () => {
  expect(shouldConfirmExit(true, '/')).toBe(true);
  expect(shouldConfirmExit(true, '/spending')).toBe(false);
  expect(shouldConfirmExit(false, '/')).toBe(false);
});

it('offers Stay and Exit, can be dismissed with back, and Exit closes the app', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => {});
  confirmExit();
  const [title, , buttons, options] = alert.mock.calls[0]!;
  expect(title).toBe('Exit Curly Journey?');
  expect(buttons!.map(b => b.text)).toEqual(['Stay', 'Exit']);
  expect(options).toMatchObject({ cancelable: true });
  buttons![0]!.onPress?.();
  expect(exit).not.toHaveBeenCalled();
  buttons![1]!.onPress?.();
  expect(exit).toHaveBeenCalled();
});
