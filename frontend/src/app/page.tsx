'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
    HiOutlineArrowRight,
    HiOutlineCode,
    HiOutlineServer,
    HiOutlineShieldCheck,
    HiOutlineDocumentSearch,
    HiOutlineGlobeAlt
} from 'react-icons/hi';
import {
    FiCpu,
    FiLayers,
    FiGitBranch,
    FiTerminal,
    FiActivity,
    FiFileText,
    FiCheckSquare,
    FiAlertTriangle
} from 'react-icons/fi';
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

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-accent-cyan/30">
            {/* Global Progress Line */}
            <div className="fixed top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent-cyan/50 to-transparent z-50" />

            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 h-16 border-b border-white/5 bg-black/60 backdrop-blur-xl z-50 flex items-center justify-between px-6 lg:px-12">
                <div className="flex items-center gap-4">
                    <div className="group relative">
                        <div className="absolute -inset-2 bg-accent-cyan/20 rounded-full blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        <div className="relative w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                            <span className="font-black text-lg text-black italic">C</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold tracking-[0.2em] text-xs text-white uppercase">Cloniq</span>
                        <span className="text-[9px] text-accent-cyan tracking-widest uppercase font-medium">Structural Intelligence</span>
                    </div>
                </div>
                <div className="hidden lg:flex items-center gap-8 text-[11px] uppercase tracking-widest font-semibold text-white/40">
                    <a href="#engine" className="hover:text-accent-cyan transition-colors">Engine</a>
                    <a href="#pipeline" className="hover:text-accent-cyan transition-colors">Pipeline</a>
                    <a href="#enterprise" className="hover:text-accent-cyan transition-colors">Enterprise</a>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={handleSignIn} className="text-[11px] uppercase tracking-wider opacity-60 hover:opacity-100">Sign In</Button>
                    <Button variant="primary" onClick={() => router.push('/upload')} className="text-[11px] uppercase tracking-wider bg-white text-black hover:bg-accent-cyan hover:text-white transition-all px-6">
                        Start Scan
                    </Button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-44 pb-32 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-20">
                <div className="absolute top-20 left-0 w-72 h-72 bg-accent-cyan/10 rounded-full blur-[120px] -z-10" />

                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 space-y-10"
                >
                    <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.2em] font-bold text-accent-cyan">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan"></span>
                        </span>
                        Gemini 2.5 Flash Integration Active
                    </div>

                    <h1 className="text-6xl lg:text-8xl font-bold tracking-tight leading-[0.95] text-white">
                        Analyze <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">Logic,</span> Not Strings.
                    </h1>

                    <p className="text-lg text-white/50 max-w-xl leading-relaxed font-light">
                        Cloniq bypasses surface-level obfuscation. Using AST and DataFlow mapping, we expose structural plagiarism even after variable renaming and logical reordering.
                    </p>

                    <div className="flex flex-wrap gap-5 pt-4">
                        <Button variant="primary" onClick={() => router.push('/upload')} className="h-14 px-8 group relative overflow-hidden bg-accent-cyan text-black font-bold uppercase tracking-widest text-xs">
                            <span className="relative z-10 flex items-center gap-2">
                                Start Neural Scan <HiOutlineArrowRight className="group-hover:translate-x-1 transition-transform" />
                            </span>
                        </Button>
                        <Button variant="secondary" className="h-14 px-8 border-white/10 hover:bg-white/5 uppercase tracking-widest text-xs font-bold">
                            View Methodology
                        </Button>
                    </div>
                </motion.div>

                {/* UNIQUE AST BLUEPRINT VISUALIZER */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1 w-full relative group"
                >
                    <div className="relative z-10 p-1 bg-gradient-to-br from-white/20 to-transparent rounded-3xl backdrop-blur-3xl">
                        <div className="bg-[#0A0A0A] rounded-[22px] overflow-hidden border border-white/10 shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                                <div className="flex gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40" />
                                </div>
                                <div className="text-[10px] font-mono text-white/30 tracking-[0.3em] uppercase">AST Comparison Engine</div>
                            </div>

                            {/* AST Visualization */}
                            <div className="p-8 relative min-h-[500px]">
                                {/* Sample Function */}
                                <div className="mb-8 p-4 rounded-lg bg-white/5 border border-white/5">
                                    <div className="text-[9px] font-mono text-white/40 mb-2 uppercase tracking-wider">Sample Function</div>
                                    <div className="font-mono text-[11px] text-white/70 leading-relaxed">
                                        <span className="text-accent-cyan">def</span> <span className="text-blue-400">calculate_total</span>(<span className="text-orange-400">price</span>, <span className="text-orange-400">quantity</span>):<br />
                                        &nbsp;&nbsp;<span className="text-purple-400">tax</span> = <span className="text-orange-400">price</span> * <span className="text-green-400">0.08</span><br />
                                        &nbsp;&nbsp;<span className="text-purple-400">subtotal</span> = <span className="text-orange-400">price</span> * <span className="text-orange-400">quantity</span><br />
                                        &nbsp;&nbsp;<span className="text-accent-cyan">return</span> <span className="text-purple-400">subtotal</span> + <span className="text-purple-400">tax</span>
                                    </div>
                                </div>

                                {/* AST Tree Diagram */}
                                <div className="relative">
                                    {/* Root Node */}
                                    <div className="flex justify-center mb-8">
                                        <div className="relative group/node">
                                            <div className="absolute -inset-2 bg-accent-cyan/20 rounded-lg blur opacity-0 group-hover/node:opacity-100 transition-opacity"></div>
                                            <div className="relative px-6 py-3 rounded-lg bg-accent-cyan/10 border-2 border-accent-cyan/40">
                                                <div className="text-[10px] font-mono text-accent-cyan font-bold">FunctionDef</div>
                                                <div className="text-[8px] font-mono text-white/40 mt-1">calculate_total</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Connection Lines */}
                                    <svg className="absolute top-12 left-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                                        {/* Root to Parameters */}
                                        <line x1="50%" y1="40" x2="30%" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                                        <line x1="50%" y1="40" x2="70%" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />

                                        {/* Parameters to Body */}
                                        <line x1="30%" y1="160" x2="20%" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                                        <line x1="30%" y1="160" x2="40%" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                                        <line x1="70%" y1="160" x2="60%" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                                        <line x1="70%" y1="160" x2="80%" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                                    </svg>

                                    {/* Level 1: Parameters & Body */}
                                    <div className="flex justify-around mb-12 relative z-10">
                                        <div className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                            <div className="text-[9px] font-mono text-blue-400 font-bold">Parameters</div>
                                        </div>
                                        <div className="px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                                            <div className="text-[9px] font-mono text-purple-400 font-bold">Body</div>
                                        </div>
                                    </div>

                                    {/* Level 2: Details */}
                                    <div className="grid grid-cols-4 gap-4 relative z-10">
                                        {/* Parameter Details */}
                                        <div className="px-3 py-2 rounded bg-orange-500/10 border border-orange-500/20">
                                            <div className="text-[8px] font-mono text-orange-400 font-bold mb-1">Arg</div>
                                            <div className="text-[7px] font-mono text-white/50">price</div>
                                        </div>
                                        <div className="px-3 py-2 rounded bg-orange-500/10 border border-orange-500/20">
                                            <div className="text-[8px] font-mono text-orange-400 font-bold mb-1">Arg</div>
                                            <div className="text-[7px] font-mono text-white/50">quantity</div>
                                        </div>

                                        {/* Body Operations */}
                                        <div className="px-3 py-2 rounded bg-green-500/10 border border-green-500/20">
                                            <div className="text-[8px] font-mono text-green-400 font-bold mb-1">Assign</div>
                                            <div className="text-[7px] font-mono text-white/50">tax = ...</div>
                                        </div>
                                        <div className="px-3 py-2 rounded bg-pink-500/10 border border-pink-500/20">
                                            <div className="text-[8px] font-mono text-pink-400 font-bold mb-1">Return</div>
                                            <div className="text-[7px] font-mono text-white/50">result</div>
                                        </div>
                                    </div>

                                    {/* Comparison Indicator */}
                                    <div className="mt-8 pt-6 border-t border-white/5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                <span className="text-[9px] font-mono text-green-400 uppercase tracking-wider">Structural Match Detected</span>
                                            </div>
                                            <div className="px-3 py-1 rounded bg-red-500/10 border border-red-500/20 text-[9px] text-red-400 font-bold">
                                                96.8% Similarity
                                            </div>
                                        </div>

                                        {/* Matched Clone Example */}
                                        <div className="mt-4 p-4 rounded-lg bg-red-500/5 border border-red-500/10">
                                            <div className="text-[9px] font-mono text-red-400 mb-2 uppercase tracking-wider">Detected Clone</div>
                                            <div className="font-mono text-[11px] text-red-300/70 leading-relaxed">
                                                <span className="text-red-400">def</span> <span className="text-red-300">get_final_price</span>(<span className="text-red-300">cost</span>, <span className="text-red-300">qty</span>):<br />
                                                &nbsp;&nbsp;<span className="text-red-300">sales_tax</span> = <span className="text-red-300">cost</span> * <span className="text-red-300">0.08</span><br />
                                                &nbsp;&nbsp;<span className="text-red-300">total</span> = <span className="text-red-300">cost</span> * <span className="text-red-300">qty</span><br />
                                                &nbsp;&nbsp;<span className="text-red-400">return</span> <span className="text-red-300">total</span> + <span className="text-red-300">sales_tax</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* Comparison Section - "The Shift" */}
            <section id="engine" className="py-32 px-6 lg:px-12 bg-white/5 border-y border-white/5">
                <div className="max-w-6xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl font-bold tracking-tight">Traditional Tools <span className="text-white/30">Miss the Mark.</span></h2>
                            <p className="text-white/50 leading-relaxed italic">
                                "Standard plagiarism detection is easily bypassed by renaming a variable or reordering a function. Cloniq sees the skeleton, not the skin."
                            </p>

                            <div className="space-y-4">
                                <div className="flex items-start gap-4 p-5 rounded-2xl bg-black border border-white/5 group hover:border-accent-cyan/30 transition-all">
                                    <div className="mt-1 p-2 rounded-lg bg-red-500/10 text-red-500"><FiAlertTriangle /></div>
                                    <div>
                                        <h4 className="text-sm font-bold uppercase tracking-wider mb-1">Text-Based Limitations</h4>
                                        <p className="text-xs text-white/40">Fails instantly when variable names change or code is reformatted.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4 p-5 rounded-2xl bg-black border border-white/5 group hover:border-accent-cyan/30 transition-all">
                                    <div className="mt-1 p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan"><FiCheckSquare /></div>
                                    <div>
                                        <h4 className="text-sm font-bold uppercase tracking-wider mb-1">Cloniq Structural Analysis</h4>
                                        <p className="text-xs text-white/40">Maps logic trees (AST) to identify functional similarity regardless of naming conventions.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Variables', status: 'Ignored', icon: <FiLayers /> },
                                { label: 'Structure', status: 'Analyzed', icon: <FiGitBranch /> },
                                { label: 'Control Flow', status: 'Mapped', icon: <FiActivity /> },
                                { label: 'Logic', status: 'Verified', icon: <HiOutlineShieldCheck /> }
                            ].map((item, i) => (
                                <div key={i} className="p-8 rounded-3xl bg-black border border-white/10 flex flex-col items-center text-center gap-4 group hover:bg-white/5 transition-all">
                                    <div className="text-2xl text-accent-cyan group-hover:scale-110 transition-transform">{item.icon}</div>
                                    <div className="space-y-1">
                                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">{item.label}</div>
                                        <div className="text-xs font-mono text-white tracking-widest uppercase">{item.status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Pipeline Section */}
            <section id="pipeline" className="py-32 px-6 lg:px-12 max-w-7xl mx-auto">
                <div className="text-center mb-24 space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight">The Detection Pipeline</h2>
                    <p className="text-white/40 font-mono text-sm tracking-widest uppercase">From raw source to verified results</p>
                </div>

                <div className="grid md:grid-cols-4 gap-4 relative">
                    <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
                    {[
                        { step: '01', title: 'Upload', desc: 'Secure upload via ZIP, GitHub, or Google Sheets batch processing.', icon: <HiOutlineGlobeAlt /> },
                        { step: '02', title: 'Normalize', desc: 'Remove boilerplate, comments, and formatting differences.', icon: <FiLayers /> },
                        { step: '03', title: 'Analyze', desc: 'Multi-layer scoring across AST, CFG, and DataFlow graphs.', icon: <FiCpu /> },
                        { step: '04', title: 'Verify', desc: 'AI-powered semantic review identifies genuine plagiarism cases.', icon: <HiOutlineShieldCheck /> }
                    ].map((s, i) => (
                        <div key={i} className="p-8 rounded-3xl bg-black border border-white/5 hover:border-white/20 transition-all group">
                            <div className="text-4xl font-black text-white/5 mb-6 group-hover:text-accent-cyan/20 transition-colors">{s.step}</div>
                            <div className="mb-4 text-accent-cyan">{s.icon}</div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-3">{s.title}</h3>
                            <p className="text-xs text-white/40 leading-relaxed">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Enterprise Features */}
            <section id="enterprise" className="py-32 px-6 lg:px-12 bg-[#080808] border-t border-white/5">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col lg:flex-row justify-between items-end mb-20 gap-8">
                        <div className="space-y-4">
                            <h2 className="text-4xl font-bold tracking-tight">Built for Scale.</h2>
                            <p className="text-white/40 max-w-lg">Designed for academic institutions, hiring teams, and enterprise security audits.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest">Desktop App</div>
                            <div className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest">Web Dashboard</div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <Card className="col-span-1 md:col-span-2 p-10 bg-white/5 border-white/10 overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-10 opacity-10 text-[12rem] pointer-events-none font-black">AI</div>
                            <HiOutlineShieldCheck className="text-3xl text-accent-cyan mb-8" />
                            <h3 className="text-xl font-bold mb-4">AI-Powered Verification</h3>
                            <p className="text-sm text-white/40 leading-relaxed max-w-md">Our AI layer understands context, distinguishing between standard algorithms and actual plagiarism, reducing false positives by 85%.</p>
                        </Card>

                        <Card className="p-10 bg-black border-white/10">
                            <HiOutlineServer className="text-3xl text-white/40 mb-8" />
                            <h3 className="text-xl font-bold mb-4">Pattern Recognition</h3>
                            <p className="text-sm text-white/40 leading-relaxed">Identify collaboration networks across large datasets using clustering and structural fingerprints.</p>
                        </Card>

                        <Card className="p-10 bg-black border-white/10">
                            <HiOutlineGlobeAlt className="text-3xl text-white/40 mb-8" />
                            <h3 className="text-xl font-bold mb-4">GitHub Integration</h3>
                            <p className="text-sm text-white/40 leading-relaxed">Compare entire repositories or import student submissions via Google Sheets.</p>
                        </Card>

                        <Card className="col-span-1 md:col-span-2 p-10 bg-gradient-to-br from-accent-cyan/10 to-transparent border-white/10">
                            <HiOutlineDocumentSearch className="text-3xl text-white mb-8" />
                            <h3 className="text-xl font-bold mb-4">Professional Reports</h3>
                            <p className="text-sm text-white/40 leading-relaxed max-w-md">Generate comprehensive documentation with side-by-side comparisons, similarity heatmaps, and detailed analysis.</p>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-20 border-t border-white/5 text-center space-y-8">
                <div className="flex justify-center items-center gap-3 grayscale opacity-50">
                    <div className="w-5 h-5 rounded bg-white flex items-center justify-center font-bold text-[10px] text-black">C</div>
                    <span className="text-[10px] font-bold tracking-[0.3em] uppercase">Cloniq Labs</span>
                </div>
                <div className="text-[10px] text-white/20 uppercase tracking-[0.4em]">
                    &copy; {new Date().getFullYear()} Advanced Structural Intelligence &bull; Est. 2026
                </div>
            </footer>
        </div>
    );
}