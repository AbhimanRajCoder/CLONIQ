'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface StatsCardProps {
    label: string;
    value: number;
    icon: ReactNode;
    suffix?: string;
    color?: 'purple' | 'cyan' | 'pink' | 'amber';
    decimals?: number;
}

export default function StatsCard({
    label,
    value,
    icon,
    suffix = '',
    color = 'purple',
    decimals = 0,
}: StatsCardProps) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const duration = 1500;
        const steps = 60;
        const stepDuration = duration / steps;
        let current = 0;
        const increment = value / steps;

        const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
                setDisplayValue(value);
                clearInterval(timer);
            } else {
                setDisplayValue(current);
            }
        }, stepDuration);

        return () => clearInterval(timer);
    }, [value]);

    const colorMap = {
        purple: 'from-purple-500/20 to-purple-500/5 text-purple-400',
        cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-400',
        pink: 'from-pink-500/20 to-pink-500/5 text-pink-400',
        amber: 'from-amber-500/20 to-amber-500/5 text-amber-400',
    };

    const iconColorMap = {
        purple: 'bg-purple-500/20 text-purple-400',
        cyan: 'bg-cyan-500/20 text-cyan-400',
        pink: 'bg-pink-500/20 text-pink-400',
        amber: 'bg-amber-500/20 text-amber-400',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.03, y: -4 }}
            className={`glass rounded-2xl p-5 bg-gradient-to-br ${colorMap[color]} shadow-glass-sm`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${iconColorMap[color]}`}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">
                {decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue)}
                {suffix}
            </p>
            <p className="text-sm text-slate-400">{label}</p>
        </motion.div>
    );
}
