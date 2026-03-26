import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const DEVICE_ID_KEY = 'battery_brain_device_id';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('battery-brain', {
      name: 'Battery Brain',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const result = await api.registerDevice(token, platform);
    await AsyncStorage.setItem(DEVICE_ID_KEY, result.device_id);
  } catch (err) {
    console.error('Failed to register device for push notifications:', err);
  }

  return token;
}

export async function unregisterPushNotifications(): Promise<void> {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) {
    try {
      await api.unregisterDevice(deviceId);
      await AsyncStorage.removeItem(DEVICE_ID_KEY);
    } catch (err) {
      console.error('Failed to unregister device:', err);
    }
  }
}

export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void,
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
