'use client';

import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
}

export default function LoadingSpinner({
    size = 'md',
    text = 'Analyzing...',
}: LoadingSpinnerProps) {
    const sizes = {
        sm: 'w-8 h-8',
        md: 'w-16 h-16',
        lg: 'w-24 h-24',
    };

    return (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className={`${sizes[size]} rounded-full border-2 border-transparent`}
                style={{
                    borderTopColor: '#a855f7',
                    borderRightColor: '#06b6d4',
                    borderBottomColor: '#a855f7',
                }}
            />
            {text && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-sm text-slate-400 font-medium"
                >
                    {text}
                </motion.p>
            )}
        </div>
    );
}
