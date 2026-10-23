import { addDays, dayLabel, monthKey, REPEAT_LABEL, sydneyDate } from '@curly/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useOccurrences } from '../src/api/hooks';
import type { CalendarEventDef, Occurrence } from '../src/api/types';
import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { IconTile } from '../src/components/IconTile';
import { eventColor, MonthGrid } from '../src/components/MonthGrid';
import { MonthSwitcher } from '../src/components/MonthSwitcher';
import { PaidSheet, type PaidTarget } from '../src/components/PaidSheet';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { ComingUpRow } from '../src/components/UpcomingEvents';
import { now } from '../src/lib/now';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

function lastDay(month: string): string {
  return `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
}

function earlierSubline(event: CalendarEventDef, o: Occurrence): string {
  const what =
    o.status === 'paid' ? (o.source === 'auto' ? 'matched to transaction' : 'marked paid') : o.status === 'skipped' ? 'skipped' : REPEAT_LABEL[event.repeat];
  return `${dayLabel(o.date)} · ${what}`;
}

export default function CalendarScreen() {
  const t = useTheme();
  const router = useRouter();
  const today = sydneyDate(now());
  const currentMonth = monthKey(now());
  const [month, setMonth] = useState(currentMonth);
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const [asked, setAsked] = useState<PaidTarget | null>(null);
  const [handledAsk, setHandledAsk] = useState<string | undefined>(undefined);

  const from = `${month}-01`;
  const monthEnd = lastDay(month);
  const to = month === currentMonth && addDays(today, 14) > monthEnd ? addDays(today, 14) : monthEnd;
  const data = useOccurrences(from, to).data;
  const byId = new Map((data?.events ?? []).map(e => [e.id, e]));
  const all = (data?.occurrences ?? []).filter(o => byId.has(o.eventId));

  // ?ask=EVENTID:DATE opens the paid prompt for that occurrence once its data has loaded.
  if (ask && ask !== handledAsk && data) {
    const [id, date] = ask.split(':');
    const occurrence = all.find(o => String(o.eventId) === id && o.date === date);
    setHandledAsk(ask);
    if (occurrence) setAsked({ event: byId.get(occurrence.eventId) as CalendarEventDef, occurrence });
  }

  const inMonth = (o: Occurrence) => o.date >= from && o.date <= monthEnd;
  const comingUp = all.filter(o => o.date >= today && (inMonth(o) || (month === currentMonth && o.date <= addDays(today, 14))));
  const earlier = all.filter(o => o.date < today && inMonth(o));

  const dots: Record<string, string[]> = {};
  for (const o of all.filter(inMonth)) (dots[o.date] ??= []).push(eventColor(o.eventId));

  const open = (o: Occurrence) => {
    const event = byId.get(o.eventId) as CalendarEventDef;
    if (o.payable && o.date < today) setAsked({ event, occurrence: o });
    else router.push(`/event/${o.eventId}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText tone="muted">‹ More</AppText>
        </Pressable>
        <AppText variant="title">Bills & dates</AppText>
        <MonthSwitcher value={month} onChange={setMonth} />
        <Card>
          <MonthGrid month={month} today={today} dots={dots} />
        </Card>

        {comingUp.length > 0 ? (
          <View style={{ gap: 10 }}>
            <AppText variant="label" tone="muted">
              Coming up
            </AppText>
            {comingUp.map(o => (
              <ComingUpRow key={`${o.eventId}:${o.date}`} event={byId.get(o.eventId) as CalendarEventDef} date={o.date} today={today} onPress={() => open(o)} />
            ))}
          </View>
        ) : null}

        {earlier.length > 0 ? (
          <View style={{ gap: 10 }}>
            <AppText variant="label" tone="muted">
              Earlier this month
            </AppText>
            {earlier.map(o => {
              const event = byId.get(o.eventId) as CalendarEventDef;
              return (
                <Pressable
                  key={`${o.eventId}:${o.date}`}
                  accessibilityRole="button"
                  onPress={() => open(o)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.75 }}
                >
                  <IconTile emoji={event.emoji} color={eventColor(event.id)} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{event.name}</AppText>
                    <AppText variant="label" tone="muted">
                      {earlierSubline(event, o)}
                    </AppText>
                  </View>
                  {o.payable && o.status === 'paid' ? <Pill tone="ok">PAID</Pill> : null}
                  {o.payable && o.status === null ? <Pill tone="alert">PAID?</Pill> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={{ height: 72 }} />
      </Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add event"
        onPress={() => router.push('/event/new')}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 24,
          width: 52,
          height: 52,
          borderRadius: 18,
          backgroundColor: accents.lime,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: t.surfaceEdge,
        }}
      >
        <AppText variant="title" tone="onAccent">
          +
        </AppText>
      </Pressable>
      <PaidSheet target={asked} onClose={() => setAsked(null)} />
    </View>
  );
}
