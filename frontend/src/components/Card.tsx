'use client';

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { ReactNode, MouseEvent } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
    gradient?: boolean;
    onClick?: () => void;
}

export default function Card({
    children,
    className = '',
    hover = true,
    gradient = false,
    onClick,
}: CardProps) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <motion.div
            whileHover={hover ? { scale: 0.99, filter: 'brightness(1.1)' } : {}}
            whileTap={onClick ? { scale: 0.98 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            className={`
                group relative rounded-2xl p-6 shadow-surface transition-colors
                bg-surface-tertiary border border-surface-border
                ${gradient ? 'border-accent-purple/30 bg-surface-tertiary/80 backdrop-blur-md' : ''}
                ${onClick ? 'cursor-pointer' : ''}
                ${className}
            `}
        >
            {/* Spotlight hover effect */}
            {hover && (
                <motion.div
                    className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover:opacity-100"
                    style={{
                        background: useMotionTemplate`
                            radial-gradient(
                                250px circle at ${mouseX}px ${mouseY}px,
                                rgba(255, 255, 255, 0.08),
                                transparent 80%
                            )
                        `,
                    }}
                />
            )}
            <div className="relative z-10 h-full">{children}</div>
        </motion.div>
    );
}
