import { createContext, useContext } from 'react';

/**
 * Lets a control that drags sideways (a slider) stop the tabs from swiping while a finger is on it.
 * Outside the tabs it does nothing.
 */
export const SwipeLock = createContext<(locked: boolean) => void>(() => {});

export function useSwipeLock() {
  return useContext(SwipeLock);
}
