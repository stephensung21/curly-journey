import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, usePathname } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { useEffect, type ComponentProps } from 'react';
import { BackHandler, type ColorValue, Dimensions } from 'react-native';
import { TabBar } from '../../src/components/TabBar';
import { confirmExit, shouldConfirmExit } from '../../src/lib/exitConfirm';
import { useTheme } from '../../src/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(testName: string, name: IconName) {
  return ({ color }: { color: ColorValue }) => (
    <Ionicons testID={`tab-icon-${testName}`} name={name} size={24} color={color as string} />
  );
}

export default function TabLayout() {
  const t = useTheme();
  const navigation = useNavigation();
  const pathname = usePathname();
  // Back on Accounts would close the app; ask first. Other tabs go back to Accounts as before.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!shouldConfirmExit(navigation.isFocused(), pathname)) return false;
      confirmExit();
      return true;
    });
    return () => sub.remove();
  }, [navigation, pathname]);
  // Swipeable tabs: a sideways drag slides the next tab in under your finger. The bar sits at the bottom.
  return (
    <TopTabs
      tabBarPosition="bottom"
      // Knowing the width up front lets every tab render before the first layout pass.
      initialLayout={{ width: Dimensions.get('window').width }}
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        // Mount every tab up front and paint the scene in the app colour, so switching tabs never flashes.
        lazy: false,
        lazyPreloadDistance: 3,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <TopTabs.Screen name="index" options={{ title: 'Accounts', tabBarIcon: tabIcon('accounts', 'wallet-outline') }} />
      <TopTabs.Screen name="spending" options={{ title: 'Spending', tabBarIcon: tabIcon('spending', 'pie-chart-outline') }} />
      <TopTabs.Screen
        name="projections"
        options={{ title: 'Projections', tabBarIcon: tabIcon('projections', 'trending-up-outline') }}
      />
      <TopTabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('more', 'ellipsis-horizontal-circle-outline') }} />
    </TopTabs>
  );
}
