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
            <div className="mb-12 border-b border-white/[0.05] pb-6">
                <h1 className="text-3xl font-light text-white tracking-tight">Structura Dashboard</h1>
                <p className="text-slate-500 mt-2 font-light">System overview & similarity metrics</p>
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
                {result?.llm_summary && (
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
                <Card hover={false} className="mb-10 text-center py-16 opacity-60">
                    <p className="text-slate-400 font-mono text-sm tracking-wider uppercase">
                        No Analysis Data Present
                    </p>
                    <p className="text-slate-600 font-light mt-2 text-sm">
                        Go to Upload & Analyze to start the engine.
                    </p>
                </Card>
            )}

            {/* Quick start guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">Step 01</span>
                        <div className="w-2 h-2 rounded-full bg-cyan-500/50" />
                    </div>
                    <h3 className="font-medium text-white mb-2">Upload Files</h3>
                    <p className="text-sm text-slate-400 font-light">
                        Upload Python files, ZIP archives, or compare GitHub repositories directly.
                    </p>
                </Card>

                <Card className="col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">Step 02</span>
                        <div className="w-2 h-2 rounded-full bg-purple-500/50" />
                    </div>
                    <h3 className="font-medium text-white mb-2">Analyze</h3>
                    <p className="text-sm text-slate-400 font-light">
                        Our AST-based engine compares structural code topology, bypassing obfuscation.
                    </p>
                </Card>

                <Card className="col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">Step 03</span>
                        <div className="w-2 h-2 rounded-full bg-pink-500/50" />
                    </div>
                    <h3 className="font-medium text-white mb-2">Explore</h3>
                    <p className="text-sm text-slate-400 font-light">
                        Visualize similarity graphs, heatmaps, code clusters, and deep AST trees.
                    </p>
                </Card>
            </div>
        </PageTransition>
    );
}
