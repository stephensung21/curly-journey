import { render, screen } from '@testing-library/react-native';

const nodes = (n: any, out: any[] = []): any[] => {
  if (!n || typeof n === 'string') return out;
  if (Array.isArray(n)) return n.forEach(c => nodes(c, out)), out;
  out.push(n);
  nodes(n.children, out);
  return out;
};
const ofType = (t: string) => nodes(screen.toJSON()).filter(n => n.type === t);
import { ProjectionChart } from '../src/components/ProjectionChart';

const pts = (end: number) => [0, 5, 10].map(m => ({ month: m, cents: (end * m) / 10 }));

it('uses 1/2/5 steps for y ticks', async () => {
  await render(<ProjectionChart hidden={false} series={[{ key: 'a', kind: 'line', color: '#fff', points: pts(160_000_000) }]} />);
  for (const l of ['$0', '$500k', '$1M', '$1.5M', '$2M']) expect(screen.getByText(l)).toBeTruthy();
  expect(screen.queryByText('$625k')).toBeNull();
});

it('draws the crossover circle at the chosen series value', async () => {
  await render(
    <ProjectionChart
      hidden={false}
      circleMonth={10}
      circleSeriesKey="b"
      series={[
        { key: 'a', kind: 'line', color: '#fff', points: pts(160_000_000) },
        { key: 'b', kind: 'line', color: '#f00', points: pts(40_000_000) },
      ]}
    />,
  );
  const c = ofType('RNSVGCircle')[0];
  // plot top 10, height 158, axis max 200M cents: 40M sits 20% up from the baseline.
  expect(c.props.cy).toBeCloseTo(168 - 0.2 * 158, 1);
});

it('lets a series set its opacity', async () => {
  await render(
    <ProjectionChart hidden={false} series={[{ key: 'a', kind: 'area', color: '#fff', opacity: 0.2, points: pts(100) }]} />,
  );
  expect(ofType('RNSVGPath').some((p: any) => p.props.opacity === 0.2)).toBe(true);
});
