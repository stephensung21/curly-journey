import { Image } from 'react-native';

/** The app's lorikeet (concept C, Scribble), drawn on transparent. */
export function BirdLogo({ size = 44 }: { size?: number }) {
  return (
    <Image
      testID="bird-logo"
      accessibilityLabel="Curly Journey lorikeet"
      source={require('../../assets/images/lorikeet.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
