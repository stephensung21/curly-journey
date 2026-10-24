import { sydneyDate } from '@curly/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useProjections, useUpdateProfile } from '../src/api/hooks';
import type { ProjectionProfile } from '../src/api/types';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { useInputStyle } from '../src/components/ValueSheet';
import { now } from '../src/lib/now';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

const PRESETS = [0, 16, 30, 37, 45];
const SAVE_FAILED = "Couldn't save. Try again.";

const isoToDmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** dd/mm/yyyy to an ISO date, or null when it is not a real calendar date. */
function dmyToIso(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const back = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(back.getTime()) || back.toISOString().slice(0, 10) !== iso || y < 1900) return null;
  return iso;
}

/** "32.5" to 3250 bps (one decimal), or null. */
function percentToBps(s: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d))?$/.exec(s.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number(m[2] ?? '0') * 10;
  return bps <= 6000 ? bps : null;
}

function Form({ profile }: { profile: ProjectionProfile }) {
  const t = useTheme();
  const router = useRouter();
  const input = useInputStyle();
  const update = useUpdateProfile();
  const today = sydneyDate(now());

  const savedBps = profile.taxRateBps;
  const savedIsPreset = savedBps !== null && PRESETS.some(p => p * 100 === savedBps);
  const [birth, setBirth] = useState(profile.birthDate ? isoToDmy(profile.birthDate) : '');
  const [preset, setPreset] = useState<number | 'other' | null>(savedBps === null ? null : savedIsPreset ? savedBps / 100 : 'other');
  const [other, setOther] = useState(savedBps !== null && !savedIsPreset ? String(savedBps / 100) : '');
  const [birthError, setBirthError] = useState<string | null>(null);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaveError(null);
    let birthDate: string | null = null;
    let bad = false;
    if (birth.trim() !== '') {
      birthDate = dmyToIso(birth);
      if (!birthDate) {
        setBirthError('Use dd/mm/yyyy');
        bad = true;
      } else if (birthDate > today) {
        setBirthError("Birth date can't be in the future");
        bad = true;
      } else setBirthError(null);
    } else setBirthError(null);

    let taxRateBps: number | null = null;
    if (preset === 'other') {
      taxRateBps = percentToBps(other);
      if (taxRateBps === null) {
        setTaxError('Enter a rate between 0 and 60, like 32.5');
        bad = true;
      } else setTaxError(null);
    } else {
      taxRateBps = preset === null ? null : preset * 100;
      setTaxError(null);
    }
    if (bad) return;
    try {
      await update.mutateAsync({ birthDate, taxRateBps });
    } catch {
      setSaveError(SAVE_FAILED);
      return;
    }
    router.back();
  }

  const pill = (key: number | 'other', text: string) => {
    const on = preset === key;
    return (
      <Pressable
        key={text}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => {
          setPreset(key);
          setTaxError(null);
        }}
        style={{ backgroundColor: on ? accents.lime : t.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
      >
        <AppText variant="bodyStrong" style={{ color: on ? t.inkOnAccent : t.inkMuted }}>
          {text}
        </AppText>
      </Pressable>
    );
  };

  return (
    <>
      <Card style={{ gap: 6 }}>
        <AppText variant="label" tone="muted">
          Birth date
        </AppText>
        <TextInput
          accessibilityLabel="Birth date"
          placeholder="dd/mm/yyyy"
          placeholderTextColor={t.inkFaded}
          keyboardType="numbers-and-punctuation"
          value={birth}
          onChangeText={v => {
            setBirth(v);
            setBirthError(null);
          }}
          style={input}
        />
        {birthError ? <AppText>{birthError}</AppText> : null}
      </Card>
      <Card style={{ gap: 8 }}>
        <AppText variant="label" tone="muted">
          Tax rate
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map(p => pill(p, `${p}%`))}
          {pill('other', 'Other')}
        </View>
        {preset === 'other' ? (
          <TextInput
            accessibilityLabel="Tax rate %"
            placeholder="32.5"
            placeholderTextColor={t.inkFaded}
            keyboardType="decimal-pad"
            value={other}
            onChangeText={v => {
              setOther(v);
              setTaxError(null);
            }}
            style={input}
          />
        ) : null}
        <AppText variant="label" tone="muted">
          plus 2% Medicare levy if it applies
        </AppText>
        {taxError ? <AppText>{taxError}</AppText> : null}
      </Card>
      {saveError ? <AppText>{saveError}</AppText> : null}
      <Button label="Save" disabled={update.isPending} onPress={() => void save()} />
    </>
  );
}

export default function AboutYouScreen() {
  const router = useRouter();
  const profile = useProjections().data?.profile;
  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ More</AppText>
      </Pressable>
      <AppText variant="title">About you</AppText>
      <AppText tone="muted">Used to show your age on projections and to take tax off ETF distributions.</AppText>
      {profile ? <Form profile={profile} /> : null}
    </Screen>
  );
}
