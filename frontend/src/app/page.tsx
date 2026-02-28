'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { HiOutlineArrowRight } from 'react-icons/hi';

export default function LandingPage() {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end start'],
    });

    // 3D Tilt effect based on scroll
    const rotateX = useTransform(scrollYProgress, [0, 1], [15, 0]);
    const rotateY = useTransform(scrollYProgress, [0, 1], [-15, 0]);
    const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
    const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

    const transitionSpring = { type: 'spring', stiffness: 400, damping: 30 };

    const lineVariants = {
        hidden: { y: '100%', opacity: 0 },
        visible: (i: number) => ({
            y: 0,
            opacity: 1,
            transition: {
                delay: i * 0.15,
                ...transitionSpring,
            },
        }),
    };

    return (
        <div ref={containerRef} className="relative min-h-[150vh] bg-black text-white selection:bg-purple-500/30 overflow-hidden w-full font-sans">
            {/* Massive Blurred Ambient Glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[80vw] h-[80vw] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen animate-pulse-slow pointer-events-none" />
            <div className="absolute top-[10%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-cyan-500/10 blur-[120px] mix-blend-screen animate-float pointer-events-none" />

            <div className="sticky top-0 h-screen flex flex-col items-center justify-center p-6 sm:p-24 overflow-hidden w-full">
                <main className="z-10 text-center max-w-5xl mx-auto flex flex-col items-center">
                    {/* Masked Hero Typography */}
                    <div className="overflow-hidden mb-2">
                        <motion.h1
                            custom={0}
                            initial="hidden"
                            animate="visible"
                            variants={lineVariants}
                            className="text-6xl sm:text-8xl font-bold tracking-tighter"
                        >
                            CLONIQ
                        </motion.h1>
                    </div>
                    <div className="overflow-hidden mb-6">
                        <motion.h1
                            custom={1}
                            initial="hidden"
                            animate="visible"
                            variants={lineVariants}
                            className="text-6xl sm:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 pb-2"
                        >
                            Code Intelligence
                        </motion.h1>
                    </div>

                    <div className="overflow-hidden mb-12">
                        <motion.p
                            custom={2}
                            initial="hidden"
                            animate="visible"
                            variants={lineVariants}
                            className="text-lg sm:text-xl text-slate-400 max-w-2xl text-center leading-relaxed"
                        >
                            The ultra-premium deterministic analysis engine. Detect structural plagiarism, visualize abstract syntax trees, and uncover deep code similarities.
                        </motion.p>
                    </div>

                    {/* Premium Call to Action */}
                    <motion.div custom={3} initial="hidden" animate="visible" variants={lineVariants}>
                        <motion.button
                            onClick={() => router.push('/upload')}
                            whileHover={{ scale: 1.05, filter: 'brightness(1.2)' }}
                            whileTap={{ scale: 0.95 }}
                            transition={transitionSpring}
                            className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-black font-semibold rounded-full overflow-hidden"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                Enter Structura
                                <HiOutlineArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-400/30 to-cyan-400/30 blur-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.button>
                    </motion.div>
                </main>

                {/* Floating UI Mockup */}
                <motion.div
                    style={{
                        rotateX,
                        rotateY,
                        scale,
                        y,
                        opacity,
                        perspective: 1000,
                    }}
                    className="mt-20 w-full max-w-5xl bg-white/[0.02] border border-white/[0.05] rounded-2xl shadow-[0_0_80px_rgba(168,85,247,0.1)] overflow-hidden relative backdrop-blur-2xl"
                >
                    {/* Mockup Top Bar */}
                    <div className="h-12 border-b border-white/[0.05] bg-black/60 flex items-center px-4 gap-2">
                        <div className="w-3 h-3 rounded-full bg-white/10" />
                        <div className="w-3 h-3 rounded-full bg-white/10" />
                        <div className="w-3 h-3 rounded-full bg-white/10" />
                        <div className="ml-4 flex-1 h-6 bg-white/[0.02] border border-white/[0.05] rounded-md max-w-[200px]" />
                    </div>
                    {/* Mockup Body */}
                    <div className="h-[450px] p-6 grid grid-cols-3 gap-6 bg-black/40">
                        <div className="col-span-2 space-y-4">
                            <div className="h-32 bg-white/[0.02] border border-white/[0.05] rounded-xl relative overflow-hidden">
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-purple-500/10 to-transparent" />
                            </div>
                            <div className="h-56 flex gap-4">
                                <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0,transparent_70%)]" />
                                </div>
                                <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-xl relative overflow-hidden">
                                    <div className="absolute top-4 left-4 right-4 bottom-4 border border-white/[0.05] rounded border-dashed" />
                                </div>
                            </div>
                        </div>
                        <div className="col-span-1 space-y-4">
                            <div className="h-full bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 flex flex-col gap-3">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <div key={i} className="h-8 bg-white/[0.02] border border-white/[0.05] rounded-lg" />
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
