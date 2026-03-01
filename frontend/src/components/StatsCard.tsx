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
        purple: '', // we removed backgrounds
        cyan: '',
        pink: '',
        amber: '',
    };

    const iconColorMap = {
        purple: 'bg-surface-secondary text-accent-purple border border-surface-border',
        cyan: 'bg-surface-secondary text-accent-cyan border border-surface-border',
        pink: 'bg-surface-secondary text-pink-400 border border-surface-border',
        amber: 'bg-surface-secondary text-amber-400 border border-surface-border',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="bg-surface-tertiary border border-surface-border rounded-2xl p-5 shadow-surface transition-all"
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
