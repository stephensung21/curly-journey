import { parseDecimalToCents } from '@curly/core';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { fonts, AppText } from './AppText';
import { Button } from './Button';
import { MonthGrid } from './MonthGrid';
import { MonthSwitcher } from './MonthSwitcher';
import { Sheet } from './Sheet';
import { fullDay } from '../lib/days';
import { useTheme } from '../theme/useTheme';

/** Parse a typed value and as-of date. Returns the cents, or the message for each bad field. */
export function checkValue(value: string, asOf: string, today: string): { cents: number | null; valueError: string | null; asOfError: string | null } {
  let cents: number | null = null;
  if (value.trim() !== '') {
    try {
      cents = parseDecimalToCents(value);
    } catch {
      cents = null;
    }
  }
  return {
    cents,
    valueError: cents === null ? 'Enter a value' : null,
    asOfError: asOf > today ? "As of can't be in the future" : null,
  };
}

export function useInputStyle() {
  const t = useTheme();
  return {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;
}

/** The As of row: shows the date, and opens a month grid that disables days after today. */
export function AsOfField({ asOf, today, onChange }: { asOf: string; today: string; onChange: (iso: string) => void }) {
  const input = useInputStyle();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(asOf.slice(0, 7));
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="muted">
        As of
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMonth(asOf.slice(0, 7));
          setOpen(o => !o);
        }}
        style={input}
      >
        <AppText>{fullDay(asOf)}</AppText>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          <MonthSwitcher value={month} onChange={setMonth} />
          <MonthGrid
            month={month}
            today={today}
            dots={{}}
            selected={asOf}
            maxDate={today}
            onSelect={iso => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Bottom sheet to record a new value for a manual account. */
export function ValueSheet({
  visible,
  onClose,
  today,
  saving,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  today: string;
  saving: boolean;
  onSave: (valueCents: number, asOf: string) => Promise<void>;
}) {
  const t = useTheme();
  const input = useInputStyle();
  const [value, setValue] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [valueError, setValueError] = useState<string | null>(null);
  const [asOfError, setAsOfError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    const check = checkValue(value, asOf, today);
    setValueError(check.valueError);
    setAsOfError(check.asOfError);
    if (check.cents === null || check.asOfError) return;
    try {
      await onSave(check.cents, asOf);
    } catch {
      setSaveError("Couldn't save the value. Try again.");
      return;
    }
    setSaveError(null);
    setValue('');
    setAsOf(today);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title">Update value</AppText>
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
      {saveError ? <AppText>{saveError}</AppText> : null}
      <Button label="Save" disabled={saving} onPress={() => void save()} />
    </Sheet>
  );
}
