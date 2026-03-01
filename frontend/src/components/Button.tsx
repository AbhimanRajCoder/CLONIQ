'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: 'primary' | 'secondary' | 'ghost';
    className?: string;
    type?: 'button' | 'submit';
}

export default function Button({
    children,
    onClick,
    disabled = false,
    loading = false,
    variant = 'primary',
    className = '',
    type = 'button',
}: ButtonProps) {
    const baseStyles = 'inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
        primary: 'bg-white text-black hover:bg-gray-100 shadow-surface hover:shadow-surface-md',
        secondary: 'bg-surface-secondary border border-surface-border text-white hover:bg-surface-tertiary shadow-sm',
        ghost: 'text-surface-muted hover:text-white hover:bg-surface-secondary',
    };

    return (
        <motion.button
            whileHover={!disabled ? { scale: 1.03 } : {}}
            whileTap={!disabled ? { scale: 0.97 } : {}}
            onClick={onClick}
            disabled={disabled || loading}
            type={type}
            className={`${baseStyles} ${variants[variant]} ${className}`}
        >
            {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            )}
            {children}
        </motion.button>
    );
}
