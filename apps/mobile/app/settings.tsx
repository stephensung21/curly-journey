import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useCategorisationStats, useConnection } from '../src/api/hooks';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { Toggle } from '../src/components/Toggle';
import { useSettings } from '../src/settings/store';

export default function SettingsScreen() {
  const { clear } = useConnection();
  const router = useRouter();
  const autoPercent = useCategorisationStats().data?.autoPercent ?? null;
  const { themeMode, hideBalances, homeChart, setThemeMode, setHideBalances, setHomeChart } = useSettings();

  return (
    <Screen>
      <AppText variant="title">Settings</AppText>

      <AppText variant="label" tone="muted">
        Appearance
      </AppText>
      <Segmented
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={themeMode}
        onChange={setThemeMode}
      />

      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <AppText>Hide balances</AppText>
          <AppText variant="label" tone="muted">
            Shows $••• instead of amounts
          </AppText>
        </View>
        <Toggle accessibilityLabel="Hide balances" value={hideBalances} onChange={setHideBalances} />
      </Card>

      <AppText variant="label" tone="muted">
        Home chart
      </AppText>
      <Segmented
        options={[
          { value: 'sixMonths', label: 'Last 6 months' },
          { value: 'thisMonth', label: 'This month' },
        ]}
        value={homeChart}
        onChange={setHomeChart}
      />

      <Pressable accessibilityRole="button" onPress={() => router.push('/rules')}>
        <Card>
          <AppText>{autoPercent === null ? 'Rules' : `Rules � ${autoPercent}% auto-sorted`}</AppText>
        </Card>
      </Pressable>

      <Card>
        <Button kind="secondary" label="Disconnect from API" onPress={() => void clear()} />
      </Card>
    </Screen>
  );
}
