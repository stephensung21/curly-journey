import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Mode } from '../theme/tokens';

export type HomeChart = 'sixMonths' | 'thisMonth';

type SettingsState = {
  themeMode: 'system' | Mode;
  hideBalances: boolean;
  homeChart: HomeChart;
  /** Institution names in the owner's chosen order; banks not listed follow in the default order. */
  bankOrder: string[];
  setThemeMode: (mode: 'system' | Mode) => void;
  setHideBalances: (hidden: boolean) => void;
  setHomeChart: (chart: HomeChart) => void;
  setBankOrder: (order: string[]) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      themeMode: 'system',
      hideBalances: false,
      homeChart: 'sixMonths',
      bankOrder: [],
      setThemeMode: themeMode => set({ themeMode }),
      setHideBalances: hideBalances => set({ hideBalances }),
      setHomeChart: homeChart => set({ homeChart }),
      setBankOrder: bankOrder => set({ bankOrder }),
    }),
    { name: 'curly-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
