import { dayLabel } from '@curly/core';
import { useSetOccurrence } from '../api/hooks';
import type { CalendarEventDef, Occurrence, OccurrenceStatus } from '../api/types';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

export type PaidTarget = { event: CalendarEventDef; occurrence: Occurrence };

export function PaidSheet({ target, onClose }: { target: PaidTarget | null; onClose: () => void }) {
  const set = useSetOccurrence();
  const apply = (status: OccurrenceStatus | null) => {
    if (!target) return;
    set.mutate({ eventId: target.event.id, date: target.occurrence.date, status });
    onClose();
  };
  return (
    <Sheet visible={target !== null} onClose={onClose}>
      {target ? (
        <>
          <AppText variant="title">Did this get paid?</AppText>
          <AppText tone="muted">{`${target.event.name} · due ${dayLabel(target.occurrence.date)}`}</AppText>
          <Button label="Yes, it's paid" onPress={() => apply('paid')} />
          <Button kind="secondary" label="Not yet" onPress={onClose} />
          <Button kind="secondary" label="Skip this one" onPress={() => apply('skipped')} />
          {target.occurrence.status === 'paid' ? <Button kind="secondary" label="Mark as not paid" onPress={() => apply(null)} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}
