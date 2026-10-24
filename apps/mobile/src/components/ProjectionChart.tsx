import { formatAudShort, yearOf } from '@curly/core';
import { useState } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';

const HEIGHT = 190;
const GUTTER = 44;
const TOP = 10;
const BOTTOM = 22;
const AXIS_FONT = 11;
const FALLBACK_WIDTH = Dimensions.get('window').width - 32;
const Y_TICKS = [0, 1, 2, 3, 4];

export type ChartSeries = {
  key: string;
  points: { month: number; cents: number }[];
  /** area: filled down to the baseline (or to the `stackOn` series); line: solid stroke; dashed: dashed stroke. */
  kind: 'area' | 'line' | 'dashed';
  color: string;
  stackOn?: string;
};

type Props = {
  series: ChartSeries[];
  /** Series values are stacked totals when `stackOn` is used, so pass the same cents the series carry. */
  hidden: boolean;
  /** YYYY-MM-DD of month 0; gives the x axis calendar years. */
  today?: string;
  targetCents?: number;
  targetLabel?: string;
  markerMonth?: number;
  markerLabel?: string;
  circleMonth?: number;
  accessibilityLabel?: string;
};

/** Smallest of 1, 2, 2.5, 5 times a power of ten that is at least `n` (at least 1). */
function niceMax(n: number): number {
  if (n <= 1) return 1;
  for (let k = 1; ; k *= 10) for (const m of [1, 2, 2.5, 5]) if (m * k >= n) return m * k;
}

/** Shared by every Projections mode: generic series, optional target line, age marker and crossover circle. */
export function ProjectionChart({ series, hidden, today, targetCents, targetLabel, markerMonth, markerLabel, circleMonth, accessibilityLabel }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const lastMonth = Math.max(1, ...series.flatMap(s => s.points.map(p => p.month)));
  const dataMax = Math.max(0, targetCents ?? 0, ...series.flatMap(s => s.points.map(p => p.cents)));
  const max = niceMax(dataMax * 1.05);

  const plotW = width - GUTTER - 8;
  const plotH = HEIGHT - TOP - BOTTOM;
  const base = TOP + plotH;
  const xOf = (m: number) => GUTTER + (m / lastMonth) * plotW;
  const yOf = (c: number) => TOP + plotH - (Math.min(c, max) / max) * plotH;
  const byKey = new Map(series.map(s => [s.key, s]));

  const lower = (s: ChartSeries) => (s.stackOn ? byKey.get(s.stackOn)?.points : undefined);
  const areaPath = (s: ChartSeries) => {
    if (s.points.length === 0) return '';
    const top = s.points.map(p => `${xOf(p.month)},${yOf(p.cents)}`).join(' L');
    const low = lower(s);
    const bottom = low ? [...low].reverse().map(p => `${xOf(p.month)},${yOf(p.cents)}`).join(' L') : `${xOf(s.points[s.points.length - 1]!.month)},${base} L${xOf(s.points[0]!.month)},${base}`;
    return `M${top} L${bottom} Z`;
  };

  const xLabels = [0, 1, 2, 3].map(i => Math.round((lastMonth * i) / 3)).map(m => ({ x: xOf(m), label: today ? String(yearOf(today, m)) : `${Math.round(m / 12)}y` }));
  const circleAt = circleMonth === undefined ? undefined : series.flatMap(s => s.points).find(p => p.month === circleMonth);
  const circleY = circleAt ? Math.max(...series.flatMap(s => s.points.filter(p => p.month === circleMonth).map(p => p.cents))) : 0;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={HEIGHT}>
        {Y_TICKS.map(i => {
          const y = yOf((max * i) / 4);
          return <Line key={i} x1={GUTTER} x2={GUTTER + plotW} y1={y} y2={y} stroke={t.line} strokeWidth={1} strokeDasharray={i === 0 ? undefined : '4 4'} />;
        })}
        {series.map(s =>
          s.kind === 'area' ? (
            <Path key={s.key} d={areaPath(s)} fill={s.color} opacity={s.stackOn ? 0.9 : 1} />
          ) : (
            <Polyline
              key={s.key}
              points={s.points.map(p => `${xOf(p.month)},${yOf(p.cents)}`).join(' ')}
              stroke={s.color}
              strokeWidth={2.5}
              strokeDasharray={s.kind === 'dashed' ? '6 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          ),
        )}
        {targetCents !== undefined ? (
          <Line x1={GUTTER} x2={GUTTER + plotW} y1={yOf(targetCents)} y2={yOf(targetCents)} stroke={accents.orange} strokeWidth={2.5} strokeDasharray="6 4" strokeLinecap="round" />
        ) : null}
        {markerMonth !== undefined && markerMonth <= lastMonth ? <Line x1={xOf(markerMonth)} x2={xOf(markerMonth)} y1={TOP} y2={base} stroke={t.ink} strokeWidth={1} /> : null}
        {circleAt ? <Circle cx={xOf(circleAt.month)} cy={yOf(circleY)} r={9} stroke={accents.orange} strokeWidth={2.5} fill="none" /> : null}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height: HEIGHT }}>
        {Y_TICKS.map(i => (
          <AppText key={`y${i}`} variant="axis" tone="muted" style={{ position: 'absolute', left: 0, width: GUTTER - 6, textAlign: 'right', top: yOf((max * i) / 4) - 8, fontSize: AXIS_FONT }}>
            {formatAudShort(Math.round((max * i) / 4), { hidden })}
          </AppText>
        ))}
        {xLabels.map((l, i) => (
          <AppText key={`x${i}`} variant="axis" tone="muted" style={{ position: 'absolute', width: 40, left: Math.min(Math.max(l.x - 20, 0), width - 40), textAlign: 'center', top: HEIGHT - BOTTOM + 4, fontSize: AXIS_FONT }}>
            {l.label}
          </AppText>
        ))}
        {targetCents !== undefined && targetLabel ? (
          <AppText style={{ position: 'absolute', left: GUTTER + 4, top: yOf(targetCents) - 22, fontFamily: fonts.hand, fontSize: 16, color: accents.orange }}>{targetLabel}</AppText>
        ) : null}
        {markerMonth !== undefined && markerMonth <= lastMonth && markerLabel ? (
          <AppText variant="axis" style={{ position: 'absolute', top: TOP, left: Math.min(xOf(markerMonth) + 4, width - 60), fontSize: 10 }}>{markerLabel}</AppText>
        ) : null}
      </View>
    </View>
  );
}
