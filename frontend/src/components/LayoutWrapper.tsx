'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';

export default function LayoutWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isLandingPage = pathname === '/';
    const isAuthRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/upload');

    if (isLandingPage || pathname.startsWith('/auth/callback')) {
        return <main className="w-full min-h-screen bg-black overflow-hidden">{children}</main>;
    }

    const content = (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );

    return isAuthRoute ? <AuthGuard>{content}</AuthGuard> : content;
}
