import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import LayoutWrapper from '@/components/LayoutWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
    title: 'CLONIQ | Structural Code Intelligence',
    description: 'Ultra-premium deterministic code analysis engine providing structural plagiarism detection using AST, CFG, and DFG layers.',
    keywords: ['Code Plagiarism', 'AST Analysis', 'Structural Intelligence', 'CLONIQ', 'Code Similarities', 'Code Clones', 'Code Checker'],
    authors: [{ name: 'CLONIQ Team' }],
    openGraph: {
        title: 'CLONIQ | Structural Code Intelligence',
        description: 'Detect structural code clones matching on semantic logic instead of pure text. Premium deterministic code analysis engine.',
        url: 'https://cloniq.com',
        siteName: 'CLONIQ',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'CLONIQ - Structural Code Intelligence',
        description: 'Ultra-premium deterministic code analysis engine for academic integrity and enterprise security.',
    },
    robots: {
        index: true,
        follow: true,
    }
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
