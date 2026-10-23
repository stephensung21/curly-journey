import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

/** Bottom sheet: dimmed backdrop (tap to close), grab handle, rounded top corners. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
        <View
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            padding: 16,
            paddingTop: 10,
            gap: 12,
            maxHeight: '85%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.line }} />
          {children}
        </View>
      </View>
    </Modal>
  );
}
