import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useCreateManualAccount } from '../../src/api/hooks';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { HandNote } from '../../src/components/doodles/HandNote';
import { EmojiPicker } from '../../src/components/EmojiPicker';
import { Screen } from '../../src/components/Screen';
import { AsOfField, checkValue, useInputStyle } from '../../src/components/ValueSheet';
import { sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';
import { useTheme } from '../../src/theme/useTheme';

export default function NewManualAccountScreen() {
  const t = useTheme();
  const router = useRouter();
  const input = useInputStyle();
  const today = sydneyDate(now());
  const create = useCreateManualAccount();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🦘');
  const [value, setValue] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [picking, setPicking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);
  const [asOfError, setAsOfError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    const check = checkValue(value, asOf, today);
    setNameError(trimmed ? null : 'Give it a name');
    setValueError(check.valueError);
    setAsOfError(check.asOfError);
    if (!trimmed || check.cents === null || check.asOfError) return;
    try {
      const account = await create.mutateAsync({ name: trimmed, icon, valueCents: check.cents, asOf });
      router.replace(`/account/${account.id}`);
    } catch {
      setSaveError("Couldn't save the account. Try again.");
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="title">‹</AppText>
        </Pressable>
        <AppText variant="title">Add a manual account</AppText>
      </View>

      <Card>
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="muted">
            Name
          </AppText>
          <TextInput
            accessibilityLabel="Name"
            placeholder="AMP super"
            placeholderTextColor={t.inkFaded}
            value={name}
            onChangeText={v => {
              setName(v);
              setNameError(null);
            }}
            style={input}
          />
          {nameError ? <AppText>{nameError}</AppText> : null}
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="muted">
            Icon
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Icon" onPress={() => setPicking(true)} style={[input, { alignSelf: 'flex-start' }]}>
            <AppText style={{ fontSize: 22 }}>{icon}</AppText>
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="muted">
            Value
          </AppText>
          <TextInput
            accessibilityLabel="Value"
            placeholder="0.00"
            placeholderTextColor={t.inkFaded}
            keyboardType="decimal-pad"
            value={value}
            onChangeText={v => {
              setValue(v);
              setValueError(null);
            }}
            style={input}
          />
          {valueError ? <AppText>{valueError}</AppText> : null}
        </View>
        <AsOfField asOf={asOf} today={today} onChange={iso => { setAsOf(iso); setAsOfError(null); }} />
        {asOfError ? <AppText>{asOfError}</AppText> : null}
        <HandNote>super stays out of your spending, promise</HandNote>
      </Card>

      {saveError ? <AppText>{saveError}</AppText> : null}
      <Button label="Save" disabled={create.isPending} onPress={() => void save()} />
      <EmojiPicker visible={picking} onClose={() => setPicking(false)} onPick={picked => setIcon(picked ?? '🦘')} />
    </Screen>
  );
}
