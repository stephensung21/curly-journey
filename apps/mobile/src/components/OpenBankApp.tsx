import { Pressable } from 'react-native';
import { bankAppFor, openBankApp } from '../lib/bankApps';
import { Button } from './Button';
import { AppText } from './AppText';

/** Full-width secondary button; renders nothing for institutions without a known app. */
export function OpenBankAppButton({ institution }: { institution: string }) {
  const app = bankAppFor(institution);
  if (!app) return null;
  return <Button kind="secondary" label={`Open ${app.label} app ↗`} onPress={() => void openBankApp(app)} />;
}

/** Small ↗ target for institution headers. */
export function OpenBankAppLink({ institution }: { institution: string }) {
  const app = bankAppFor(institution);
  if (!app) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${app.label} app`} hitSlop={10} onPress={() => void openBankApp(app)}>
      <AppText variant="label" tone="muted">
        ↗
      </AppText>
    </Pressable>
  );
}
