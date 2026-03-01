'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleAuthCallback = async () => {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Error during auth callback:', error.message);
                router.push('/');
            } else if (data.session) {
                // Successfully logged in
                router.push('/dashboard');
            } else {
                // No session found
                router.push('/');
            }
        };

        handleAuthCallback();
    }, [router]);

    return (
        <div className="flex h-screen items-center justify-center bg-surface-base">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-accent-purple border-t-transparent animate-spin"></div>
                <p className="text-sm text-surface-muted font-mono tracking-wider">AUTHENTICATING...</p>
            </div>
        </div>
    );
}
