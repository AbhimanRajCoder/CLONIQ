'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
    const pathname = usePathname();

    return (
        <motion.aside
            animate={{ width: collapsed ? 72 : 260 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-screen sticky top-0 glass-strong flex flex-col border-r border-white/5 z-50"
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5">
                <div className="w-9 h-9 rounded-lg bg-gradient-accent flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-lg">S</span>
                </div>
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <h1 className="text-base font-bold gradient-text whitespace-nowrap">
                                Structura
                            </h1>
                            <p className="text-[10px] text-slate-500 whitespace-nowrap">
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
                                whileHover={{ scale: 1.02, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer
                  transition-colors duration-200
                  ${isActive
                                        ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
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
                                        className="absolute left-0 w-1 h-6 rounded-r-full bg-gradient-to-b from-purple-500 to-cyan-500"
                                    />
                                )}
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* Collapse toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center justify-center h-12 border-t border-white/5 text-slate-400 hover:text-white transition-colors"
            >
                {collapsed ? (
                    <HiOutlineChevronRight className="w-5 h-5" />
                ) : (
                    <HiOutlineChevronLeft className="w-5 h-5" />
                )}
            </button>
        </motion.aside>
    );
}
