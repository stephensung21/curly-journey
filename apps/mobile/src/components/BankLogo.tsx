import { institutionGroup } from '@curly/core';
import { Image, type ImageSourcePropType } from 'react-native';

const logos: Record<string, ImageSourcePropType> = {
  CommBank: require('../../assets/banks/commbank.png'),
  Amex: require('../../assets/banks/amex.png'),
  Up: require('../../assets/banks/up.png'),
};

/** Small bank icon for a known institution; nothing for any other. */
export function BankLogo({ institution, size = 18 }: { institution: string; size?: number }) {
  const source = logos[institutionGroup(institution)];
  if (!source) return null;
  return <Image source={source} fadeDuration={0} accessibilityElementsHidden style={{ width: size, height: size, borderRadius: 4 }} />;
}
