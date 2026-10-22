import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Mode } from '../theme/tokens';

export type HomeChart = 'sixMonths' | 'thisMonth';

type SettingsState = {
  themeMode: 'system' | Mode;
  hideBalances: boolean;
  homeChart: HomeChart;
  setThemeMode: (mode: 'system' | Mode) => void;
  setHideBalances: (hidden: boolean) => void;
  setHomeChart: (chart: HomeChart) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      themeMode: 'system',
      hideBalances: false,
      homeChart: 'sixMonths',
      setThemeMode: themeMode => set({ themeMode }),
      setHideBalances: hideBalances => set({ hideBalances }),
      setHomeChart: homeChart => set({ homeChart }),
    }),
    { name: 'curly-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
