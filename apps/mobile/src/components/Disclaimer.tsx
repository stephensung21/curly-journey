import { AppText } from './AppText';

export const DISCLAIMER = 'General information only, not financial advice. These projections use simple assumptions and real results will differ.';

export function Disclaimer() {
  return (
    <AppText variant="label" tone="muted" style={{ textAlign: 'center', paddingVertical: 8 }}>
      {DISCLAIMER}
    </AppText>
  );
}
