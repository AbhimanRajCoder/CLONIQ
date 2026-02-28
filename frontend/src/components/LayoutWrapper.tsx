'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { ReactNode } from 'react';

export default function LayoutWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isLandingPage = pathname === '/';

    if (isLandingPage) {
        return <main className="w-full min-h-screen bg-black overflow-hidden">{children}</main>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
