import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

const THUMB = 22;

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => ReactNode;
  accessibilityLabel: string;
};

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;

function snap(v: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((v - min) / step) * step;
  // Round to the precision of the step and min, so 0.2 + 0.1 is 0.3 and not 0.30000000000000004.
  const clean = Number(stepped.toFixed(Math.max(decimals(step), decimals(min))));
  return Math.min(max, Math.max(min, clean));
}

/** Drag slider. Screen readers (and tests) move it a step at a time via increment/decrement actions. */
export function Slider({ label, value, min, max, step, onChange, format, accessibilityLabel }: SliderProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const latest = useRef({ value, min, max, step, onChange, width });
  latest.current = { value, min, max, step, onChange, width };
  const startValue = useRef(value);
  const moved = useRef(false);

  /** The unsnapped value under x, where x is measured against the outer view. */
  const valueAt = (x: number) => {
    const c = latest.current;
    const usable = c.width - THUMB;
    return usable <= 0 ? null : c.min + ((x - THUMB / 2) / usable) * (c.max - c.min);
  };
  const jumpTo = (x: number) => {
    const c = latest.current;
    const v = valueAt(x);
    if (v === null) return;
    const next = snap(v, c.min, c.max, c.step);
    if (next !== c.value) c.onChange(next);
  };

  const pan = useRef(
    PanResponder.create({
      // Never claim on touch down, and only claim a clearly horizontal move, so vertical scrolls reach the
      // parent ScrollView. Taps are handled by the Pressable track below.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
      // Once dragging, keep the gesture; before the first move, let a parent take it.
      onPanResponderTerminationRequest: () => !moved.current,
      onPanResponderGrant: (e) => {
        moved.current = false;
        // The gesture restarts from here (dx is 0 at grant): put the thumb under the finger.
        const v = valueAt(e.nativeEvent.locationX);
        if (v === null) return;
        startValue.current = v;
        jumpTo(e.nativeEvent.locationX);
      },
      onPanResponderMove: (_e, g) => {
        moved.current = true;
        const c = latest.current;
        const usable = c.width - THUMB;
        if (usable <= 0) return;
        const next = snap(startValue.current + (g.dx / usable) * (c.max - c.min), c.min, c.max, c.step);
        if (next !== c.value) c.onChange(next);
      },
      onPanResponderRelease: () => {
        moved.current = false;
      },
      onPanResponderTerminate: () => {
        moved.current = false;
      },
    }),
  ).current;

  const move = (dir: 1 | -1) => onChange(snap(value + dir * step, min, max, step));
  const frac = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
        {format(value)}
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') move(1);
          else if (e.nativeEvent.actionName === 'decrement') move(-1);
        }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 36, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: t.line, overflow: 'hidden' }}>
          <View style={{ width: `${frac * 100}%`, height: 6, backgroundColor: accents.lime }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: frac * Math.max(0, width - THUMB),
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: accents.lime,
            borderWidth: 2,
            borderColor: t.inkOnAccent,
          }}
        />
        {/* Touch layer over the whole outer view, so locationX is measured against it. */}
        <View testID="slider-pan" style={StyleSheet.absoluteFill} {...pan.panHandlers}>
          <Pressable testID="slider-track" accessible={false} onPress={(e) => jumpTo(e.nativeEvent.locationX)} style={StyleSheet.absoluteFill} />
        </View>
      </View>
    </View>
  );
}
