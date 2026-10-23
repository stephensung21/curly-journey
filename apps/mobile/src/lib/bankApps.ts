import { institutionGroup } from '@curly/core';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

export type BankApp = { label: string; androidPackage: string };

// Keep in sync with plugins/withBankAppQueries.js (asserted in __tests__/open-bank-app.test.tsx).
export const BANK_APPS: Record<string, BankApp> = {
  CommBank: { label: 'CommBank', androidPackage: 'com.commbank.netbank' },
  Amex: { label: 'Amex', androidPackage: 'com.americanexpress.android.acctsvcs.au' },
  Up: { label: 'Up', androidPackage: 'au.com.up.money' },
};

export function bankAppFor(institution: string): BankApp | null {
  return BANK_APPS[institutionGroup(institution)] ?? null;
}

// Launch the bank's app, else its Play Store page. Never moves money.
export async function openBankApp(app: BankApp): Promise<void> {
  try {
    await IntentLauncher.openApplication(app.androidPackage);
    return;
  } catch {
    // not installed
  }
  try {
    await Linking.openURL(`market://details?id=${app.androidPackage}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${app.androidPackage}`);
  }
}
