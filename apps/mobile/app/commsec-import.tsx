import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useCommsecImport, useCommsecPreview } from '../src/api/hooks';
import type { TradePreview } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { HandNote } from '../src/components/doodles/HandNote';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { useSettings } from '../src/settings/store';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

type Step = 'pick' | 'check' | 'done';
type Row = TradePreview['new'][number];

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 20;
const TOO_BIG = 'That file is too big (max 2 MB)';
const FAILED = 'Import failed. Try again.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function StepBar({ step }: { step: Step }) {
  const t = useTheme();
  const n = step === 'pick' ? 1 : step === 'check' ? 2 : 3;
  return (
    <View accessibilityLabel={`Step ${n} of 3`} style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3].map(i => (
        <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= n ? accents.lime : t.line }} />
      ))}
    </View>
  );
}

function CountTile({ label, count }: { label: string; count: number }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center' }}>
      <View accessible accessibilityLabel={`${label}: ${count}`} style={{ alignItems: 'center' }}>
        <AppText variant="bodyStrong">{String(count)}</AppText>
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
      </View>
    </Card>
  );
}

function TradeLine({ trade, isNew }: { trade: Row; isNew: boolean }) {
  const hidden = useSettings(s => s.hideBalances);
  const day = `${Number(trade.date.slice(8, 10))} ${MONTHS[Number(trade.date.slice(5, 7)) - 1]}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText>{`${trade.side === 'buy' ? 'Buy' : 'Sell'} ${trade.symbol}`}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <AppText variant="label" tone="muted">{`${day} · ${hidden ? '•••' : trade.units} units @`}</AppText>
          <Amount cents={Math.round(trade.priceMicros / 10000)} variant="label" tone="muted" />
        </View>
      </View>
      <Amount cents={trade.totalCents} />
      <Pill tone={isNew ? 'ok' : 'neutral'}>{isNew ? 'NEW' : 'HAVE IT'}</Pill>
    </View>
  );
}

export default function CommsecImportScreen() {
  const router = useRouter();
  const previewM = useCommsecPreview();
  const importM = useCommsecImport();
  const [step, setStep] = useState<Step>('pick');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<TradePreview | null>(null);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickFile() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.size != null && asset.size > MAX_BYTES) {
        setError(TOO_BIG);
        return;
      }
      const text = await new File(asset.uri).text();
      if (text.length > MAX_BYTES) {
        setError(TOO_BIG);
        return;
      }
      const result = await previewM.mutateAsync(text);
      setCsv(text);
      setPreview(result);
      setStep('check');
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  }

  const n = preview?.new.length ?? 0;
  const replacing = preview?.replacing ?? 0;
  const actionable = n + replacing > 0;

  async function commit() {
    if (!preview || !actionable || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await importM.mutateAsync(csv);
      setImported(res.imported);
      setStep('done');
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  }

  const shown = preview
    ? [...preview.new.map(r => ({ r, isNew: true })), ...preview.have.map(r => ({ r, isNew: false }))].slice(0, MAX_ROWS)
    : [];
  const label =
    n === 0 && replacing > 0 ? `Update ${replacing} ${replacing === 1 ? 'trade' : 'trades'}` : `Import ${n} ${n === 1 ? 'trade' : 'trades'}`;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <AppText tone="muted">{step === 'done' ? 'Close' : 'Cancel'}</AppText>
        </Pressable>
        <AppText variant="label" tone="muted">
          {`Step ${step === 'pick' ? 1 : step === 'check' ? 2 : 3} of 3`}
        </AppText>
      </View>
      <StepBar step={step} />
      <AppText variant="title">{step === 'pick' ? 'Choose file' : step === 'check' ? 'Check before importing' : 'Done'}</AppText>

      {step === 'pick' && (
        <>
          <AppText tone="muted">Pick the transactions CSV you exported from CommSec.</AppText>
          {error && <AppText style={{ color: accents.pink }}>{error}</AppText>}
          <Button label="Choose CSV file" onPress={pickFile} disabled={busy} />
        </>
      )}

      {step === 'check' && preview && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CountTile label="New" count={n} />
            <CountTile label="Already have" count={preview.have.length} />
            <CountTile label="Skipped" count={preview.skipped.length} />
          </View>
          <Card>
            {shown.map(({ r, isNew }, i) => (
              <TradeLine key={i} trade={r} isNew={isNew} />
            ))}
            {n + preview.have.length > MAX_ROWS && (
              <AppText variant="label" tone="muted">
                {`Showing the first ${MAX_ROWS} trades`}
              </AppText>
            )}
          </Card>
          {preview.skipped.length > 0 && (
            <View>
              {preview.skipped.map(s => (
                <AppText key={s.line} variant="label" tone="muted">
                  {`Line ${s.line}: ${s.reason}`}
                </AppText>
              ))}
            </View>
          )}
          <HandNote>no doubles, we checked</HandNote>
          {replacing > 0 && (
            <AppText variant="label" tone="muted">
              {`Replaces ${replacing} you added by hand`}
            </AppText>
          )}
          {error && <AppText style={{ color: accents.pink }}>{error}</AppText>}
          <Button label={label} onPress={commit} disabled={!actionable || busy} />
        </>
      )}

      {step === 'done' && (
        <>
          <AppText variant="title">{`Imported ${imported}`}</AppText>
          <Button label="Back to CommSec" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
