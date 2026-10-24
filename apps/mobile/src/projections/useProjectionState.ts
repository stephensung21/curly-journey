import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpdateProfile } from '../api/hooks';
import type { ProjectionPrefill, ProjectionProfile } from '../api/types';

const SAVE_DELAY_MS = 1000;
type Saved = Pick<ProjectionProfile, 'returnBps' | 'targetCents' | 'targetAge' | 'todaysDollars'>;

/**
 * Start and monthly are session-only (reset when the tab loses focus); the other four are saved to the
 * profile, written once 1 s after the last change.
 */
export function useProjectionState(profile: ProjectionProfile, prefill: ProjectionPrefill) {
  const update = useUpdateProfile();
  const [startOverride, setStart] = useState<number | null>(null);
  const [monthlyOverride, setMonthly] = useState<number | null>(null);
  const [yearsFromNow, setYearsFromNow] = useState(25);
  const [saved, setSaved] = useState<Saved>({
    returnBps: profile.returnBps,
    targetCents: profile.targetCents,
    targetAge: profile.targetAge,
    todaysDollars: profile.todaysDollars,
  });

  useFocusEffect(
    useCallback(
      () => () => {
        setStart(null);
        setMonthly(null);
        setYearsFromNow(25);
      },
      [],
    ),
  );

  const pending = useRef<Partial<Saved>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutate = useRef(update.mutate);
  mutate.current = update.mutate;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    mutate.current(patch);
  }, []);
  // Leaving the screen mid-debounce should not lose the change.
  useEffect(() => flush, [flush]);

  const change = useCallback(
    <K extends keyof Saved>(key: K, value: Saved[K]) => {
      setSaved(s => ({ ...s, [key]: value }));
      pending.current = { ...pending.current, [key]: value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  return {
    startCents: startOverride ?? prefill.etfStartCents,
    monthlyCents: monthlyOverride ?? prefill.etfMonthlyCents,
    ...saved,
    setStart,
    setMonthly,
    yearsFromNow,
    setYearsFromNow,
    setReturnBps: (v: number) => change('returnBps', v),
    setTargetCents: (v: number) => change('targetCents', v),
    setTargetAge: (v: number) => change('targetAge', v),
    setTodaysDollars: (v: boolean) => change('todaysDollars', v),
  };
}

export type ProjectionState = ReturnType<typeof useProjectionState>;
