import { useState } from 'react';
import { View } from 'react-native';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { CrayonUnderline } from '../src/components/doodles/CrayonUnderline';
import { HandNote } from '../src/components/doodles/HandNote';
import { SunDoodle } from '../src/components/doodles/SunDoodle';
import { HeroCard } from '../src/components/HeroCard';
import { IconTile } from '../src/components/IconTile';
import { MonthSwitcher } from '../src/components/MonthSwitcher';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { Toggle } from '../src/components/Toggle';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

/** Component gallery for checking the design system on a real phone. */
export default function DesignSystemScreen() {
  const t = useTheme();
  const [month, setMonth] = useState('2026-10');
  const [tab, setTab] = useState<'etfs' | 'mortgage' | 'both'>('etfs');
  const [on, setOn] = useState(true);

  return (
    <Screen>
      <View style={{ alignItems: 'flex-end' }}>
        <SunDoodle />
      </View>
      <HeroCard>
        <AppText variant="label" tone="onAccent">
          You've spent this month
        </AppText>
        <View style={{ alignSelf: 'flex-start' }}>
          <Amount cents={496000} decimals="never" variant="hero" tone="onAccent" />
          <CrayonUnderline width={150} color={t.inkOnAccent} />
        </View>
        <View style={{ marginTop: 8 }}>
          <Pill tone="chip">Dining out is at 92% of your limit</Pill>
        </View>
      </HeroCard>

      <Card style={{ backgroundColor: accents.lime, flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong" tone="onAccent">
          Net worth
        </AppText>
        <Amount cents={31840000} decimals="never" tone="onAccent" />
      </Card>
      <HandNote style={{ textAlign: 'right' }}>
        up <Amount cents={620000} short inline /> since Sept
      </HandNote>

      <AppText variant="label" tone="muted">
        CommBank
      </AppText>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconTile emoji="🏠" color={accents.yellow} />
        <AppText style={{ flex: 1 }}>Main</AppText>
        <Amount cents={624000} decimals="never" />
      </Card>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconTile emoji="💳" color={accents.pink} />
        <AppText style={{ flex: 1 }}>Amex Platinum</AppText>
        <Amount cents={-231000} decimals="never" />
      </Card>

      <MonthSwitcher value={month} onChange={setMonth} />
      <Segmented
        options={[
          { value: 'etfs', label: 'ETFs' },
          { value: 'mortgage', label: 'Mortgage' },
          { value: 'both', label: 'Both' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Pill tone="ok">OK</Pill>
        <Pill tone="warn">update?</Pill>
        <Pill tone="neutral">HAVE IT</Pill>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText>A toggle</AppText>
        <Toggle value={on} onChange={setOn} />
      </Card>
      <HandNote tone="pink">
        <Amount cents={31000} decimals="never" inline /> more than Sept
      </HandNote>
      <Button label="Primary button" />
      <Button kind="secondary" label="Secondary button" />
    </Screen>
  );
}
