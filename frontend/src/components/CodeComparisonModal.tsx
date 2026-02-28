'use client';

import { motion } from 'framer-motion';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import {
    HiOutlineSparkles,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle,
    HiOutlineInformationCircle,
    HiTrendingDown,
    HiTrendingUp
} from 'react-icons/hi';
import Modal from './Modal';
import { SuspiciousPair } from '@/types';

SyntaxHighlighter.registerLanguage('python', python);

interface CodeComparisonModalProps {
    isOpen: boolean;
    onClose: () => void;
    pair: SuspiciousPair | null;
}

export default function CodeComparisonModal({
    isOpen,
    onClose,
    pair,
}: CodeComparisonModalProps) {
    if (!pair) return null;

    const structuralScore = pair.similarity_score;
    const refined = pair.refined_verdict;
    const llm = pair.llm_verdict;

    // Determine risk variant for UI
    const riskLevel = refined?.refined_risk_level || 'UNKNOWN';
    const isHighRisk = ['CRITICAL', 'HIGH'].includes(riskLevel);
    const isMediumRisk = riskLevel === 'MEDIUM';
    const isLowRisk = ['LOW', 'NONE'].includes(riskLevel);

    const scoreColor =
        structuralScore >= 0.8
            ? 'text-red-400'
            : structuralScore >= 0.6
                ? 'text-amber-400'
                : 'text-green-400';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Code Comparison" maxWidth="max-w-7xl">
            {/* Header info */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between p-4 glass rounded-xl">
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-400">
                            <span className="text-white font-medium">{pair.file1}</span>
                            <span className="mx-2">↔</span>
                            <span className="text-white font-medium">{pair.file2}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <div className={`text-xl font-bold ${scoreColor}`}>
                            {(structuralScore * 100).toFixed(1)}% Structural Similarity
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                            AST + CFG + DataFlow Analysis
                        </div>
                    </div>
                </div>

                {/* AI Semantic Verdict Section (Only if present) */}
                {refined && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative overflow-hidden p-5 rounded-xl border ${isHighRisk ? 'border-red-500/30 bg-red-500/5' :
                            isMediumRisk ? 'border-amber-500/30 bg-amber-500/5' :
                                'border-emerald-500/30 bg-emerald-500/5'
                            } glass`}
                    >
                        {/* Sparkle background icon */}
                        <HiOutlineSparkles className="absolute -right-4 -top-4 text-7xl opacity-[0.03] rotate-12" />

                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-2">
                                    <HiOutlineSparkles className={isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'} />
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-white/90">
                                        Gemini AI Semantic Judge
                                    </h3>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isHighRisk ? 'bg-red-500/20 text-red-300' :
                                        isMediumRisk ? 'bg-amber-500/20 text-amber-300' :
                                            'bg-emerald-500/20 text-emerald-300'
                                        }`}>
                                        {refined.llm_confidence} CONFIDENCE
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs text-slate-400 uppercase font-medium">Refined Verdict:</span>
                                        <span className={`text-lg font-black tracking-tight ${isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'
                                            }`}>
                                            {refined.refined_classification.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed italic border-l-2 border-white/10 pl-3">
                                        &quot;{refined.recommendation}&quot;
                                    </p>
                                </div>

                                {refined.algorithm_detected !== 'NONE' && (
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                                        <HiOutlineInformationCircle className="text-blue-400" />
                                        <span className="text-xs text-slate-300">
                                            Algorithm Detected: <span className="text-white font-semibold underline decoration-blue-500/50">{refined.algorithm_detected}</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex md:flex-col items-center md:items-end gap-4 md:gap-1.5 shrink-0">
                                <div className="flex flex-col items-end">
                                    <div className="text-[10px] text-slate-500 uppercase font-bold">AI Adjusted Score</div>
                                    <div className="flex items-center gap-2">
                                        {refined.ai_adjusted_similarity_score !== undefined && refined.ai_adjusted_similarity_score < structuralScore && (
                                            <HiTrendingDown className="text-emerald-400" />
                                        )}
                                        {refined.ai_adjusted_similarity_score !== undefined && refined.ai_adjusted_similarity_score > structuralScore && (
                                            <HiTrendingUp className="text-red-400" />
                                        )}
                                        <span className="text-3xl font-black text-white tracking-tighter">
                                            {((refined.ai_adjusted_similarity_score ?? structuralScore) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-slate-500 max-w-[120px] text-right leading-tight">
                                    {llm?.ai_adjusted_similarity_score !== undefined && Math.abs(llm.ai_adjusted_similarity_score - structuralScore) > 0.01
                                        ? `Adjusted by ${(Math.abs(llm.ai_adjusted_similarity_score - structuralScore) * 100).toFixed(1)}% from base`
                                        : 'No adjustment applied to structural score'}
                                </div>
                            </div>
                        </div>

                        {/* Analysis Detail */}
                        <div className="mt-4 pt-4 border-t border-white/5">
                            <details className="group">
                                <summary className="text-[10px] text-slate-500 uppercase font-bold cursor-pointer hover:text-slate-300 transition-colors list-none flex items-center gap-1">
                                    <span>Detailed Semantic Reasoning</span>
                                    <span className="transition-transform group-open:rotate-180">▼</span>
                                </summary>
                                <div className="mt-2 p-3 rounded-lg bg-black/20 text-xs text-slate-400 leading-relaxed font-mono">
                                    {refined.reasoning}
                                </div>
                            </details>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Matching regions */}
            <div className="flex items-center gap-2 mb-4 px-1">
                <div className="h-px flex-1 bg-white/5"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                    Detected Matching AST Regions
                </span>
                <div className="h-px flex-1 bg-white/5"></div>
            </div>

            {pair.matching_regions.length === 0 ? (
                <p className="text-slate-400 text-center py-8 italic opacity-50 underline decoration-slate-800">No structural matching regions found.</p>
            ) : (
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {pair.matching_regions.slice(0, 20).map((region, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-colors"
                        >
                            <div className="px-4 py-2 bg-white/[0.02] flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                                    Fragment {idx + 1}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    Lines {region.file1_lines[0]}-{region.file1_lines[1]} ↔ {region.file2_lines[0]}-{region.file2_lines[1]}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                                {/* File 1 */}
                                <div>
                                    <div className="px-4 py-1.5 bg-purple-500/10 text-[10px] text-purple-300 font-bold uppercase tracking-tight">
                                        Source: {pair.file1.split('/').pop()}
                                    </div>
                                    <div className="p-3 text-sm syntax-highlighter-dark">
                                        <SyntaxHighlighter
                                            language="python"
                                            style={atomOneDark}
                                            showLineNumbers
                                            startingLineNumber={region.file1_lines[0]}
                                            customStyle={{
                                                background: 'transparent',
                                                padding: 0,
                                                margin: 0,
                                                fontSize: '12px',
                                            }}
                                            lineNumberStyle={{ color: '#4b5563', minWidth: '2.5em', userSelect: 'none' }}
                                        >
                                            {region.file1_code.map((l) => l.code).join('\n')}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>

                                {/* File 2 */}
                                <div>
                                    <div className="px-4 py-1.5 bg-cyan-500/10 text-[10px] text-cyan-300 font-bold uppercase tracking-tight">
                                        Target: {pair.file2.split('/').pop()}
                                    </div>
                                    <div className="p-3 text-sm syntax-highlighter-dark">
                                        <SyntaxHighlighter
                                            language="python"
                                            style={atomOneDark}
                                            showLineNumbers
                                            startingLineNumber={region.file2_lines[0]}
                                            customStyle={{
                                                background: 'transparent',
                                                padding: 0,
                                                margin: 0,
                                                fontSize: '12px',
                                            }}
                                            lineNumberStyle={{ color: '#4b5563', minWidth: '2.5em', userSelect: 'none' }}
                                        >
                                            {region.file2_code.map((l) => l.code).join('\n')}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </Modal>
    );
}

