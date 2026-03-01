'use client';

import { motion } from 'framer-motion';
import {
    HiOutlineDocumentText,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineCollection,
    HiOutlineSparkles,
} from 'react-icons/hi';
import PageTransition from '@/components/PageTransition';
import StatsCard from '@/components/StatsCard';
import Card from '@/components/Card';
import { useAnalysis } from '@/store/AnalysisContext';

export default function DashboardPage() {
    const { result, hasResult } = useAnalysis();

    const totalFiles = result?.summary.total_files ?? 0;
    const suspiciousPairs = result?.summary.suspicious_pairs_count ?? 0;
    const highestScore = result?.summary.highest_similarity ?? 0;
    const clusterCount = result?.summary.cluster_count ?? 0;

    return (
        <PageTransition>
            {/* Minimal Dashboard Header */}
            <div className="mb-10 border-b border-surface-border pb-6 flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Intelligence Dashboard</h1>
                    <p className="text-surface-muted mt-1 text-sm">System overview & similarity metrics</p>
                </div>
                {hasResult && (
                    <div className="text-xs font-mono text-surface-muted bg-surface-secondary px-3 py-1.5 rounded border border-surface-border">
                        System Active: Engine v2.0
                    </div>
                )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                <StatsCard
                    label="Total Analyzed"
                    value={totalFiles}
                    icon={<HiOutlineDocumentText className="w-5 h-5" />}
                    color="cyan"
                />
                <StatsCard
                    label="Suspicious Pairs"
                    value={suspiciousPairs}
                    icon={<HiOutlineExclamation className="w-5 h-5" />}
                    color="pink"
                />
                <StatsCard
                    label="Peak Similarity"
                    value={highestScore * 100}
                    suffix="%"
                    icon={<HiOutlineLightningBolt className="w-5 h-5" />}
                    color="amber"
                    decimals={1}
                />
                <StatsCard
                    label="Detected Clusters"
                    value={clusterCount}
                    icon={<HiOutlineCollection className="w-5 h-5" />}
                    color="purple"
                />

                {/* AI Semantic Summary if available */}
                {result?.llm_summary && result.llm_summary.pairs_evaluated_by_llm > 0 && (
                    <StatsCard
                        label="AI Verified LIKELY COPY"
                        value={result.llm_summary.likely_copy_count}
                        icon={<HiOutlineSparkles className="w-5 h-5 text-purple-400" />}
                        color="purple"
                    />
                )}
            </div>

            {/* Status message */}
            {!hasResult && (
                <Card hover={false} className="mb-10 text-center py-16 opacity-80 border-dashed">
                    <p className="text-surface-muted font-mono text-xs tracking-wider uppercase mb-2">
                        System Standby Mode
                    </p>
                    <p className="text-white font-medium text-sm">
                        No active intelligence gathered. Go to Upload & Analyze to start the engine.
                    </p>
                </Card>
            )}

            {hasResult && (
                <div className="mb-10">
                    <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Recent Activity Logs</h3>
                    <div className="bg-surface-tertiary border border-surface-border rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-surface-secondary border-b border-surface-border text-surface-muted font-medium">
                                <tr>
                                    <th className="px-6 py-3">Analysis ID</th>
                                    <th className="px-6 py-3">Target Dataset</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3 text-right">Risk Level</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-border text-surface-muted">
                                <tr className="hover:bg-surface-secondary/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-accent-cyan">JOB_{Math.floor(Math.random() * 10000).toString().padStart(4, '0')}</td>
                                    <td className="px-6 py-4">Current Session Upload</td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-accent-cyan/10 text-accent-cyan text-xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan"></span> Completed
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-white font-medium">{highestScore > 0.8 ? 'Critical' : highestScore > 0.5 ? 'Elevated' : 'Nominal'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Quick start guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 border-t-2 border-t-accent-cyan/50 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-surface-muted font-bold">Phase 01</span>
                    </div>
                    <h3 className="font-semibold text-white mb-2">Ingestion</h3>
                    <p className="text-sm text-surface-muted leading-relaxed">
                        Upload Python files, ZIP archives, or compare GitHub repositories via structural extraction.
                    </p>
                </Card>

                <Card className="col-span-1 border-t-2 border-t-accent-purple/50 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-surface-muted font-bold">Phase 02</span>
                    </div>
                    <h3 className="font-semibold text-white mb-2">Processing</h3>
                    <p className="text-sm text-surface-muted leading-relaxed">
                        AST graphs are compiled and normalized to bypass raw text obfuscation.
                    </p>
                </Card>

                <Card className="col-span-1 border-t-2 border-t-pink-500/50 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-surface-muted font-bold">Phase 03</span>
                    </div>
                    <h3 className="font-semibold text-white mb-2">Intelligence</h3>
                    <p className="text-sm text-surface-muted leading-relaxed">
                        Visualize deep similarities, review AI Semantic verdicts, and export batch reports.
                    </p>
                </Card>
            </div>
        </PageTransition>
    );
}
