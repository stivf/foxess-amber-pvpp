import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme, spacing, radius } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  leftBorderColor?: string;
  padding?: number;
}

export function Card({ children, style, leftBorderColor, padding = spacing[4] }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.bgSecondary,
          borderColor: theme.borderDefault,
          borderLeftColor: leftBorderColor ?? theme.borderDefault,
          borderLeftWidth: leftBorderColor ? 3 : 1,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
