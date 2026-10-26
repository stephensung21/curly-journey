import { BackHandler, View } from 'react-native';
import { AppText } from './AppText';
import { BirdLogo } from './BirdLogo';
import { Button } from './Button';
import { HandNote } from './doodles/HandNote';
import { Sheet } from './Sheet';

/** Back on Accounts asks before closing the app. Stay, back again or a tap outside keeps it open. */
export function ExitSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <BirdLogo size={56} />
        <AppText variant="title">Exit Curly Journey?</AppText>
        <HandNote>see you soon</HandNote>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Stay" onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" label="Exit" onPress={() => BackHandler.exitApp()} />
        </View>
      </View>
    </Sheet>
  );
}
