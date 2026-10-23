import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, PanResponder } from 'react-native';

export const SWIPE_THRESHOLD = 120;

/** Drag a card sideways; past ±120 px it fires onSwipeRight/onSwipeLeft, otherwise it snaps back. */
export function SwipeCard({
  children,
  onSwipeRight,
  onSwipeLeft,
}: {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const reduce = useRef(false);
  const cb = useRef({ onSwipeRight, onSwipeLeft });
  cb.current = { onSwipeRight, onSwipeLeft };

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then(v => {
        if (live) reduce.current = v;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => {
      reduce.current = v;
    });
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => x.setValue(g.dx),
        onPanResponderRelease: (_, g) => {
          const { onSwipeRight: right, onSwipeLeft: left } = cb.current;
          if (g.dx > SWIPE_THRESHOLD && right) right();
          else if (g.dx < -SWIPE_THRESHOLD) left();
          if (reduce.current) x.setValue(0);
          else Animated.timing(x, { toValue: 0, duration: 180, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => x.setValue(0),
      }),
    [x],
  );

  const rotate = x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-4deg', '0deg', '4deg'] });
  return (
    <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }, { rotate }] }}>
      {children}
    </Animated.View>
  );
}
