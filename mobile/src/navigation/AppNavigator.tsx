import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { StrategyScreen } from '../screens/StrategyScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type TabParamList = {
  Dashboard: undefined;
  Strategy: undefined;
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

type TabIconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof TabParamList, { focused: TabIconName; unfocused: TabIconName }> = {
  Dashboard: { focused: 'home', unfocused: 'home-outline' },
  Strategy: { focused: 'analytics', unfocused: 'analytics-outline' },
  History: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
  Settings: { focused: 'settings', unfocused: 'settings-outline' },
};

export function AppNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const iconSet = TAB_ICONS[route.name as keyof TabParamList];
          const iconName = focused ? iconSet.focused : iconSet.unfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.bgPrimary,
          borderTopColor: theme.borderDefault,
          paddingBottom: Platform.OS === 'ios' ? 0 : 4,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Strategy" component={StrategyScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
