import { useState, type ReactElement, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { clamp, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { moveItem } from '../lib/moveItem';
import { useTheme } from '../theme/useTheme';

type Props<T> = {
  items: readonly T[];
  keyOf: (item: T) => string | number;
  /** `handle` is the drag grip: put it in the row; dragging starts after a long press on it. */
  renderItem: (item: T, ctx: { index: number; handle: ReactElement }) => ReactNode;
  onReorder: (items: T[]) => void;
};

function Row({
  index, count, height, drag, over, dragY, children, onMeasure, onDrop,
}: {
  index: number;
  count: number;
  height: number;
  drag: SharedValue<number>;
  over: SharedValue<number>;
  dragY: SharedValue<number>;
  children: (grip: ReactElement) => ReactNode;
  onMeasure: (e: LayoutChangeEvent) => void;
  onDrop: (from: number, to: number) => void;
}) {
  const t = useTheme();
  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      drag.value = index;
      over.value = index;
      dragY.value = 0;
    })
    .onUpdate(e => {
      dragY.value = e.translationY;
      over.value = clamp(Math.round(index + e.translationY / height), 0, count - 1);
    })
    .onFinalize(() => {
      if (drag.value === index) {
        const to = over.value;
        drag.value = -1;
        dragY.value = 0;
        if (to !== index) runOnJS(onDrop)(index, to);
      }
    });

  const style = useAnimatedStyle(() => {
    const d = drag.value;
    const o = over.value;
    if (d === index) return { transform: [{ translateY: dragY.value }], zIndex: 2, opacity: 0.9 };
    let shift = 0;
    if (d >= 0 && d < o && index > d && index <= o) shift = -height;
    else if (d >= 0 && o < d && index >= o && index < d) shift = height;
    return { transform: [{ translateY: shift }], zIndex: 0, opacity: 1 };
  });

  const grip = (
    <GestureDetector gesture={pan}>
      <View accessible={false} hitSlop={8} style={{ paddingHorizontal: 6 }}>
        <Text style={{ fontSize: 22, color: t.inkMuted }}>≡</Text>
      </View>
    </GestureDetector>
  );
  return (
    <Animated.View onLayout={onMeasure} style={style}>
      {children(grip)}
    </Animated.View>
  );
}

/**
 * Vertical list of fixed-height rows reordered by long-press dragging a handle.
 * Row height is measured once from the first row; every row must be that tall.
 */
export function SortableList<T>({ items, keyOf, renderItem, onReorder }: Props<T>) {
  const [height, setHeight] = useState(0);
  const drag = useSharedValue(-1);
  const over = useSharedValue(-1);
  const dragY = useSharedValue(0);

  return (
    <View>
      {items.map((item, index) => (
        <Row
          key={keyOf(item)}
          index={index}
          count={items.length}
          height={height || 1}
          drag={drag}
          over={over}
          dragY={dragY}
          onMeasure={e => {
            if (!height) setHeight(e.nativeEvent.layout.height);
          }}
          onDrop={(from, to) => onReorder(moveItem(items, from, to))}
        >
          {grip => renderItem(item, { index, handle: grip })}
        </Row>
      ))}
    </View>
  );
}
