import Svg, { Path } from 'react-native-svg';
import { wobblePath } from './wobble';

/** Two overlapping strokes at different opacity give a grainy crayon edge. */
export function CrayonUnderline({ width, color, seed = 1 }: { width: number; color: string; seed?: number }) {
  return (
    <Svg width={width} height={14} viewBox={`0 0 ${width} 14`}>
      <Path d={wobblePath(width, { seed })} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.85} />
      <Path
        d={wobblePath(width, { seed: seed + 101, amplitude: 2 })}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
    </Svg>
  );
}
