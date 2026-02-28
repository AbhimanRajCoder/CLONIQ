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
                dark: {
                    900: '#000000',
                    800: '#050505',
                    700: '#0a0a0a',
                    600: '#141414',
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
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.25)',
                'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
                'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.3)',
            },
            animation: {
                'gradient-x': 'gradient-x 3s ease infinite',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                'gradient-x': {
                    '0%, 100%': { 'background-position': '0% 50%' },
                    '50%': { 'background-position': '100% 50%' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
