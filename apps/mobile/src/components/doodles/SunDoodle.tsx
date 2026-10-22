import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/useTheme';

const RAYS = ['M23,4 L23.6,12', 'M8,12 L13,17.4', 'M38,12 L33.2,17', 'M4,26 L12,25.2', 'M42,26 L34,25.4'];

export function SunDoodle({ size = 46 }: { size?: number }) {
  const { strokeYellow } = useTheme();
  return (
    <Svg width={size} height={(size * 40) / 46} viewBox="0 0 46 40">
      {RAYS.map(d => (
        <Path key={d} d={d} stroke={strokeYellow} strokeWidth={2.5} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
