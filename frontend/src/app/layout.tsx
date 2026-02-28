import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import LayoutWrapper from '@/components/LayoutWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
    title: 'Structura – Structural Code Intelligence',
    description: 'Ultra-premium deterministic code analysis engine.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
            <body className="bg-black text-slate-200 antialiased font-sans font-light selection:bg-purple-500/30 selection:text-white">
                <Providers>
                    <LayoutWrapper>
                        {children}
                    </LayoutWrapper>
                </Providers>
            </body>
        </html>
    );
}
