'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    HiOutlineCloudUpload,
    HiOutlineFolder,
    HiOutlineLink,
    HiOutlineTable,
    HiOutlineShare,
    HiOutlineViewGrid,
    HiOutlineCollection,
    HiOutlineCode,
    HiOutlineChartBar,
    HiOutlineChevronRight,
    HiOutlineChevronDown,
    HiOutlineAdjustments,
    HiOutlineRefresh,
    HiOutlineLightningBolt,
    HiOutlineTemplate,
    HiOutlineFingerPrint,
    HiOutlineSparkles,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle,
    HiOutlineDownload,
    HiOutlineUserGroup,
} from 'react-icons/hi';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import Button from '@/components/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import CodeComparisonModal from '@/components/CodeComparisonModal';
import { analyzeFiles, compareZips, compareGithubRepos, analyzeGoogleSheet, visualizeAST, structureSummary, getAnalysisAst } from '@/services/api';
import { useAnalysis } from '@/store/AnalysisContext';
import { SuspiciousPair, ASTTreeNode, VisualizeASTResponse, StructureSummaryResponse } from '@/types';
import { generatePdfReport } from '@/utils/generatePdfReport';
import SimilarityGraph from '@/components/SimilarityGraph';

type UploadMode = 'files' | 'zip' | 'github' | 'gsheet';
type VisTab = 'pairs' | 'graph' | 'heatmap' | 'clusters' | 'ast' | 'structure';

// ── AST tree node colors ───────────────────────────────────
const nodeColors: Record<string, string> = {
    Module: '#a855f7', FunctionDef: '#06b6d4', AsyncFunctionDef: '#06b6d4',
    ClassDef: '#ec4899', If: '#f59e0b', For: '#10b981', While: '#10b981',
    Return: '#64748b', Assign: '#8b5cf6', Call: '#f97316', Name: '#94a3b8',
    Constant: '#6366f1', arguments: '#06b6d4', arg: '#06b6d4', BinOp: '#f43f5e',
    Compare: '#f59e0b', Expr: '#94a3b8', Import: '#3b82f6', ImportFrom: '#3b82f6',
};

function getNodeColor(name: string): string {
    return nodeColors[name] || '#64748b';
}

function TreeNode({ node, depth }: { node: ASTTreeNode; depth: number }) {
    const [expanded, setExpanded] = useState(depth < 3);
    const hasChildren = node.children && node.children.length > 0;
    const color = getNodeColor(node.name);

    return (
        <div className="ml-4">
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 py-0.5 group cursor-pointer"
                onClick={() => hasChildren && setExpanded(!expanded)}
            >
                {hasChildren ? (
                    <span className="w-4 h-4 flex items-center justify-center text-surface-muted">
                        {expanded ? <HiOutlineChevronDown className="w-3 h-3" /> : <HiOutlineChevronRight className="w-3 h-3" />}
                    </span>
                ) : (
                    <span className="w-4 h-4 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    </span>
                )}
                <span className="text-sm font-mono px-1.5 py-0.5 rounded group-hover:bg-surface-secondary transition-colors" style={{ color }}>
                    {node.name}
                </span>
                {hasChildren && <span className="text-[10px] text-surface-muted ml-1">({node.children!.length})</span>}
            </motion.div>
            <AnimatePresence>
                {expanded && hasChildren && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-l border-surface-border ml-2 pl-2"
                    >
                        {node.children!.map((child, idx) => (
                            <TreeNode key={`${child.name}-${idx}`} node={child} depth={depth + 1} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


// ═════════════════════════════════════════════════════════════
//  Continuous heatmap colour: HSL-based gradient
//  0.0 → dark blue, 0.5 → purple, 0.7 → amber, 0.9+ → red
// ═════════════════════════════════════════════════════════════

function getHeatColor(score: number): string {
    if (score <= 0) return 'rgba(30, 41, 59, 0.5)';
    if (score >= 1.0) return 'rgba(239, 68, 68, 1.0)';

    // Continuous interpolation through 4 colour stops
    const stops = [
        { t: 0.0, r: 30, g: 58, b: 138, a: 0.25 },   // dark navy
        { t: 0.3, r: 6, g: 182, b: 212, a: 0.45 },    // cyan
        { t: 0.5, r: 168, g: 85, b: 247, a: 0.65 },   // purple
        { t: 0.7, r: 245, g: 158, b: 11, a: 0.80 },    // amber
        { t: 0.9, r: 239, g: 68, b: 68, a: 0.95 },     // red
        { t: 1.0, r: 239, g: 68, b: 68, a: 1.0 },      // bright red
    ];

    // Find the two stops to interpolate between
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (score >= stops[i].t && score <= stops[i + 1].t) {
            lo = stops[i];
            hi = stops[i + 1];
            break;
        }
    }

    const pct = (hi.t - lo.t) > 0 ? (score - lo.t) / (hi.t - lo.t) : 0;
    const r = Math.round(lo.r + (hi.r - lo.r) * pct);
    const g = Math.round(lo.g + (hi.g - lo.g) * pct);
    const b = Math.round(lo.b + (hi.b - lo.b) * pct);
    const a = +(lo.a + (hi.a - lo.a) * pct).toFixed(2);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ═════════════════════════════════════════════════════════════
//  MAIN UPLOAD PAGE
// ═════════════════════════════════════════════════════════════

export default function UploadPage() {
    const { result, setResult } = useAnalysis();

    const [mode, setMode] = useState<UploadMode>('files');
    const [loading, setLoading] = useState(false);
    const [selectedPair, setSelectedPair] = useState<SuspiciousPair | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<VisTab>('pairs');

    // File inputs
    const [pyFiles, setPyFiles] = useState<File[]>([]);
    const [zip1, setZip1] = useState<File | null>(null);
    const [zip2, setZip2] = useState<File | null>(null);
    const [repoUrl1, setRepoUrl1] = useState('');
    const [repoUrl2, setRepoUrl2] = useState('');
    const [gsheetUrl, setGsheetUrl] = useState('');

    // AST and Structure states abstracted to panel components


    // Heatmap tooltip
    const heatmapRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{
        x: number; y: number; file1: string; file2: string; score: number;
    } | null>(null);

    // ── Handlers ─────────────────────────────────────────────

    const handleAnalyze = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let data;
            if (mode === 'files') {
                if (pyFiles.length < 2) { setError('Please select at least 2 Python files.'); setLoading(false); return; }
                data = await analyzeFiles(pyFiles);
            } else if (mode === 'zip') {
                if (!zip1 || !zip2) { setError('Please select two ZIP files.'); setLoading(false); return; }
                data = await compareZips(zip1, zip2);
            } else if (mode === 'github') {
                if (!repoUrl1 || !repoUrl2) { setError('Please enter both GitHub repository URLs.'); setLoading(false); return; }
                data = await compareGithubRepos(repoUrl1, repoUrl2);
            } else {
                if (!gsheetUrl.trim()) { setError('Please enter a Google Sheets URL.'); setLoading(false); return; }
                data = await analyzeGoogleSheet(gsheetUrl.trim());
            }
            setResult(data);
            setActiveTab('pairs');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Analysis failed. Is the backend running?';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [mode, pyFiles, zip1, zip2, repoUrl1, repoUrl2, gsheetUrl, setResult]);

    // AST and Structure handlers abstracted to panel components
    // Force-directed graph logic is now encapsulated within the SimilarityGraph component.

    // ── Direct data reads (no recomputation) ────────────────
    const pairs = result?.similarity.pairs ?? [];
    const matrixData = result?.similarity.matrix ?? null;
    const clusters = result?.similarity.clusters ?? [];
    const totalFiles = result?.summary.total_files ?? 0;

    // ── Pure display helpers (no data transformation) ────────

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-red-400 bg-red-500/10 border-red-500/20';
        if (score >= 0.6) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        return 'text-green-400 bg-green-500/10 border-green-500/20';
    };

    const shortName = (name: string) => {
        const parts = name.split('/');
        return parts[parts.length - 1]?.slice(0, 14) || name.slice(0, 14);
    };

    const getSeverityColor = (avg: number) => {
        if (avg >= 0.9) return 'from-red-500/20 to-red-600/10 border-red-500/30';
        if (avg >= 0.8) return 'from-amber-500/20 to-amber-600/10 border-amber-500/30';
        return 'from-purple-500/20 to-cyan-500/10 border-purple-500/30';
    };

    const getBadgeColor = (avg: number) => {
        if (avg >= 0.9) return 'bg-red-500/20 text-red-400 border-red-500/30';
        if (avg >= 0.8) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    };

    const modeButtons: { id: UploadMode; label: string; icon: typeof HiOutlineCloudUpload }[] = [
        { id: 'files', label: 'Python Files', icon: HiOutlineCloudUpload },
        { id: 'zip', label: 'ZIP Archives', icon: HiOutlineFolder },
        { id: 'github', label: 'GitHub Repos', icon: HiOutlineLink },
        { id: 'gsheet', label: 'Google Sheet', icon: HiOutlineTable },
    ];

    const visTabs: { id: VisTab; label: string; icon: typeof HiOutlineCloudUpload }[] = [
        { id: 'pairs', label: 'Suspicious Pairs', icon: HiOutlineExclamationCircle },
        { id: 'graph', label: 'Similarity Graph', icon: HiOutlineShare },
        { id: 'heatmap', label: 'Heatmap', icon: HiOutlineViewGrid },
        { id: 'clusters', label: 'Clusters', icon: HiOutlineCollection },
        { id: 'ast', label: 'AST Viewer', icon: HiOutlineCode },
        { id: 'structure', label: 'Structure', icon: HiOutlineChartBar },
    ];

    // ═════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════

    return (
        <PageTransition>
            <div className="mb-10 border-b border-surface-border pb-6 flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Ingestion Engine</h1>
                    <p className="text-surface-muted mt-1 text-sm">Upload code files, detect structural similarities, and explore results</p>
                </div>
            </div>

            {/* ── Step Tracker ──────────────────────────────── */}
            <div className="flex items-center gap-4 mb-8">
                <div className={`flex items-center gap-2 ${!loading && !result ? 'text-white' : 'text-surface-muted'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${!loading && !result ? 'bg-accent-cyan text-black' : 'bg-surface-secondary border border-surface-border'}`}>1</div>
                    <span className="text-sm font-semibold tracking-wide">Upload</span>
                </div>
                <div className="w-8 h-[1px] bg-surface-border"></div>
                <div className={`flex items-center gap-2 ${loading ? 'text-white' : 'text-surface-muted'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${loading ? 'bg-accent-purple text-white animate-pulse' : 'bg-surface-secondary border border-surface-border'}`}>2</div>
                    <span className="text-sm font-semibold tracking-wide">Analyze</span>
                </div>
                <div className="w-8 h-[1px] bg-surface-border"></div>
                <div className={`flex items-center gap-2 ${result && !loading ? 'text-white' : 'text-surface-muted'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${result && !loading ? 'bg-emerald-400 text-black' : 'bg-surface-secondary border border-surface-border'}`}>3</div>
                    <span className="text-sm font-semibold tracking-wide">Review</span>
                </div>
            </div>

            {/* ── Mode selector ──────────────────────────────── */}
            <div className="flex flex-wrap gap-2 mb-8 bg-surface-tertiary p-1.5 rounded-xl border border-surface-border inline-flex">
                {modeButtons.map((btn) => (
                    <motion.button
                        key={btn.id}
                        whileHover={{ scale: 0.98, filter: 'brightness(1.1)' }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        onClick={() => { setMode(btn.id); setError(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === btn.id ? 'bg-surface-secondary text-white shadow-sm border border-surface-border' : 'bg-transparent text-surface-muted border border-transparent hover:text-white hover:bg-surface-secondary/50'}`}
                    >
                        <btn.icon className="w-4 h-4" />
                        {btn.label}
                    </motion.button>
                ))}
            </div>

            {/* ── Upload area ────────────────────────────────── */}
            <Card className="mb-8" hover={false}>
                <div className="mb-6 pb-6 border-b border-white/[0.05] border-dashed">
                    {mode === 'files' && (
                        <div>
                            <label className="block mb-3 text-sm font-semibold text-white tracking-wide">Select code files (.py, .js, .jsx, .ts, .tsx)</label>
                            <div className="relative group cursor-pointer border border-dashed border-surface-border rounded-xl p-10 text-center transition-all hover:border-surface-muted hover:bg-surface-tertiary/50 bg-surface-base">
                                <input type="file" multiple accept=".py,.js,.jsx,.ts,.tsx" onChange={(e) => setPyFiles(Array.from(e.target.files || []))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <HiOutlineCloudUpload className="w-8 h-8 mx-auto mb-3 text-slate-500 group-hover:text-white transition-colors" />
                                <p className="text-sm text-slate-400 font-light group-hover:text-white transition-colors">Drag and drop or click to browse</p>
                            </div>
                            {pyFiles.length > 0 && <p className="mt-4 text-xs font-mono text-purple-400 uppercase tracking-widest">{pyFiles.length} file(s) selected</p>}
                        </div>
                    )}
                    {mode === 'zip' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block mb-3 text-sm font-semibold text-white tracking-wide">User 1 ZIP archive</label>
                                <div className="relative group cursor-pointer border border-dashed border-surface-border rounded-xl p-10 text-center transition-all hover:border-surface-muted hover:bg-surface-tertiary/50 bg-surface-base">
                                    <input type="file" accept=".zip" onChange={(e) => setZip1(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    <HiOutlineFolder className="w-6 h-6 mx-auto mb-2 text-slate-500 group-hover:text-purple-400 transition-colors" />
                                    <p className="text-xs text-slate-500 font-mono text-center">
                                        {zip1 ? zip1.name : 'Select ZIP 1'}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className="block mb-3 text-sm font-semibold text-white tracking-wide">User 2 ZIP archive</label>
                                <div className="relative group cursor-pointer border border-dashed border-surface-border rounded-xl p-10 text-center transition-all hover:border-surface-muted hover:bg-surface-tertiary/50 bg-surface-base">
                                    <input type="file" accept=".zip" onChange={(e) => setZip2(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    <HiOutlineFolder className="w-6 h-6 mx-auto mb-2 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                                    <p className="text-xs text-slate-500 font-mono text-center">
                                        {zip2 ? zip2.name : 'Select ZIP 2'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {mode === 'github' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block mb-3 text-sm font-semibold text-white tracking-wide">Repository 1 URL</label>
                                <input type="url" placeholder="https://github.com/user/repo" value={repoUrl1} onChange={(e) => setRepoUrl1(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-base border border-surface-border text-white text-sm focus:border-accent-purple focus:outline-none focus:ring-1 focus:ring-accent-purple placeholder-surface-muted transition-all font-mono" />
                            </div>
                            <div>
                                <label className="block mb-3 text-sm font-semibold text-white tracking-wide">Repository 2 URL</label>
                                <input type="url" placeholder="https://github.com/user/repo" value={repoUrl2} onChange={(e) => setRepoUrl2(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-base border border-surface-border text-white text-sm focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan placeholder-surface-muted transition-all font-mono" />
                            </div>
                        </div>
                    )}
                    {mode === 'gsheet' && (
                        <div>
                            <label className="block mb-2 text-sm font-medium text-slate-400">Public Google Sheets URL</label>
                            <div className="space-y-3">
                                <input
                                    type="url"
                                    placeholder="https://docs.google.com/spreadsheets/d/..."
                                    value={gsheetUrl}
                                    onChange={(e) => setGsheetUrl(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-black border border-white/10 text-white text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600 transition-all font-mono shadow-inner"
                                />
                                <div className="glass rounded-lg p-3 border border-white/5">
                                    <div className="flex items-start gap-2">
                                        <HiOutlineTable className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                        <div className="text-[11px] text-slate-400 space-y-1">
                                            <p className="text-slate-300 font-medium">Required columns in your sheet:</p>
                                            <div className="flex flex-wrap gap-2">
                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-emerald-400">name</span>
                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-emerald-400">urn</span>
                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-emerald-400">github_url</span>
                                            </div>
                                            <p className="text-slate-500 mt-1">Sheet must be shared as &ldquo;Anyone with the link can view&rdquo;. Max 100 repos.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-xs font-mono text-red-500 uppercase tracking-widest">{error}</motion.p>}
                </div>
                <div className="flex justify-end">
                    <motion.button
                        onClick={handleAnalyze}
                        disabled={loading}
                        whileHover={{ scale: 0.98, filter: 'brightness(1.2)' }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="px-6 py-2.5 bg-white text-black font-medium text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                    >
                        {loading
                            ? (mode === 'gsheet' ? 'Fetching repos & analyzing batch...' : 'Initializing Engine...')
                            : (mode === 'gsheet' ? 'Run Batch Analysis' : 'Run Analysis')
                        }
                    </motion.button>
                </div>
            </Card>

            {loading && <LoadingSpinner text={mode === 'gsheet' ? 'Downloading sheet, fetching repos, running structural + AI analysis...' : 'Processing files with AST engine...'} />}

            {/* ═══════════════════════════════════════════════════
                 TOOLS & RESULTS SECTION
                 Tab bar is ALWAYS visible.
                 • All tabs require an analysis result
                ═══════════════════════════════════════════════════ */}

            {!loading && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {/* ── Analysis ID & AI Summary badges ── */}
                    {result && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-slate-600 font-mono glass px-2 py-0.5 rounded border border-white/5">
                                ID: {result.analysis_id.slice(0, 8)}… | {totalFiles} files | {result.metadata.analysis_type}
                            </span>

                            {result.llm_summary && result.llm_summary.pairs_evaluated_by_llm > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-2 px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/5"
                                >
                                    <HiOutlineSparkles className="w-2.5 h-2.5 text-purple-400" />
                                    <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">
                                        Gemini AI Verified: {result.llm_summary.pairs_evaluated_by_llm} Pairs
                                    </span>
                                    {result.llm_summary.likely_copy_count > 0 && (
                                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 rounded-sm font-black">
                                            {result.llm_summary.likely_copy_count} LIKELY COPIES
                                        </span>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* ── Tab bar ────────────────────────────────── */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                        {visTabs.map((tab) => {
                            // All tabs require result
                            const isDisabled = !result;

                            return (
                                <motion.button
                                    key={tab.id}
                                    whileHover={isDisabled ? {} : { scale: 1.03 }}
                                    whileTap={isDisabled ? {} : { scale: 0.97 }}
                                    onClick={() => !isDisabled && setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                                        ? 'bg-gradient-accent text-white shadow-glow-purple'
                                        : isDisabled
                                            ? 'glass text-slate-600 cursor-not-allowed opacity-40'
                                            : 'glass text-slate-400 hover:text-white'
                                        }`}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                    {isDisabled && <span className="text-[9px] ml-1 opacity-60">🔒</span>}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* ══ Suspicious Pairs ════════════════════════ */}
                    {activeTab === 'pairs' && result && (
                        <div>
                            {/* ── Batch Students Overview ──────────── */}
                            {result.batch_metadata && result.batch_metadata.students.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-6"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <HiOutlineUserGroup className="w-4 h-4 text-emerald-400" />
                                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                                                Students Analyzed
                                            </h3>
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {result.batch_metadata.students.length} repositories
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                        {result.batch_metadata.students.map((s, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: i * 0.02 }}
                                                className="glass rounded-lg p-2.5 border border-white/5 hover:border-white/15 transition-colors"
                                            >
                                                <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                                                <p className="text-[10px] text-slate-500 font-mono truncate">{s.urn}</p>
                                                <p className="text-[10px] text-emerald-400/70 mt-1">{s.files_count} files</p>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {result.batch_metadata.fetch_errors.length > 0 && (
                                        <div className="mt-3 glass rounded-lg p-3 border border-red-500/20 bg-red-500/5">
                                            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">
                                                ⚠ {result.batch_metadata.fetch_errors.length} Failed Fetches
                                            </p>
                                            {result.batch_metadata.fetch_errors.slice(0, 5).map((e, i) => (
                                                <p key={i} className="text-[10px] text-slate-400 truncate">
                                                    {e.student}: {e.error}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">
                                    Suspicious Pairs
                                    <span className="ml-2 text-sm font-normal text-slate-500">({pairs.length} found across {totalFiles} files)</span>
                                </h2>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => generatePdfReport(result)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-purple transition-shadow"
                                >
                                    <HiOutlineDownload className="w-4 h-4" />
                                    Download PDF Report
                                </motion.button>
                            </div>

                            {pairs.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {pairs.map((pair, idx) => {
                                        const refined = pair.refined_verdict;
                                        const hasAI = !!refined;
                                        const riskLevel = refined?.refined_risk_level || 'UNKNOWN';
                                        const isHighRisk = ['CRITICAL', 'HIGH'].includes(riskLevel);
                                        const isMediumRisk = riskLevel === 'MEDIUM';

                                        // Extract student label (e.g. "Alice (URN001)" from "Alice (URN001)/main.py")
                                        const getStudentLabel = (fp: string) => {
                                            const slash = fp.indexOf('/');
                                            return slash > 0 ? fp.substring(0, slash) : fp;
                                        };
                                        const getFileOnly = (fp: string) => fp.split('/').pop() || fp;

                                        const student1 = getStudentLabel(pair.file1);
                                        const student2 = getStudentLabel(pair.file2);
                                        const isBatch = student1 !== pair.file1; // has student prefix

                                        return (
                                            <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="h-full">
                                                <Card
                                                    onClick={() => { setSelectedPair(pair); setModalOpen(true); }}
                                                    className={`h-full flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-1 ${hasAI
                                                        ? 'border-purple-500/30 shadow-sm shadow-purple-500/10 hover:shadow-purple-500/30'
                                                        : 'hover:border-surface-muted hover:shadow-glow-purple relative overflow-hidden'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start gap-4 mb-5">
                                                        <div className="flex-1 min-w-0">
                                                            {isBatch ? (
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                                            <p className="text-sm font-semibold text-white truncate">{student1}</p>
                                                                        </div>
                                                                        <p className="text-xs text-surface-muted font-mono ml-3.5 truncate">{getFileOnly(pair.file1)}</p>
                                                                    </div>
                                                                    <div className="h-px bg-surface-border w-1/3 ml-3.5" />
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                                                                            <p className="text-sm font-semibold text-white truncate">{student2}</p>
                                                                        </div>
                                                                        <p className="text-xs text-surface-muted font-mono ml-3.5 truncate">{getFileOnly(pair.file2)}</p>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2 bg-surface-base px-3 py-2 rounded-lg border border-surface-border">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                                        <p className="text-sm font-medium text-slate-200 truncate">{pair.file1.split('/').pop()}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 bg-surface-base px-3 py-2 rounded-lg border border-surface-border">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                                                                        <p className="text-sm font-medium text-slate-200 truncate">{pair.file2.split('/').pop()}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col items-end shrink-0 gap-2">
                                                            <div className={`px-3 py-2 rounded-xl flex flex-col items-center justify-center border ${getScoreColor(pair.similarity_score)}`}>
                                                                <span className="text-xl font-black tracking-tighter leading-none">
                                                                    {(pair.similarity_score * 100).toFixed(0)}%
                                                                </span>
                                                                <span className="text-[9px] uppercase font-bold tracking-widest mt-1 opacity-80">Match</span>
                                                            </div>
                                                            {hasAI && refined?.reasoning && !refined.reasoning.includes('Failed to parse LLM response') && !refined.reasoning.includes('LLM evaluation failed') && (
                                                                <div className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 border ${isHighRisk ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                    isMediumRisk ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                    }`}>
                                                                    <HiOutlineSparkles className="w-2.5 h-2.5" />
                                                                    AI Verified
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="mt-auto pt-4 border-t border-surface-border space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-slate-400 font-medium">AST Matches</span>
                                                            <span className="text-xs text-white font-mono bg-surface-base px-2 py-0.5 rounded border border-surface-border">
                                                                {pair.matching_regions.length}
                                                            </span>
                                                        </div>

                                                        {refined ? (
                                                            <>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs text-slate-400 font-medium">Risk Assessment</span>
                                                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${isHighRisk ? 'bg-red-500/20 text-red-500' :
                                                                        isMediumRisk ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                                                                        }`}>
                                                                        {riskLevel}
                                                                    </span>
                                                                </div>
                                                                {refined.algorithm_detected !== 'NONE' && (
                                                                    <div className="flex items-center justify-between bg-surface-base px-2 py-1.5 rounded border border-surface-border">
                                                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mr-2">Method</span>
                                                                        <span className="text-[10px] text-slate-300 font-mono truncate max-w-[150px]" title={refined.algorithm_detected}>
                                                                            {refined.algorithm_detected}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <div className="flex items-center justify-end text-[10px] text-accent-purple font-bold tracking-widest uppercase gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                                <span>View Details</span>
                                                                <HiOutlineChevronRight />
                                                            </div>
                                                        )}
                                                    </div>
                                                </Card>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <Card hover={false} className="border border-emerald-500/20 bg-emerald-500/5 py-12">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                            <HiOutlineCheckCircle className="w-6 h-6 text-emerald-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-emerald-400 tracking-wide">All Clear</h3>
                                        <p className="text-center text-emerald-400/80 text-sm">No suspicious code patterns detected.<br />All files appear structurally unique.</p>
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}
                    {activeTab === 'pairs' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to see suspicious pairs.</p></Card>
                    )}

                    {/* ══ Similarity Graph ════════════════════════ */}
                    {activeTab === 'graph' && result && (
                        <div className="animate-fade-in">
                            <SimilarityGraph result={result} />
                        </div>
                    )}
                    {activeTab === 'graph' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to see the similarity graph.</p></Card>
                    )}

                    {/* ══ Heatmap ═════════════════════════════════ */}
                    {activeTab === 'heatmap' && result && matrixData && (
                        <div>
                            {/* Continuous gradient legend */}
                            <div className="flex items-center gap-4 mb-5">
                                <span className="text-xs text-slate-400">0%</span>
                                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{
                                    background: `linear-gradient(to right, ${getHeatColor(0)}, ${getHeatColor(0.2)}, ${getHeatColor(0.4)}, ${getHeatColor(0.5)}, ${getHeatColor(0.7)}, ${getHeatColor(0.9)}, ${getHeatColor(1.0)})`
                                }} />
                                <span className="text-xs text-slate-400">100%</span>
                            </div>
                            <div ref={heatmapRef} className="relative">
                                <Card hover={false} className="overflow-x-auto">
                                    <div className="relative inline-block">
                                        <table className="border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="p-2" />
                                                    {matrixData.files.map((file, i) => (
                                                        <th key={i} className="p-1 text-[10px] text-slate-500 font-normal" style={{ writingMode: 'vertical-rl', height: '80px' }}>{shortName(file)}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matrixData.values.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className="pr-3 text-[10px] text-slate-500 text-right whitespace-nowrap">{shortName(matrixData.files[i])}</td>
                                                        {row.map((score, j) => (
                                                            <td
                                                                key={j}
                                                                onMouseEnter={(e) => {
                                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                    const containerRect = heatmapRef.current?.getBoundingClientRect();
                                                                    setTooltip({
                                                                        x: rect.left - (containerRect?.left || 0) + rect.width / 2,
                                                                        y: rect.top - (containerRect?.top || 0) - 10,
                                                                        file1: matrixData.files[i],
                                                                        file2: matrixData.files[j],
                                                                        score,
                                                                    });
                                                                }}
                                                                onMouseLeave={() => setTooltip(null)}
                                                            >
                                                                <div
                                                                    className="w-8 h-8 rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 relative border border-white/5"
                                                                    style={{ backgroundColor: getHeatColor(score) }}
                                                                >
                                                                    {/* Show exact score on diagonal */}
                                                                    {i === j && (
                                                                        <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white/60 font-bold">1.0</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {tooltip && (
                                            <div className="absolute pointer-events-none z-50 glass-strong rounded-lg px-3 py-2 text-xs shadow-glass" style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}>
                                                <p className="text-white font-bold text-sm">{(tooltip.score * 100).toFixed(1)}%</p>
                                                <p className="text-slate-400">{shortName(tooltip.file1)} ↔ {shortName(tooltip.file2)}</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}
                    {activeTab === 'heatmap' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to see the heatmap matrix.</p></Card>
                    )}

                    {/* ══ Clusters ════════════════════════════════ */}
                    {activeTab === 'clusters' && result && (
                        <div>
                            {clusters.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {clusters.map((cluster, idx) => (
                                        <motion.div key={idx} initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: idx * 0.1, type: 'spring', damping: 20 }}>
                                            <Card className={`bg-gradient-to-br ${getSeverityColor(cluster.average_similarity)} border`} hover={true}>
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-white/5"><HiOutlineCollection className="w-5 h-5 text-purple-400" /></div>
                                                        <div>
                                                            <h3 className="font-semibold text-white">Cluster {idx + 1}</h3>
                                                            <p className="text-xs text-slate-500">{cluster.members.length} file(s) • similarity ≥ 75%</p>
                                                        </div>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getBadgeColor(cluster.average_similarity)}`}>{(cluster.average_similarity * 100).toFixed(1)}% avg</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {cluster.members.map((member, mIdx) => (
                                                        <motion.div key={mIdx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 + mIdx * 0.05 }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500" />
                                                            <span className="text-sm text-slate-300 truncate">{member}</span>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <Card hover={false}><p className="text-center text-slate-400 py-8">✅ No suspicious clusters detected. Files appear structurally diverse.</p></Card>
                            )}
                        </div>
                    )}
                    {activeTab === 'clusters' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to see detected clusters.</p></Card>
                    )}

                    {/* ══ AST Tree Viewer (Side-by-side) ═════════ */}
                    {activeTab === 'ast' && result && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ASTViewerPanel result={result} id="1" />
                            <ASTViewerPanel result={result} id="2" />
                        </div>
                    )}
                    {activeTab === 'ast' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to use the AST Viewer.</p></Card>
                    )}

                    {/* ══ Structure Summary (Side-by-side) ═══════ */}
                    {activeTab === 'structure' && result && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <StructureSummaryPanel result={result} id="1" />
                            <StructureSummaryPanel result={result} id="2" />
                        </div>
                    )}
                    {activeTab === 'structure' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to view the Code Structure.</p></Card>
                    )}
                </motion.div>
            )}

            <CodeComparisonModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pair={selectedPair} />
        </PageTransition>
    );
}

function ASTViewerPanel({ result, id }: { result: any, id: string }) {
    const [selectedAstFile, setSelectedAstFile] = useState<string>('');
    const [astFile, setAstFile] = useState<File | null>(null);
    const [astResult, setAstResult] = useState<VisualizeASTResponse | null>(null);
    const [astLoading, setAstLoading] = useState(false);
    const [astError, setAstError] = useState<string | null>(null);

    const handleAstVisualize = async () => {
        if (!astFile && !selectedAstFile) return;
        setAstLoading(true);
        setAstError(null);
        try {
            if (result && selectedAstFile && selectedAstFile !== 'manual') {
                const data = await getAnalysisAst(result.analysis_id, selectedAstFile);
                setAstResult(data);
            } else if (astFile) {
                const data = await visualizeAST(astFile);
                setAstResult(data);
            }
        } catch {
            setAstError('Failed to visualize AST. Check that the file is valid Python.');
        } finally {
            setAstLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Card hover={false} className="bg-surface-base border border-surface-border p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <HiOutlineCode className="w-4 h-4 text-accent-purple" />
                    AST Viewer (File {id})
                </h3>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="block mb-1 text-xs font-medium text-slate-400">Select an analyzed file</label>
                        {result ? (
                            <div className="space-y-2">
                                <select
                                    value={selectedAstFile}
                                    onChange={(e) => setSelectedAstFile(e.target.value)}
                                    className="block w-full px-3 py-2 rounded border border-white/10 text-slate-200 text-sm focus:ring-accent-purple focus:outline-none bg-[#1E293B]"
                                    style={{ backgroundColor: '#1E293B' }}
                                >
                                    <option value="" disabled className="bg-[#1E293B] text-slate-400">Select file...</option>
                                    {result.files.map((f: string) => (
                                        <option key={f} value={f} className="bg-[#1E293B] text-slate-200">{f}</option>
                                    ))}
                                    <option value="manual" className="bg-[#1E293B] text-slate-200">Upload Manual File...</option>
                                </select>
                                {selectedAstFile === 'manual' && (
                                    <input type="file" accept=".py,.js,.jsx,.ts,.tsx" onChange={(e) => setAstFile(e.target.files?.[0] || null)} className="block w-full text-xs text-surface-muted file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-medium file:bg-surface-secondary file:text-white hover:file:bg-surface-tertiary cursor-pointer" />
                                )}
                            </div>
                        ) : (
                            <input type="file" accept=".py,.js,.jsx,.ts,.tsx" onChange={(e) => setAstFile(e.target.files?.[0] || null)} className="block w-full text-xs text-surface-muted file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-medium file:bg-surface-secondary file:text-white hover:file:bg-surface-tertiary cursor-pointer" />
                        )}
                    </div>
                    <Button
                        onClick={handleAstVisualize}
                        loading={astLoading}
                        disabled={(!result && !astFile) || (result && !selectedAstFile) || (selectedAstFile === 'manual' && !astFile)}
                    >
                        Visualize AST
                    </Button>
                </div>
                {astError && <p className="mt-2 text-xs text-red-400">⚠️ {astError}</p>}
            </Card>
            {astLoading && <div className="py-8 bg-surface-base border border-surface-border rounded-2xl"><LoadingSpinner text="Parsing..." /></div>}
            {astResult && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 h-full">
                    <Card hover={false} className="bg-surface-tertiary border border-surface-border p-0 overflow-hidden h-full flex flex-col min-h-[400px]">
                        <div className="sticky top-0 z-10 bg-surface-secondary border-b border-surface-border px-4 py-3 flex flex-col gap-2 backdrop-blur-md">
                            <div>
                                <h2 className="text-sm font-semibold text-white font-mono break-all leading-tight">{astResult.filename}</h2>
                            </div>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 bg-surface-base p-1.5 rounded border border-surface-border">
                                {Object.entries(nodeColors).slice(0, 6).map(([name, color]) => (
                                    <div key={name} className="flex items-center gap-1 shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                                        <span className="text-[9px] text-surface-muted font-mono">{name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 bg-surface-base/50">
                            <TreeNode node={astResult.ast_tree} depth={0} />
                        </div>
                    </Card>
                </motion.div>
            )}
        </div>
    );
}

function StructureSummaryPanel({ result, id }: { result: any, id: string }) {
    const [selectedStructFile, setSelectedStructFile] = useState<string>('');
    const [structFile, setStructFile] = useState<File | null>(null);
    const [structResult, setStructResult] = useState<StructureSummaryResponse | null>(null);
    const [structLoading, setStructLoading] = useState(false);
    const [structError, setStructError] = useState<string | null>(null);

    const handleStructAnalyze = async () => {
        if (!structFile && !selectedStructFile) return;
        setStructLoading(true);
        setStructError(null);
        try {
            if (result && selectedStructFile && selectedStructFile !== 'manual') {
                const fileMetrics = result.metrics.find((m: any) => m.file === selectedStructFile);
                if (fileMetrics) {
                    setStructResult({
                        file: fileMetrics.file,
                        metrics: fileMetrics.metrics,
                        total_subtrees: fileMetrics.total_subtrees,
                        unique_subtrees: fileMetrics.unique_subtrees
                    });
                } else {
                    setStructError('Metrics not found in analysis.');
                }
            } else if (structFile) {
                const data = await structureSummary(structFile);
                setStructResult(data);
            }
        } catch {
            setStructError('Failed to analyze file.');
        } finally {
            setStructLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Card hover={false} className="bg-surface-base border border-surface-border p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <HiOutlineChartBar className="w-4 h-4 text-cyan-400" />
                    Structure Summary (File {id})
                </h3>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="block mb-1 text-xs font-medium text-slate-400">Select an analyzed file</label>
                        {result ? (
                            <div className="space-y-2">
                                <select
                                    value={selectedStructFile}
                                    onChange={(e) => setSelectedStructFile(e.target.value)}
                                    className="block w-full px-3 py-2 rounded border border-white/10 text-slate-200 text-sm focus:ring-cyan-400 focus:outline-none bg-[#1E293B]"
                                    style={{ backgroundColor: '#1E293B' }}
                                >
                                    <option value="" disabled className="bg-[#1E293B] text-slate-400">Select file...</option>
                                    {result.files.map((f: string) => (
                                        <option key={f} value={f} className="bg-[#1E293B] text-slate-200">{f}</option>
                                    ))}
                                    <option value="manual" className="bg-[#1E293B] text-slate-200">Upload Manual File...</option>
                                </select>
                                {selectedStructFile === 'manual' && (
                                    <input type="file" accept=".py,.js,.jsx,.ts,.tsx" onChange={(e) => setStructFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-medium file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 cursor-pointer" />
                                )}
                            </div>
                        ) : (
                            <input type="file" accept=".py,.js,.jsx,.ts,.tsx" onChange={(e) => setStructFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-medium file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 cursor-pointer" />
                        )}
                    </div>
                    <Button
                        onClick={handleStructAnalyze}
                        loading={structLoading}
                        disabled={(!result && !structFile) || (result && !selectedStructFile) || (selectedStructFile === 'manual' && !structFile)}
                    >
                        Analyze Structure
                    </Button>
                </div>
                {structError && <p className="mt-2 text-xs text-red-400">⚠️ {structError}</p>}
            </Card>
            {structLoading && <div className="py-8 bg-surface-base border border-surface-border rounded-2xl"><LoadingSpinner text="Computing..." /></div>}
            {structResult && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
                    <div className="mb-4 flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-500/20"><HiOutlineCode className="w-4 h-4 text-cyan-400" /></div>
                        <div>
                            <h2 className="text-sm font-semibold text-white break-all">{structResult.file}</h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <StatsCard label="Depth" value={structResult.metrics.ast_depth} icon={<HiOutlineAdjustments className="w-4 h-4" />} color="purple" />
                        <StatsCard label="Cyclomatic" value={structResult.metrics.basic_cyclomatic_complexity} icon={<HiOutlineTemplate className="w-4 h-4" />} color="purple" />
                        <StatsCard label="Functions" value={structResult.metrics.function_count} icon={<HiOutlineCode className="w-4 h-4" />} color="cyan" />
                        <StatsCard label="Ifs" value={structResult.metrics.if_count} icon={<HiOutlineLightningBolt className="w-4 h-4" />} color="amber" />
                        <StatsCard label="Loops" value={structResult.metrics.loop_count} icon={<HiOutlineRefresh className="w-4 h-4" />} color="pink" />
                        <StatsCard label="Uniq" value={structResult.unique_subtrees} icon={<HiOutlineFingerPrint className="w-4 h-4" />} color="cyan" />
                    </div>
                    <Card hover={false} className="py-3 px-3">
                        <div className="flex items-center justify-between">
                            <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Parsed</p><p className="text-lg font-bold text-white mt-0.5">{structResult.total_subtrees}</p></div>
                            <div className="text-right"><p className="text-[10px] text-slate-400 uppercase font-semibold">Uniqueness</p><p className="text-lg font-bold gradient-text mt-0.5">{structResult.total_subtrees > 0 ? ((structResult.unique_subtrees / structResult.total_subtrees) * 100).toFixed(1) : 0}%</p></div>
                        </div>
                    </Card>
                </motion.div>
            )}
        </div>
    );
}
