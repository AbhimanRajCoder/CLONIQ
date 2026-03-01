'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import {
    HiOutlineHome,
    HiOutlineCloudUpload,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
} from 'react-icons/hi';

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    { href: '/upload', label: 'Upload & Analyze', icon: HiOutlineCloudUpload },
];

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const pathname = usePathname();

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
        };
        fetchUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSignIn = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <>
            {/* Invisible flexible spacer to push content */}
            <motion.div
                animate={{ width: collapsed ? 72 : 260 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="shrink-0 h-screen hidden md:block"
            />

            <motion.aside
                animate={{ width: collapsed ? 72 : 260 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="h-screen fixed left-0 top-0 bg-surface-base flex flex-col border-r border-surface-border z-50 overflow-hidden"
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-border">
                    <div className="w-9 h-9 rounded-lg bg-surface-secondary border border-surface-border flex items-center justify-center shrink-0">
                        <span className="text-white font-bold text-lg">C</span>
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <h1 className="text-base font-bold text-white whitespace-nowrap tracking-wide">
                                    CLONIQ
                                </h1>
                                <p className="text-[10px] text-surface-muted whitespace-nowrap uppercase tracking-widest font-semibold mt-0.5">
                                    Code Intelligence
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Nav links */}
                <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link key={item.href} href={item.href}>
                                <motion.div
                                    whileHover={{ x: 4 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer
                  transition-colors duration-200
                  ${isActive
                                            ? 'bg-surface-secondary border border-surface-border text-white shadow-sm'
                                            : 'text-surface-muted hover:text-white hover:bg-surface-secondary/50'
                                        }
                `}
                                >
                                    <item.icon
                                        className={`w-5 h-5 shrink-0 ${isActive ? 'text-accent-purple' : ''
                                            }`}
                                    />
                                    <AnimatePresence>
                                        {!collapsed && (
                                            <motion.span
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="text-sm font-medium whitespace-nowrap"
                                            >
                                                {item.label}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeIndicator"
                                            className="absolute left-0 w-1 h-6 rounded-r-full bg-white"
                                        />
                                    )}
                                </motion.div>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Profile / Auth Section */}
                <div className="border-t border-surface-border p-4 flex flex-col gap-2 relative group overflow-hidden">
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="flex flex-col gap-3 w-full"
                            >
                                {user ? (
                                    <div className="flex items-center gap-3">
                                        <img src={user.user_metadata.avatar_url || 'https://www.gravatar.com/avatar/?d=mp'} alt="Avatar" className="w-8 h-8 rounded-full border border-surface-border object-cover bg-surface-secondary" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-white truncate">{user.user_metadata.full_name || 'User'}</p>
                                            <p className="text-[10px] text-surface-muted truncate">{user.email}</p>
                                        </div>
                                        <button onClick={handleSignOut} className="text-xs text-red-400 hover:text-red-300 transition-colors uppercase font-bold tracking-wider px-2" title="Sign Out">
                                            Out
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={handleSignIn} className="w-full relative overflow-hidden group/btn bg-surface-secondary hover:bg-white text-white hover:text-black transition-all duration-300 border border-surface-border hover:border-white rounded-lg px-4 py-2 flex items-center justify-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-widest relative z-10">Sign In</span>
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {collapsed && user && (
                        <div className="flex justify-center -mb-2">
                            <img src={user.user_metadata.avatar_url || 'https://www.gravatar.com/avatar/?d=mp'} alt="Avatar" className="w-8 h-8 rounded-full border border-surface-border object-cover cursor-pointer hover:ring-2 hover:ring-accent-purple transition-all" onClick={handleSignOut} title="Sign Out" />
                        </div>
                    )}
                    {collapsed && !user && (
                        <div className="flex justify-center -mb-2">
                            <div className="w-8 h-8 rounded-full bg-surface-secondary border border-surface-border flex items-center justify-center cursor-pointer hover:bg-white hover:text-black transition-colors" onClick={handleSignIn} title="Sign In">
                                <span className="text-xs font-bold">In</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center justify-center h-12 border-t border-surface-border text-surface-muted hover:text-white transition-colors"
                >
                    {collapsed ? (
                        <HiOutlineChevronRight className="w-5 h-5" />
                    ) : (
                        <HiOutlineChevronLeft className="w-5 h-5" />
                    )}
                </button>
            </motion.aside>
        </>
    );
}
