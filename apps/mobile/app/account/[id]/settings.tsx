import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useAccounts, useDeleteAccount, useUpdateAccount } from '../../../src/api/hooks';
import type { Account, AccountSettings } from '../../../src/api/types';
import { Button } from '../../../src/components/Button';
import { Sheet } from '../../../src/components/Sheet';
import { AppText } from '../../../src/components/AppText';
import { Card } from '../../../src/components/Card';
import { kindColor, kindEmoji } from '../../../src/components/AccountRow';
import { EmojiPicker } from '../../../src/components/EmojiPicker';
import { HandNote } from '../../../src/components/doodles/HandNote';
import { IconTile } from '../../../src/components/IconTile';
import { Screen } from '../../../src/components/Screen';
import { Segmented } from '../../../src/components/Segmented';
import { Toggle } from '../../../src/components/Toggle';
import { useTheme } from '../../../src/theme/useTheme';

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="label" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Toggle accessibilityLabel={label} value={value} onChange={onChange} />
    </View>
  );
}

function Form({ account }: { account: Account }) {
  const t = useTheme();
  const router = useRouter();
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(account.displayName ?? '');
  const [growth, setGrowth] = useState(account.growthBps === null ? '' : String(account.growthBps / 100));
  const [growthError, setGrowthError] = useState(false);
  const save = (settings: AccountSettings) => update.mutate({ id: account.id, settings });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="title">‹</AppText>
        </Pressable>
        <AppText variant="title">{`${account.displayName ?? account.name} settings`}</AppText>
      </View>

      {update.isError ? <AppText tone="muted">Couldn't save. Try again.</AppText> : null}

      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Icon"
          onPress={() => setPicking(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
        >
          <AppText>Icon</AppText>
          <IconTile emoji={account.icon ?? kindEmoji[account.kind]} color={kindColor[account.kind]} size={36} />
        </Pressable>
      </Card>
      <EmojiPicker visible={picking} onClose={() => setPicking(false)} onPick={icon => save({ icon })} />

      <Card>
        <AppText variant="label" tone="muted">
          Counts towards
        </AppText>
        <ToggleRow label="Spending" value={account.countsSpending} onChange={v => save({ countsSpending: v })} />
        <ToggleRow label="Net worth" value={account.countsNetWorth} onChange={v => save({ countsNetWorth: v })} />
        <ToggleRow label="Offset for home loan" value={account.isOffset} onChange={v => save({ isOffset: v })} />
        <ToggleRow label="Show on Accounts page" value={!account.hidden} onChange={v => save({ hidden: !v })} />
        {account.kind === 'manual_asset' ? <HandNote>super stays out of your spending, promise</HandNote> : null}
      </Card>

      <AppText variant="label" tone="muted">
        Projections
      </AppText>
      <Segmented
        options={[
          { value: 'off', label: 'Off' },
          { value: 'etf', label: 'ETFs' },
          { value: 'mortgage', label: 'Mortgage' },
        ]}
        value={account.projections}
        onChange={v => save({ projections: v })}
      />

      <AppText variant="label" tone="muted">
        Display name
      </AppText>
      <TextInput
        accessibilityLabel="Display name"
        value={name}
        onChangeText={setName}
        onBlur={() => {
          const trimmed = name.trim();
          setName(trimmed);
          if (trimmed === (account.displayName ?? '')) return;
          save({ displayName: trimmed === '' ? null : trimmed });
        }}
        placeholder={account.name}
        placeholderTextColor={t.inkFaded}
        style={{ backgroundColor: t.surface, color: t.ink, borderRadius: 12, padding: 12, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14 }}
      />

      {account.source === 'manual' ? (
        <>
          <AppText variant="label" tone="muted">
            Grows by % a year
          </AppText>
          <TextInput
            accessibilityLabel="Grows by % a year"
            value={growth}
            onChangeText={v => {
              setGrowth(v);
              setGrowthError(false);
            }}
            onBlur={() => {
              const text = growth.trim();
              if (text === '') {
                setGrowth('');
                if (account.growthBps !== null) save({ growthBps: null });
                return;
              }
              const pct = Number(text);
              if (!/^-?\d+(\.\d)?$/.test(text) || pct < -20 || pct > 20) {
                setGrowthError(true);
                return;
              }
              const bps = Math.round(pct * 100);
              if (bps !== account.growthBps) save({ growthBps: bps });
            }}
            keyboardType="numbers-and-punctuation"
            placeholder="None"
            placeholderTextColor={t.inkFaded}
            style={{ backgroundColor: t.surface, color: t.ink, borderRadius: 12, padding: 12, fontFamily: 'BricolageGrotesque_500Medium', fontSize: 14 }}
          />
          {growthError ? <AppText tone="muted">Enter -20 to 20, one decimal.</AppText> : null}
          <Button kind="secondary" label="Delete this account" onPress={() => setConfirming(true)} />
          <Sheet visible={confirming} onClose={() => setConfirming(false)}>
            <AppText variant="title">{`Delete ${account.displayName ?? account.name}? Its value history goes too.`}</AppText>
            {deleteError ? <AppText>Couldn't delete the account. Try again.</AppText> : null}
            <Button
              label="Delete"
              disabled={del.isPending}
              onPress={async () => {
                try {
                  await del.mutateAsync(account.id);
                } catch {
                  setDeleteError(true);
                  return;
                }
                setConfirming(false);
                router.dismissAll();
              }}
            />
            <Button kind="secondary" label="Cancel" onPress={() => setConfirming(false)} />
          </Sheet>
        </>
      ) : null}
    </Screen>
  );
}

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountsQ = useAccounts();
  const account = accountsQ.data?.accounts.find(a => a.id === Number(id));
  if (!account) return <Screen>{null}</Screen>;
  return <Form account={account} />;
}
