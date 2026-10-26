import { dayLabel } from '@curly/core';
import { useRef, useState } from 'react';
import { useSetOccurrence } from '../api/hooks';
import type { CalendarEventDef, Occurrence, OccurrenceStatus } from '../api/types';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

export type PaidTarget = { event: CalendarEventDef; occurrence: Occurrence };

export function PaidSheet({ target, onClose }: { target: PaidTarget | null; onClose: () => void }) {
  const set = useSetOccurrence();
  const [failed, setFailed] = useState(false);
  // Set straight away, so a second tap before the next render can't save twice.
  const saving = useRef(false);
  const close = () => {
    setFailed(false);
    onClose();
  };
  // The sheet stays open until the save succeeds, so a failure is never silent.
  const apply = (status: OccurrenceStatus | null) => {
    if (!target || saving.current) return;
    saving.current = true;
    setFailed(false);
    set.mutate(
      { eventId: target.event.id, date: target.occurrence.date, status },
      { onSuccess: close, onError: () => setFailed(true), onSettled: () => (saving.current = false) },
    );
  };
  return (
    <Sheet visible={target !== null} onClose={close}>
      {target ? (
        <>
          <AppText variant="title">Did this get paid?</AppText>
          <AppText tone="muted">{`${target.event.name} · due ${dayLabel(target.occurrence.date)}`}</AppText>
          {failed ? <AppText tone="muted">Couldn't save. Try again.</AppText> : null}
          <Button label="Yes, it's paid" onPress={() => apply('paid')} />
          <Button kind="secondary" label="Not yet" onPress={close} />
          <Button kind="secondary" label="Skip this one" onPress={() => apply('skipped')} />
          {target.occurrence.status !== null ? <Button kind="secondary" label="Mark as not paid" onPress={() => apply(null)} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}
