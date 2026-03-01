import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-inter)', 'sans-serif'],
                mono: ['var(--font-mono)', 'monospace'],
            },
            colors: {
                surface: {
                    base: '#000000', // Base background
                    secondary: '#0a0a0a', // Sub-panels
                    tertiary: '#121212', // Cards and elevated elements
                    border: '#27272a', // Subtle borders
                    muted: '#a1a1aa', // Muted text
                },
                dark: {
                    900: '#000000',
                    800: '#0a0a0a',
                    700: '#121212',
                    600: '#27272a',
                },
                accent: {
                    purple: '#a855f7',
                    cyan: '#06b6d4',
                    pink: '#ec4899',
                },
            },
            backgroundImage: {
                'gradient-accent': 'linear-gradient(135deg, #a855f7, #06b6d4)',
                'gradient-accent-hover': 'linear-gradient(135deg, #9333ea, #0891b2)',
                'gradient-card': 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(6,182,212,0.1))',
            },
            boxShadow: {
                'surface': '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
                'surface-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
                'glass': '0 4px 24px 0 rgba(0, 0, 0, 0.3)',
                'glass-sm': '0 2px 10px 0 rgba(0, 0, 0, 0.2)',
                'glow-accent': '0 0 15px rgba(168, 85, 247, 0.15)',
            },
            animation: {
                'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                'fade-in': 'fade-in 0.3s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
