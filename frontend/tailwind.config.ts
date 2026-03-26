import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Price heat-map colors
        price: {
          cheap3: '#064E3B',
          cheap2: '#059669',
          cheap1: '#34D399',
          neutral: '#6B7280',
          expensive1: '#F87171',
          expensive2: '#DC2626',
          expensive3: '#991B1B',
        },
        // Battery state colors
        battery: {
          charging: '#059669',
          discharging: '#DC2626',
          idle: '#6B7280',
          full: '#059669',
          high: '#34D399',
          mid: '#FBBF24',
          low: '#F87171',
          critical: '#991B1B',
        },
        // Energy source colors
        energy: {
          solar: '#EAB308',
          battery: '#06B6D4',
          house: '#3B82F6',
          grid: '#EC4899',
        },
        // Profile colors
        profile: {
          conservative: '#3B82F6',
          balanced: '#8B5CF6',
          aggressive: '#F59E0B',
          custom: '#EC4899',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.07)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
      },
      animation: {
        'pulse-gentle': 'pulse-gentle 2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'pulse-gentle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
