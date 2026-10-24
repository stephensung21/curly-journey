import { formatAud, formatAudShort } from '@curly/core';
import { useState } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';
import { HandNote } from './doodles/HandNote';

const HEIGHT = 150;
const GUTTER = 44;
const TOP = 8;
const BOTTOM = 22;
const AXIS_FONT = 11;
const FALLBACK_WIDTH = Dimensions.get('window').width - 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TICKS = [0, 1, 2, 3, 4];

type Point = { date: string; totalCents: number };

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Net worth over time: lime area, month labels along the bottom, abbreviated dollars up the side. */
export function NetWorthChart({ history, hideBalances }: { history: Point[]; hideBalances: boolean }) {
  const t = useTheme();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  if (history.length === 0) return null;

  const plotW = width - GUTTER - 8;
  const plotH = HEIGHT - TOP - BOTTOM;
  const values = history.map(p => p.totalCents);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    lo -= 100_000;
    hi += 100_000;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const yOf = (cents: number) => TOP + plotH - ((cents - lo) / (hi - lo)) * plotH;
  const first = dayNumber(history[0]!.date);
  const span = dayNumber(history[history.length - 1]!.date) - first;
  const xOf = (date: string) => GUTTER + (span === 0 ? plotW : ((dayNumber(date) - first) / span) * plotW);
  const single = history.length === 1;

  const pts = history.map(p => ({ x: xOf(p.date), y: yOf(p.totalCents) }));
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0]!.x},${TOP + plotH} L${pts.map(p => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1]!.x},${TOP + plotH} Z`;

  const labelDates = single ? [history[0]!.date] : [history[0]!, history[Math.floor((history.length - 1) / 2)]!, history[history.length - 1]!].map(p => p.date);
  const xLabels = [...new Set(labelDates)].map(d => ({ x: xOf(d), label: MONTHS[Number(d.slice(5, 7)) - 1]! }));
  const last = history[history.length - 1]!;
  const summary = `Net worth ${formatAud(last.totalCents, { hidden: hideBalances, decimals: 'never' })}`;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={summary}>
      <Svg width={width} height={HEIGHT}>
        {TICKS.map(i => {
          const y = yOf(lo + ((hi - lo) * i) / 4);
          return <Line key={i} x1={GUTTER} x2={GUTTER + plotW} y1={y} y2={y} stroke={t.line} strokeWidth={1} strokeDasharray={i === 0 ? undefined : '4 4'} />;
        })}
        {single ? null : <Path d={area} fill={accents.lime} opacity={0.18} />}
        {single ? null : <Polyline points={line} stroke={accents.lime} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />}
        <Circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r={4} fill={accents.lime} />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height: HEIGHT }}>
        {TICKS.map(i => (
          <AppText
            key={`y${i}`}
            variant="axis"
            tone="muted"
            style={{ position: 'absolute', left: 0, width: GUTTER - 6, textAlign: 'right', top: yOf(lo + ((hi - lo) * i) / 4) - 8, fontSize: AXIS_FONT }}
          >
            {formatAudShort(Math.round(lo + ((hi - lo) * i) / 4), { hidden: hideBalances })}
          </AppText>
        ))}
        {xLabels.map(l => (
          <AppText key={`x${l.x}`} variant="axis" tone="muted" style={{ position: 'absolute', width: 40, left: l.x - 20, textAlign: 'center', top: HEIGHT - BOTTOM + 4, fontSize: AXIS_FONT }}>
            {l.label}
          </AppText>
        ))}
      </View>
      {single ? <HandNote style={{ marginTop: 4 }}>History starts today</HandNote> : null}
    </View>
  );
}
