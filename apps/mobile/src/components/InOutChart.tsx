import { formatAud, formatAudShort } from '@curly/core';
import { useState } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import type { DailyPoint, InOutMonth } from '../api/types';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

const HEIGHT = 140;
const GUTTER = 40;
const TOP = 8;
const BOTTOM = 22;
const AXIS_FONT = 11;
const FALLBACK_WIDTH = Dimensions.get('window').width - 60;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Props =
  | { mode: 'sixMonths'; data: InOutMonth[]; hideBalances: boolean; onHero?: boolean; daysInMonth?: number }
  | { mode: 'thisMonth'; data: DailyPoint[]; hideBalances: boolean; onHero?: boolean; daysInMonth?: number };

/** Smallest of 1, 2, 2.5, 5 times a power of ten that is at least `cents`; $100 when zero. */
export function niceMax(cents: number): number {
  if (cents <= 0) return 10000;
  for (let k = 1; ; k *= 10) {
    for (const m of [1, 2, 2.5, 5]) if (m * k >= cents) return m * k;
  }
}

const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;

export function InOutChart({ mode, data, hideBalances, onHero = false, daysInMonth }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [picked, setPicked] = useState<string | null>(null);

  const cIn = onHero ? t.inkOnAccent : t.ink;
  const cMortgage = accents.blue;
  const cSpend = onHero ? accents.cream : accents.spendRed;
  const grid = onHero ? 'rgba(22,19,31,0.3)' : t.line;

  const rows = data as (InOutMonth | DailyPoint)[];
  const dataMax = Math.max(0, ...rows.flatMap(r => [r.inCents, mode === 'sixMonths' ? r.mortgageCents + r.spendingCents : Math.max(r.mortgageCents, r.spendingCents)]));
  const max = niceMax(dataMax);
  const plotW = width - GUTTER - 4;
  const plotH = HEIGHT - TOP - BOTTOM;
  const yOf = (cents: number) => TOP + plotH - (cents / max) * plotH;
  const fmtShort = (c: number) => formatAudShort(c, { hidden: hideBalances });
  const fmtWhole = (c: number) => formatAud(c, { hidden: hideBalances, decimals: 'never' });

  let xLabels: { x: number; label: string }[] = [];
  let marks: React.ReactNode = null;
  let summary = '';

  if (mode === 'sixMonths') {
    const months = data as InOutMonth[];
    const group = plotW / Math.max(months.length, 1);
    const barW = Math.min(16, group * 0.3);
    xLabels = months.map((m, i) => ({ x: GUTTER + group * (i + 0.5), label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]!.slice(0, 3) }));
    marks = months.map((m, i) => {
      const opacity = i === months.length - 1 ? 0.6 : 1;
      const gx = GUTTER + group * i;
      const inX = gx + group / 2 - barW - 1;
      const outX = gx + group / 2 + 1;
      const bar = (x: number, from: number, to: number, fill: string, key: string) => (
        <Rect key={key} x={x} y={yOf(to)} width={barW} height={Math.max(0, yOf(from) - yOf(to))} fill={fill} opacity={opacity} />
      );
      return [
        bar(inX, 0, m.inCents, cIn, `in${i}`),
        bar(outX, 0, m.mortgageCents, cMortgage, `m${i}`),
        bar(outX, m.mortgageCents, m.mortgageCents + m.spendingCents, cSpend, `s${i}`),
        <Rect
          key={`hit${i}`}
          x={gx}
          y={TOP}
          width={group}
          height={plotH}
          fill="transparent"
          accessibilityLabel={monthName(m.month)}
          onPress={() => setPicked(m.month)}
        />,
      ];
    });
    const last = months[months.length - 1];
    if (last) summary = `${monthName(last.month)}: in ${fmtWhole(last.inCents)}, mortgage ${fmtWhole(last.mortgageCents)}, spending ${fmtWhole(last.spendingCents)}`;
  } else {
    const days = data as DailyPoint[];
    const total = Math.max(daysInMonth ?? 0, days[days.length - 1]?.day ?? 1, 2);
    const xOf = (day: number) => GUTTER + ((day - 1) / (total - 1)) * plotW;
    xLabels = [...new Set([1, 8, 15, 22, total])].filter(d => d <= total).map(d => ({ x: xOf(d), label: String(d) }));
    const line = (pick: (d: DailyPoint) => number, stroke: string, key: string) =>
      days.length ? <Polyline key={key} points={days.map(d => `${xOf(d.day)},${yOf(pick(d))}`).join(' ')} stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" /> : null;
    marks = [line(d => d.inCents, cIn, 'in'), line(d => d.mortgageCents, cMortgage, 'm'), line(d => d.spendingCents, cSpend, 's')];
    const last = days[days.length - 1];
    if (last) summary = `So far this month: in ${fmtWhole(last.inCents)}, mortgage ${fmtWhole(last.mortgageCents)}, spending ${fmtWhole(last.spendingCents)}`;
  }

  const pickedRow = mode === 'sixMonths' && picked ? (data as InOutMonth[]).find(m => m.month === picked) : undefined;
  const legend: [string, string][] = [['In', cIn], ['Mortgage', cMortgage], ['Spending', cSpend]];

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={summary || 'Money in and out chart'}>
      <Svg width={width} height={HEIGHT}>
        {[0, 1, 2, 3, 4].map(i => (
          <Line
            key={i}
            x1={GUTTER}
            x2={GUTTER + plotW}
            y1={yOf((max * i) / 4)}
            y2={yOf((max * i) / 4)}
            stroke={grid}
            strokeWidth={1}
            strokeDasharray={i === 0 ? undefined : '4 4'}
          />
        ))}
        {marks}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height: HEIGHT }}>
        {[0, 1, 2, 3, 4].map(i => (
          <AppText
            key={`y${i}`}
            variant="axis"
            tone={onHero ? 'onAccent' : 'muted'}
            style={{ position: 'absolute', left: 0, width: GUTTER - 6, textAlign: 'right', top: yOf((max * i) / 4) - 8, fontSize: AXIS_FONT }}
          >
            {fmtShort((max * i) / 4)}
          </AppText>
        ))}
        {xLabels.map(l => (
          <AppText
            key={`x${l.label}`}
            variant="axis"
            tone={onHero ? 'onAccent' : 'muted'}
            style={{ position: 'absolute', width: 40, left: l.x - 20, textAlign: 'center', top: HEIGHT - BOTTOM + 4, fontSize: AXIS_FONT }}
          >
            {l.label}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, paddingLeft: GUTTER, marginTop: 4 }}>
        {legend.map(([label, color]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: onHero && color === accents.cream ? 1 : 0, borderColor: t.inkOnAccent }} />
            <AppText variant="axis" tone={onHero ? 'onAccent' : 'muted'}>
              {label}
            </AppText>
          </View>
        ))}
      </View>
      {pickedRow ? (
        <AppText variant="label" tone={onHero ? 'onAccent' : 'ink'} style={{ marginTop: 6 }}>
          {`${monthName(pickedRow.month)}: in ${fmtWhole(pickedRow.inCents)} · mortgage ${fmtWhole(pickedRow.mortgageCents)} · spending ${fmtWhole(pickedRow.spendingCents)}`}
        </AppText>
      ) : null}
    </View>
  );
}
