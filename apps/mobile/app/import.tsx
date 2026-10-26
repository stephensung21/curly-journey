import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useImportCommit, useImportPreview } from '../src/api/hooks';
import { readTextFile } from '../src/lib/readTextFile';
import type { ImportBody, ImportedRow, ImportPreview } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { HandNote } from '../src/components/doodles/HandNote';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

type Format = ImportBody['format'];
type Step = 'pick' | 'check' | 'done';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 20;
const TOO_BIG = 'That file is too big (max 2 MB)';
const FAILED = 'Import failed. Try again.';

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

function PreviewRow({ row, isNew }: { row: ImportedRow; isNew: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <AppText numberOfLines={1}>{row.description}</AppText>
        <AppText variant="label" tone="muted">
          {row.date}
        </AppText>
      </View>
      <Amount cents={row.amountCents} signed />
      <Pill tone={isNew ? 'ok' : 'neutral'}>{isNew ? 'NEW' : 'HAVE IT'}</Pill>
    </View>
  );
}

export default function ImportScreen() {
  const router = useRouter();
  const accountsQ = useAccounts();
  const previewM = useImportPreview();
  const commitM = useImportCommit();

  const accounts = (accountsQ.data?.accounts ?? []).filter(a => a.source === 'pocketsmith');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [formatPick, setFormatPick] = useState<Format | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [inserted, setInserted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const account = accounts.find(a => a.id === accountId) ?? accounts[0];
  const format: Format = formatPick ?? (account && /amex/i.test(account.institution) ? 'amex' : 'commbank');

  async function pickFile() {
    if (!account || busy) return;
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
      const text = await readTextFile(asset.uri);
      if (text.length > MAX_BYTES) {
        setError(TOO_BIG);
        return;
      }
      const result = await previewM.mutateAsync({ accountId: account.id, format, csv: text });
      setCsv(text);
      setPreview(result);
      setStep('check');
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!account || !preview || preview.new.length === 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await commitM.mutateAsync({ accountId: account.id, format, csv });
      setInserted(res.inserted);
      setStep('done');
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  }

  const n = preview?.new.length ?? 0;
  const shown = preview
    ? [
        ...preview.new.map(r => ({ r, isNew: true })),
        ...preview.duplicates.map(r => ({ r, isNew: false })),
      ].slice(0, MAX_ROWS)
    : [];

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
      <AppText variant="title">Import CSV</AppText>

      {step === 'pick' && (
        <>
          <AppText variant="label" tone="muted">
            Account
          </AppText>
          {accounts.length === 0 && <AppText tone="muted">No accounts to import into yet.</AppText>}
          {accounts.map(a => {
            const on = a.id === account?.id;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setAccountId(a.id);
                  setFormatPick(null);
                }}
              >
                <Card style={on ? { borderWidth: 2, borderColor: accents.lime } : undefined}>
                  <AppText variant={on ? 'bodyStrong' : 'body'}>{a.displayName ?? a.name}</AppText>
                  <AppText variant="label" tone="muted">
                    {a.institution}
                  </AppText>
                </Card>
              </Pressable>
            );
          })}
          <AppText variant="label" tone="muted">
            Format
          </AppText>
          <Segmented
            options={[
              { value: 'commbank', label: 'CommBank' },
              { value: 'amex', label: 'Amex' },
            ]}
            value={format}
            onChange={setFormatPick}
          />
          {error && <AppText style={{ color: accents.pink }}>{error}</AppText>}
          <Button label="Choose CSV file" onPress={pickFile} disabled={!account || busy} />
        </>
      )}

      {step === 'check' && preview && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CountTile label="New" count={n} />
            <CountTile label="Already have" count={preview.duplicates.length} />
            <CountTile label="Skipped" count={preview.skipped.length} />
          </View>
          <Card>
            {shown.map(({ r, isNew }, i) => (
              <PreviewRow key={i} row={r} isNew={isNew} />
            ))}
            {n + preview.duplicates.length > MAX_ROWS && (
              <AppText variant="label" tone="muted">
                {`Showing the first ${MAX_ROWS} rows`}
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
          {error && <AppText style={{ color: accents.pink }}>{error}</AppText>}
          <Button
            label={n === 0 ? 'Nothing new to import' : `Import ${n} ${n === 1 ? 'transaction' : 'transactions'}`}
            onPress={commit}
            disabled={n === 0 || busy}
          />
        </>
      )}

      {step === 'done' && (
        <>
          <AppText variant="title">{`Imported ${inserted}`}</AppText>
          <Button label="Done" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
