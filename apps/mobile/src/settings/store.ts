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
  /** Spending total also counts mortgage repayments and Amex statement payments. */
  spendingIncludesPayments: boolean;
  /** Net worth also counts the home loan. Off: the loan is left out. */
  netWorthIncludesLoans: boolean;
  setThemeMode: (mode: 'system' | Mode) => void;
  setHideBalances: (hidden: boolean) => void;
  setHomeChart: (chart: HomeChart) => void;
  setBankOrder: (order: string[]) => void;
  setSpendingIncludesPayments: (on: boolean) => void;
  setNetWorthIncludesLoans: (on: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      themeMode: 'system',
      hideBalances: false,
      homeChart: 'sixMonths',
      bankOrder: [],
      spendingIncludesPayments: false,
      netWorthIncludesLoans: false,
      setThemeMode: themeMode => set({ themeMode }),
      setHideBalances: hideBalances => set({ hideBalances }),
      setHomeChart: homeChart => set({ homeChart }),
      setBankOrder: bankOrder => set({ bankOrder }),
      setSpendingIncludesPayments: spendingIncludesPayments => set({ spendingIncludesPayments }),
      setNetWorthIncludesLoans: netWorthIncludesLoans => set({ netWorthIncludesLoans }),
    }),
    { name: 'curly-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
