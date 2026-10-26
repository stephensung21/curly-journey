import { View } from 'react-native';
import { AppText } from './AppText';
import { BirdLogo } from './BirdLogo';

/** A tab's title with the lorikeet at the right. */
export function PageTitle({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="title">{children}</AppText>
      <BirdLogo />
    </View>
  );
}
