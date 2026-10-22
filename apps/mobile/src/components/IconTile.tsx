import { Text, View } from 'react-native';

export function IconTile({ emoji, color, size = 28 }: { emoji: string; color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.54 }}>{emoji}</Text>
    </View>
  );
}
