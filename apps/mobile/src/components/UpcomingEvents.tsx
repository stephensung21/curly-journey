import { addDays, dayLabel, daysBetween, REPEAT_LABEL, sydneyDate } from '@curly/core';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useOccurrences } from '../api/hooks';
import type { CalendarEventDef } from '../api/types';
import { now } from '../lib/now';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { IconTile } from './IconTile';
import { eventColor } from './MonthGrid';

function comingUpSubline(event: CalendarEventDef, date: string, today: string): string {
  const n = daysBetween(today, date);
  const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n <= 7 ? `in ${n} days` : REPEAT_LABEL[event.repeat];
  return `${dayLabel(date)} · ${when}`;
}

/** An upcoming-occurrence row: emoji tile, name, subline, optional amount. */
export function ComingUpRow({ event, date, today, onPress }: { event: CalendarEventDef; date: string; today: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile emoji={event.emoji} color={eventColor(event.id)} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{event.name}</AppText>
        <AppText variant="label" tone="muted">
          {comingUpSubline(event, date, today)}
        </AppText>
      </View>
      {event.amountCents !== null ? <Amount cents={event.amountCents} /> : null}
    </Pressable>
  );
}

/** Home: the next two unresolved occurrences within 60 days. Renders nothing when there are none. */
export function UpcomingEvents() {
  const router = useRouter();
  const today = sydneyDate(now());
  const data = useOccurrences(today, addDays(today, 60)).data;
  const byId = new Map((data?.events ?? []).map(e => [e.id, e]));
  const next = (data?.occurrences ?? []).filter(o => o.status === null && o.date >= today && byId.has(o.eventId)).slice(0, 2);
  if (next.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="label" tone="muted">
        Coming up
      </AppText>
      {next.map(o => (
        <ComingUpRow key={`${o.eventId}:${o.date}`} event={byId.get(o.eventId) as CalendarEventDef} date={o.date} today={today} onPress={() => router.push('/calendar')} />
      ))}
    </View>
  );
}
