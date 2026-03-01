'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { HiOutlineArrowRight, HiOutlineCode, HiOutlineServer, HiOutlineShieldCheck, HiOutlineDocumentSearch } from 'react-icons/hi';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { supabase } from '@/lib/supabase';

export default function LandingPage() {
    const router = useRouter();

    const handleSignIn = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    const fadeUp = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    return (
        <div className="min-h-screen bg-surface-base text-white font-sans selection:bg-surface-secondary">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 h-16 border-b border-surface-border bg-surface-base/80 backdrop-blur-md z-50 flex items-center justify-between px-6 lg:px-12">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-surface-secondary border border-surface-border flex items-center justify-center">
                        <span className="font-bold text-sm text-white">C</span>
                    </div>
                    <span className="font-bold tracking-wide text-sm text-white">CLONIQ</span>
                </div>
                <div className="flex gap-4">
                    <Button variant="ghost" onClick={handleSignIn}>Sign In</Button>
                    <Button variant="primary" onClick={() => router.push('/upload')}>Start Analysis</Button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-40 pb-24 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
                <motion.div
                    initial="hidden" animate="visible" variants={staggerContainer}
                    className="flex-1 space-y-8"
                >
                    <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-secondary border border-surface-border text-xs font-medium text-surface-muted">
                        <span className="w-2 h-2 rounded-full bg-accent-cyan"></span>
                        Introducing Engine v2.0
                    </motion.div>
                    <motion.h1 variants={fadeUp} className="text-5xl lg:text-7xl font-bold tracking-tight leading-tight text-white">
                        Detect Structural Code Clones, Not Just Text.
                    </motion.h1>
                    <motion.p variants={fadeUp} className="text-lg text-surface-muted max-w-xl leading-relaxed">
                        Intelligence for academic integrity and enterprise security. CLONIQ analyzes code at the structural level using AST, CFG, and DFG to detect logical similarity even when variables are renamed or code is reformatted.
                    </motion.p>
                    <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-4">
                        <Button variant="primary" onClick={() => router.push('/upload')}>
                            Start Analysis <HiOutlineArrowRight />
                        </Button>
                        <Button variant="secondary" onClick={() => {
                            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                            See How It Works
                        </Button>
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex-1 w-full"
                >
                    {/* Animated Mockup */}
                    <div className="relative aspect-square md:aspect-video lg:aspect-square bg-surface-tertiary border border-surface-border rounded-2xl overflow-hidden shadow-surface-md flex flex-col">
                        <div className="h-10 border-b border-surface-border bg-surface-secondary flex items-center px-4 gap-2">
                            <div className="w-3 h-3 rounded-full bg-surface-border" />
                            <div className="w-3 h-3 rounded-full bg-surface-border" />
                            <div className="w-3 h-3 rounded-full bg-surface-border" />
                        </div>
                        <div className="flex-1 p-6 flex flex-col gap-4 relative">
                            {/* Abstract Graph Visualization */}
                            <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <path d="M10,50 Q30,20 50,50 T90,50" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-accent-purple" />
                                <circle cx="10" cy="50" r="2" fill="currentColor" className="text-accent-cyan" />
                                <circle cx="50" cy="50" r="2" fill="currentColor" className="text-accent-cyan" />
                                <circle cx="90" cy="50" r="2" fill="currentColor" className="text-red-500 animate-pulse" />
                            </svg>
                            <div className="flex justify-between items-center relative z-10">
                                <div className="text-xs font-mono text-surface-muted">analysis_job_492.json</div>
                                <div className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded border border-red-500/20 font-medium">98% Match</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 flex-1 mt-4 relative z-10">
                                <div className="bg-surface-secondary border border-surface-border rounded-xl p-4 flex flex-col justify-end">
                                    <div className="w-3/4 h-2 bg-surface-border rounded mb-2"></div>
                                    <div className="w-1/2 h-2 bg-surface-border rounded"></div>
                                </div>
                                <div className="bg-surface-secondary border border-red-500/30 rounded-xl p-4 flex flex-col justify-end relative overflow-hidden">
                                    <div className="absolute inset-0 bg-red-500/5"></div>
                                    <div className="w-3/4 h-2 bg-red-400/50 rounded mb-2 relative z-10"></div>
                                    <div className="w-1/2 h-2 bg-red-400/50 rounded relative z-10"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* The Problem Section */}
            <section className="py-24 px-6 lg:px-12 bg-surface-secondary border-y border-surface-border">
                <div className="max-w-5xl mx-auto divide-y divide-surface-border">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-white">Why Text-Based Tools Fail</h2>
                        <p className="text-surface-muted max-w-2xl mx-auto leading-relaxed">Traditional plagiarism detectors compare raw text. Developers can easily bypass them with simple tricks, leading to false negatives and unfair accusations.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 pt-16">
                        <Card hover={false} className="border-red-500/20 bg-red-500/5 shadow-none">
                            <h3 className="text-lg font-semibold text-red-400 mb-6">The Old Way: Text Matching</h3>
                            <ul className="space-y-4 text-sm text-surface-muted">
                                <li className="flex items-center gap-3"><span className="text-lg">❌</span> Foolable by renamed variables</li>
                                <li className="flex items-center gap-3"><span className="text-lg">❌</span> Bypassed by reordered functions</li>
                                <li className="flex items-center gap-3"><span className="text-lg">❌</span> Fails entirely on code reformatting</li>
                            </ul>
                        </Card>
                        <Card hover={false} className="border-accent-cyan/20 bg-accent-cyan/5 shadow-none">
                            <h3 className="text-lg font-semibold text-accent-cyan mb-6">The CLONIQ Way: Structural</h3>
                            <ul className="space-y-4 text-sm text-surface-muted">
                                <li className="flex items-center gap-3"><span className="text-lg">✅</span> Understands abstract syntax trees</li>
                                <li className="flex items-center gap-3"><span className="text-lg">✅</span> Tracks underlying data and control flow</li>
                                <li className="flex items-center gap-3"><span className="text-lg">✅</span> Confirmed by an AI Semantic Judge</li>
                            </ul>
                        </Card>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto">
                <div className="mb-16 max-w-2xl">
                    <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-white">How CLONIQ Works</h2>
                    <p className="text-surface-muted leading-relaxed">A deterministic, four-step pipeline to establish absolute structural similarity.</p>
                </div>

                <div className="grid md:grid-cols-4 gap-8">
                    {[
                        { step: '01', title: 'Ingest Code', desc: 'Securely upload zip files, GitHub repos, or single documents.' },
                        { step: '02', title: 'Structural Parsing', desc: 'Code is compiled into normalized Abstract Syntax Trees.' },
                        { step: '03', title: 'Tri-Layer Similarity', desc: 'Algorithms compare AST, Control Flow, and Data Flow graphs.' },
                        { step: '04', title: 'AI Verdict', desc: 'An LLM Semantic Judge acts as a final filter for false positives.' },
                    ].map((s, i) => (
                        <div key={i} className="relative group p-6 rounded-2xl border border-surface-border bg-surface-tertiary">
                            <div className="text-5xl font-black text-surface-border mb-6 transition-colors group-hover:text-surface-muted">{s.step}</div>
                            <h3 className="text-lg font-semibold mb-3 text-white">{s.title}</h3>
                            <p className="text-sm text-surface-muted leading-relaxed">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Feature Grid */}
            <section className="py-24 px-6 lg:px-12 bg-surface-secondary border-y border-surface-border">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-16">
                        <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-white">Enterprise-Ready Features</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <Card className="col-span-1 md:col-span-2">
                            <div className="w-12 h-12 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center mb-6 text-accent-cyan shadow-sm">
                                <HiOutlineCode className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3 text-white">AST + CFG + DFG Engine</h3>
                            <p className="text-sm text-surface-muted leading-relaxed max-w-lg">The core deterministic engine evaluates multiple layers of structural logic, ensuring that no obfuscation technique goes unnoticed. Structure always reveals the truth.</p>
                        </Card>
                        <Card>
                            <div className="w-12 h-12 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center mb-6 text-accent-purple shadow-sm">
                                <HiOutlineShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3 text-white">AI Semantic Judge</h3>
                            <p className="text-sm text-surface-muted leading-relaxed">Automated filtering of template code and boilerplate using targeted LLM verification.</p>
                        </Card>
                        <Card>
                            <div className="w-12 h-12 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center mb-6 text-white shadow-sm">
                                <HiOutlineServer className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3 text-white">Cluster Detection</h3>
                            <p className="text-sm text-surface-muted leading-relaxed">Identify organized cheating rings by clustering high-similarity submissions across massive cohorts.</p>
                        </Card>
                        <Card className="col-span-1 md:col-span-2">
                            <div className="w-12 h-12 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center mb-6 text-white shadow-sm">
                                <HiOutlineDocumentSearch className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3 text-white">Batch Google Sheets & PDF Reports</h3>
                            <p className="text-sm text-surface-muted leading-relaxed max-w-lg">Export clean, actionable data directly to Google Sheets or generate irrefutable PDF reports for academic tribunals and HR code reviews.</p>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Audience Segment */}
            <section className="py-32 px-6 lg:px-12 max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-white">Built for Scale and Authority</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['Universities', 'Coding Platforms', 'Enterprises', 'Hiring Teams'].map((audience, i) => (
                        <div key={i} className="h-32 rounded-2xl border border-surface-border bg-surface-tertiary flex items-center justify-center text-surface-muted hover:text-white hover:border-surface-muted transition-all cursor-default shadow-sm">
                            <span className="font-semibold tracking-wide">{audience}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-surface-border text-center text-sm text-surface-muted">
                <p>&copy; {new Date().getFullYear()} CLONIQ. Structural Code Intelligence.</p>
            </footer>
        </div>
    );
}
