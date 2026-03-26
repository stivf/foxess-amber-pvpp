import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useWebSocket } from './src/hooks/useWebSocket';
import { useAppStore } from './src/store';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from './src/services/notifications';

SplashScreen.preventAutoHideAsync();

function AppInner() {
  // Initialize WebSocket connection
  useWebSocket();

  useEffect(() => {
    // Hide splash screen once mounted
    SplashScreen.hideAsync();

    // Set up notification listeners
    const receivedSub = addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    const responseSub = addNotificationResponseListener((response) => {
      console.log('Notification tapped:', response.notification.request.content.title);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return <AppNavigator />;
}

export default function App() {
  const colorScheme = useColorScheme();
  const themeMode = useAppStore(s => s.themeMode);

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && colorScheme === 'dark');

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppInner />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
