import { parseDecimalToCents, parsePriceToMicros } from '@curly/core';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useAddTrade } from '../api/hooks';
import type { NewTrade } from '../api/types';
import { now } from '../lib/now';
import { sydneyDate } from '../lib/days';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { AsOfField, useInputStyle } from './ValueSheet';

type Errors = Partial<Record<'symbol' | 'units' | 'price' | 'brokerage', string>>;

function validate(symbol: string, units: string, price: string, brokerage: string): Errors {
  const errors: Errors = {};
  if (!/^[A-Z0-9]{2,6}$/.test(symbol)) errors.symbol = 'Symbol is 2 to 6 letters or numbers';
  if (!/^\d+$/.test(units.trim()) || Number(units) <= 0) errors.units = 'Units must be a whole number';
  try {
    if (parsePriceToMicros(price.trim()) <= 0) throw new RangeError();
  } catch {
    errors.price = 'Enter a price';
  }
  try {
    if (parseDecimalToCents(brokerage.trim()) < 0) throw new RangeError();
  } catch {
    errors.brokerage = 'Enter the brokerage, or 0';
  }
  return errors;
}

/** Bottom sheet to record a trade by hand. */
export function TradeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const add = useAddTrade();
  const today = sydneyDate(now());
  const [date, setDate] = useState(today);
  const [side, setSide] = useState<NewTrade['side']>('buy');
  const [symbol, setSymbol] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [brokerage, setBrokerage] = useState('0');
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    const sym = symbol.trim().toUpperCase();
    const found = validate(sym, units, price, brokerage);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      await add.mutateAsync({ date, side, symbol: sym, units: Number(units), price: price.trim(), brokerage: brokerage.trim() });
    } catch {
      setSaveError("Couldn't save the trade. Try again.");
      return;
    }
    setSaveError(null);
    setSymbol('');
    setUnits('');
    setPrice('');
    setBrokerage('0');
    setDate(today);
    onClose();
  }

  const field = (label: string, value: string, set: (v: string) => void, key: keyof Errors, extra: object = {}) => (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.inkFaded}
        value={value}
        onChangeText={v => {
          set(v);
          setErrors(e => ({ ...e, [key]: undefined }));
        }}
        style={input}
        {...extra}
      />
      {errors[key] ? <AppText>{errors[key]}</AppText> : null}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title">New trade</AppText>
      <AsOfField label="Date" asOf={date} today={today} onChange={setDate} />
      <Segmented
        options={[
          { value: 'buy', label: 'Buy' },
          { value: 'sell', label: 'Sell' },
        ]}
        value={side}
        onChange={setSide}
      />
      {field('Symbol', symbol, v => setSymbol(v.toUpperCase()), 'symbol', { autoCapitalize: 'characters', autoCorrect: false })}
      {field('Units', units, setUnits, 'units', { keyboardType: 'number-pad', placeholder: '0' })}
      {field('Price per unit', price, setPrice, 'price', { keyboardType: 'decimal-pad', placeholder: '0.00' })}
      {field('Brokerage', brokerage, setBrokerage, 'brokerage', { keyboardType: 'decimal-pad' })}
      {saveError ? <AppText>{saveError}</AppText> : null}
      <Button label="Save trade" disabled={add.isPending} onPress={() => void save()} />
    </Sheet>
  );
}
