import { useRouter } from "expo-router";
import { useMemo, useRef, type ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { swipeTarget, type TabName } from "../lib/tabSwipe";

/**
 * Swipe left or right anywhere on a tab to move to the next or previous tab. Vertical drags stay with the page's
 * scroll. `ignore` lets a page keep swipes that start over its own horizontal pager.
 */
export function TabSwipe({
  tab,
  ignore,
  children,
}: {
  tab: TabName;
  ignore?: (startY: number, direction: "left" | "right") => boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const startY = useRef(0);
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-25, 25])
        .failOffsetY([-15, 15])
        .onBegin((e) => {
          startY.current = e.absoluteY;
        })
        .onEnd((e) => {
          if (
            ignoreRef.current?.(
              startY.current,
              e.translationX < 0 ? "left" : "right",
            )
          )
            return;
          const to = swipeTarget(tab, e.translationX, e.velocityX);
          if (to) router.navigate(to);
        }),
    [tab, router],
  );
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}
