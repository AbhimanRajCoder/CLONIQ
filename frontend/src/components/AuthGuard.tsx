'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/Button';
import { HiOutlineLockClosed } from 'react-icons/hi';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const [isLoading, setIsLoading] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setShowLoginModal(true);
            } else {
                setIsLoading(false);
            }
        };

        checkAuth();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                setShowLoginModal(true);
            } else {
                setIsLoading(false);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [router]);

    const handleSignIn = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    if (showLoginModal) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-surface-base border border-surface-border rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
                    >
                        <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center mb-6 border border-surface-border">
                            <HiOutlineLockClosed className="w-8 h-8 text-surface-muted" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Authentication Required</h2>
                        <p className="text-surface-muted text-sm mb-8">
                            Please sign in to access the structural intelligence dashboard and analysis engine.
                        </p>
                        <div className="flex flex-col gap-3 w-full border-t border-surface-border pt-6">
                            <Button variant="primary" onClick={handleSignIn} className="w-full justify-center">
                                Sign In with Google
                            </Button>
                            <Button variant="ghost" onClick={() => router.push('/')} className="w-full justify-center">
                                Return to Home
                            </Button>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-accent-purple border-t-transparent animate-spin"></div>
                    <p className="text-sm text-surface-muted font-mono tracking-wider">VERIFYING SESSION...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
