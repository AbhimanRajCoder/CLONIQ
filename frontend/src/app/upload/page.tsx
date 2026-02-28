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
    HiOutlineDownload,
    HiOutlineUserGroup,
} from 'react-icons/hi';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import Button from '@/components/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import CodeComparisonModal from '@/components/CodeComparisonModal';
import { analyzeFiles, compareZips, compareGithubRepos, analyzeGoogleSheet, visualizeAST, structureSummary } from '@/services/api';
import { useAnalysis } from '@/store/AnalysisContext';
import { SuspiciousPair, ASTTreeNode, VisualizeASTResponse, StructureSummaryResponse } from '@/types';
import { generatePdfReport } from '@/utils/generatePdfReport';

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
                    <span className="w-4 h-4 flex items-center justify-center text-slate-500">
                        {expanded ? <HiOutlineChevronDown className="w-3 h-3" /> : <HiOutlineChevronRight className="w-3 h-3" />}
                    </span>
                ) : (
                    <span className="w-4 h-4 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    </span>
                )}
                <span className="text-sm font-mono px-1.5 py-0.5 rounded group-hover:bg-white/5 transition-colors" style={{ color }}>
                    {node.name}
                </span>
                {hasChildren && <span className="text-[10px] text-slate-600 ml-1">({node.children!.length})</span>}
            </motion.div>
            <AnimatePresence>
                {expanded && hasChildren && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-l border-white/5"
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
//  Force-directed graph layout helpers
//  Deterministic: seeded pseudo-random for initial positions
// ═════════════════════════════════════════════════════════════

function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    suspicious: boolean;
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
    const [activeTab, setActiveTab] = useState<VisTab>('ast');

    // File inputs
    const [pyFiles, setPyFiles] = useState<File[]>([]);
    const [zip1, setZip1] = useState<File | null>(null);
    const [zip2, setZip2] = useState<File | null>(null);
    const [repoUrl1, setRepoUrl1] = useState('');
    const [repoUrl2, setRepoUrl2] = useState('');
    const [gsheetUrl, setGsheetUrl] = useState('');

    // AST viewer state
    const [astFile, setAstFile] = useState<File | null>(null);
    const [astResult, setAstResult] = useState<VisualizeASTResponse | null>(null);
    const [astLoading, setAstLoading] = useState(false);
    const [astError, setAstError] = useState<string | null>(null);

    // Structure summary state
    const [structFile, setStructFile] = useState<File | null>(null);
    const [structResult, setStructResult] = useState<StructureSummaryResponse | null>(null);
    const [structLoading, setStructLoading] = useState(false);
    const [structError, setStructError] = useState<string | null>(null);

    // Graph canvas refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const nodesRef = useRef<CanvasNode[]>([]);
    const edgesRef = useRef<{ source: string; target: string; weight: number }[]>([]);
    const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });

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

    const handleAstVisualize = async () => {
        if (!astFile) return;
        setAstLoading(true);
        setAstError(null);
        try {
            const data = await visualizeAST(astFile);
            setAstResult(data);
        } catch {
            setAstError('Failed to visualize AST. Check that the file is valid Python.');
        } finally {
            setAstLoading(false);
        }
    };

    const handleStructAnalyze = async () => {
        if (!structFile) return;
        setStructLoading(true);
        setStructError(null);
        try {
            const data = await structureSummary(structFile);
            setStructResult(data);
        } catch {
            setStructError('Failed to analyze file. Check that it is valid Python.');
        } finally {
            setStructLoading(false);
        }
    };

    // ═════════════════════════════════════════════════════════
    //  FORCE-DIRECTED GRAPH — canvas rendering
    //  • Uses seeded PRNG for deterministic initial positions
    //  • Proper repulsion + attraction spring model
    //  • Edge thickness = weight * 4  (proportional)
    //  • Red glow for nodes with any edge >= 0.7
    // ═════════════════════════════════════════════════════════

    const graphData = result?.similarity.graph ?? null;

    useEffect(() => {
        if (activeTab !== 'graph' || !graphData || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const parent = canvas.parentElement;
        const width = parent?.clientWidth || 800;
        const height = 500;
        canvas.width = width;
        canvas.height = height;

        // Seeded random for deterministic layout
        const rng = seededRandom(42);

        // Identify suspicious nodes (any edge >= 0.7)
        const suspiciousNodes = new Set<string>();
        graphData.edges.forEach((e) => {
            if (e.weight >= 0.7) {
                suspiciousNodes.add(e.source);
                suspiciousNodes.add(e.target);
            }
        });

        // Place nodes on a circle first, then add controlled jitter
        const n = graphData.nodes.length;
        nodesRef.current = graphData.nodes.map((node, i) => {
            const angle = (2 * Math.PI * i) / Math.max(n, 1);
            const radius = Math.min(width, height) * 0.3;
            return {
                id: node.id,
                x: width / 2 + Math.cos(angle) * radius + (rng() - 0.5) * 40,
                y: height / 2 + Math.sin(angle) * radius + (rng() - 0.5) * 40,
                vx: 0,
                vy: 0,
                suspicious: suspiciousNodes.has(node.id),
            };
        });
        edgesRef.current = graphData.edges;

        let iterCount = 0;
        const STABILIZE_AFTER = 300;  // reduce velocity after N iterations

        const simulate = () => {
            const nodes = nodesRef.current;
            const edges = edgesRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            iterCount++;
            const cooling = iterCount < STABILIZE_AFTER ? 1.0 : 0.98;
            const repulsionK = 150;
            const attractionK = 0.005;
            const idealLength = 180;
            const damping = 0.82 * cooling;

            // ── Repulsion (all pairs) ──────────────────────
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const distSq = dx * dx + dy * dy;
                    const dist = Math.sqrt(distSq) || 1;
                    const force = (repulsionK * repulsionK) / dist;
                    const fx = (dx / dist) * force * 0.04;
                    const fy = (dy / dist) * force * 0.04;
                    nodes[i].vx -= fx; nodes[i].vy -= fy;
                    nodes[j].vx += fx; nodes[j].vy += fy;
                }
            }

            // ── Attraction (connected edges) ───────────────
            const nodeMap = new Map(nodes.map((nd) => [nd.id, nd]));
            for (const edge of edges) {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                if (!s || !t) continue;
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                // Stronger attraction for higher similarity
                const strength = attractionK * (1 + edge.weight * 2);
                const force = (dist - idealLength) * strength;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                s.vx += fx; s.vy += fy;
                t.vx -= fx; t.vy -= fy;
            }

            // ── Gravity toward center ──────────────────────
            for (const node of nodes) {
                node.vx += (width / 2 - node.x) * 0.0008;
                node.vy += (height / 2 - node.y) * 0.0008;
            }

            // ── Integrate velocity ─────────────────────────
            for (const node of nodes) {
                if (dragRef.current.nodeId === node.id) continue;
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                // Clamp to canvas bounds
                node.x = Math.max(50, Math.min(width - 50, node.x));
                node.y = Math.max(50, Math.min(height - 50, node.y));
            }

            // ── RENDER ─────────────────────────────────────
            ctx.clearRect(0, 0, width, height);

            // Draw edges
            for (const edge of edges) {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                if (!s || !t) continue;

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                // Edge width proportional to similarity score
                ctx.lineWidth = Math.max(1, edge.weight * 5);
                const alpha = Math.max(0.15, edge.weight * 0.9);
                ctx.strokeStyle = edge.weight >= 0.7
                    ? `rgba(239, 68, 68, ${alpha})`
                    : `rgba(148, 163, 184, ${alpha * 0.6})`;
                ctx.stroke();

                // Show weight label on thick edges
                if (edge.weight >= 0.6) {
                    const mx = (s.x + t.x) / 2;
                    const my = (s.y + t.y) / 2;
                    ctx.font = '9px Inter, sans-serif';
                    ctx.fillStyle = edge.weight >= 0.7 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(148, 163, 184, 0.6)';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${(edge.weight * 100).toFixed(0)}%`, mx, my - 4);
                }
            }

            // Draw nodes
            const time = Date.now() / 1000;
            const radius = 18;

            for (const node of nodes) {
                // Glow for suspicious nodes
                if (node.suspicious) {
                    const glowR = radius + 10 + Math.sin(time * 2.5) * 4;
                    const grd = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, glowR);
                    grd.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
                    grd.addColorStop(1, 'rgba(239, 68, 68, 0)');
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
                    ctx.fillStyle = grd;
                    ctx.fill();
                }

                // Node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                const grad = ctx.createLinearGradient(
                    node.x - radius, node.y - radius,
                    node.x + radius, node.y + radius
                );
                if (node.suspicious) {
                    grad.addColorStop(0, '#ef4444');
                    grad.addColorStop(1, '#dc2626');
                } else {
                    grad.addColorStop(0, '#a855f7');
                    grad.addColorStop(1, '#06b6d4');
                }
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Label
                const label = node.id.split('/').pop() || node.id;
                ctx.font = '10px Inter, sans-serif';
                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'center';
                ctx.fillText(label.length > 16 ? label.slice(0, 14) + '…' : label, node.x, node.y + radius + 14);
            }

            animationRef.current = requestAnimationFrame(simulate);
        };

        simulate();

        // ── Drag interaction ───────────────────────────────
        const handleMouseDown = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            for (const node of nodesRef.current) {
                const dx = mx - node.x;
                const dy = my - node.y;
                if (dx * dx + dy * dy < 18 * 18) {
                    dragRef.current = { nodeId: node.id, offsetX: dx, offsetY: dy };
                    break;
                }
            }
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current.nodeId) return;
            const rect = canvas.getBoundingClientRect();
            const node = nodesRef.current.find((nd) => nd.id === dragRef.current.nodeId);
            if (node) {
                node.x = e.clientX - rect.left - dragRef.current.offsetX;
                node.y = e.clientY - rect.top - dragRef.current.offsetY;
                node.vx = 0;
                node.vy = 0;
            }
        };
        const handleMouseUp = () => {
            dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);

        return () => {
            cancelAnimationFrame(animationRef.current);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
        };
    }, [activeTab, graphData]);

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
            <div className="mb-12 border-b border-white/[0.05] pb-6">
                <h1 className="text-3xl font-light text-white tracking-tight">Upload & Analyze</h1>
                <p className="text-slate-500 mt-2 font-light">Upload code files, detect structural similarities, and explore results</p>
            </div>

            {/* ── Mode selector ──────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-8">
                {modeButtons.map((btn) => (
                    <motion.button
                        key={btn.id}
                        whileHover={{ scale: 0.98, filter: 'brightness(1.1)' }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        onClick={() => { setMode(btn.id); setError(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${mode === btn.id ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-slate-500 border-transparent hover:text-white hover:bg-white/[0.02]'}`}
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
                            <label className="block mb-2 text-sm font-medium text-slate-400">Select Python (.py) files</label>
                            <div className="relative group cursor-pointer border border-dashed border-white/10 rounded-xl p-8 text-center transition-all hover:border-white/30 hover:bg-white/[0.02]">
                                <input type="file" multiple accept=".py" onChange={(e) => setPyFiles(Array.from(e.target.files || []))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <HiOutlineCloudUpload className="w-8 h-8 mx-auto mb-3 text-slate-500 group-hover:text-white transition-colors" />
                                <p className="text-sm text-slate-400 font-light group-hover:text-white transition-colors">Drag and drop or click to browse</p>
                            </div>
                            {pyFiles.length > 0 && <p className="mt-4 text-xs font-mono text-purple-400 uppercase tracking-widest">{pyFiles.length} file(s) selected</p>}
                        </div>
                    )}
                    {mode === 'zip' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-slate-400">User 1 ZIP archive</label>
                                <div className="relative group cursor-pointer border border-dashed border-white/10 rounded-xl p-8 text-center transition-all hover:border-white/30 hover:bg-white/[0.02]">
                                    <input type="file" accept=".zip" onChange={(e) => setZip1(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    <HiOutlineFolder className="w-6 h-6 mx-auto mb-2 text-slate-500 group-hover:text-purple-400 transition-colors" />
                                    <p className="text-xs text-slate-500 font-mono text-center">
                                        {zip1 ? zip1.name : 'Select ZIP 1'}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className="block mb-2 text-sm font-medium text-slate-400">User 2 ZIP archive</label>
                                <div className="relative group cursor-pointer border border-dashed border-white/10 rounded-xl p-8 text-center transition-all hover:border-white/30 hover:bg-white/[0.02]">
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
                                <label className="block mb-2 text-sm font-medium text-slate-400">Repository 1 URL</label>
                                <input type="url" placeholder="https://github.com/user/repo" value={repoUrl1} onChange={(e) => setRepoUrl1(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-black border border-white/10 text-white text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-slate-600 transition-all font-mono shadow-inner" />
                            </div>
                            <div>
                                <label className="block mb-2 text-sm font-medium text-slate-400">Repository 2 URL</label>
                                <input type="url" placeholder="https://github.com/user/repo" value={repoUrl2} onChange={(e) => setRepoUrl2(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-black border border-white/10 text-white text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 transition-all font-mono shadow-inner" />
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
                 • Analysis tabs (pairs/graph/heatmap/clusters) require result
                 • Tool tabs (AST/Structure) work independently
                ═══════════════════════════════════════════════════ */}

            {!loading && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {/* ── Analysis ID & AI Summary badges ── */}
                    {result && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-slate-600 font-mono glass px-2 py-0.5 rounded border border-white/5">
                                ID: {result.analysis_id.slice(0, 8)}… | {totalFiles} files | {result.metadata.analysis_type}
                            </span>

                            {result.llm_summary && (
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
                            // Analysis-dependent tabs are disabled when no result
                            const needsResult = ['pairs', 'graph', 'heatmap', 'clusters'].includes(tab.id);
                            const isDisabled = needsResult && !result;

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

                            {pairs.length > 0 ? (
                                <>
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
                                                <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                                                    <Card
                                                        onClick={() => { setSelectedPair(pair); setModalOpen(true); }}
                                                        className={`relative overflow-hidden hover:shadow-glow-purple transition-shadow cursor-pointer ${hasAI ? 'border-white/10' : ''}`}
                                                    >
                                                        {hasAI && (
                                                            <div className={`absolute top-0 right-0 px-2 py-0.5 rounded-bl-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${isHighRisk ? 'bg-red-500/20 text-red-400' :
                                                                isMediumRisk ? 'bg-amber-500/20 text-amber-400' :
                                                                    'bg-emerald-500/20 text-emerald-400'
                                                                }`}>
                                                                <HiOutlineSparkles className="w-2.5 h-2.5" />
                                                                AI
                                                            </div>
                                                        )}

                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="flex-1 min-w-0 pr-2">
                                                                {isBatch ? (
                                                                    <div className="space-y-2">
                                                                        <div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                                                <p className="text-xs font-bold text-white truncate">{student1}</p>
                                                                            </div>
                                                                            <p className="text-[10px] text-slate-500 font-mono ml-3 truncate">{getFileOnly(pair.file1)}</p>
                                                                        </div>
                                                                        <div className="h-px bg-white/5" />
                                                                        <div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                                                                                <p className="text-xs font-bold text-white truncate">{student2}</p>
                                                                            </div>
                                                                            <p className="text-[10px] text-slate-500 font-mono ml-3 truncate">{getFileOnly(pair.file2)}</p>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                                            <p className="text-xs font-medium text-white/80 truncate">{pair.file1.split('/').pop()}</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                                                            <p className="text-xs font-medium text-white/80 truncate">{pair.file2.split('/').pop()}</p>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col items-end shrink-0">
                                                                <span className={`px-2 py-1 rounded-lg text-sm font-black border tracking-tighter ${getScoreColor(pair.similarity_score)}`}>
                                                                    {(pair.similarity_score * 100).toFixed(0)}%
                                                                </span>
                                                                {refined?.ai_adjusted_similarity_score !== undefined && (
                                                                    <span className="text-[10px] text-slate-500 font-bold mt-1">
                                                                        AI: {(refined.ai_adjusted_similarity_score * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                                                                <span>{pair.matching_regions.length} AST Matches</span>
                                                            </div>

                                                            {refined ? (
                                                                <div className="pt-2 border-t border-white/5 space-y-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Risk</span>
                                                                        <span className={`text-[10px] font-black ${isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'}`}>{riskLevel}</span>
                                                                    </div>
                                                                    {refined.algorithm_detected !== 'NONE' && (
                                                                        <div className="text-[10px] text-slate-300 truncate font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                                                            Algo: <span className="text-white">{refined.algorithm_detected}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="text-[10px] text-purple-400 font-bold tracking-widest uppercase flex items-center gap-1 pt-2 opacity-60">
                                                                    <span>Details</span>
                                                                    <HiOutlineChevronRight />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Card>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <Card hover={false}><p className="text-center text-slate-400 py-4">✅ No suspicious pairs found. All files appear structurally unique.</p></Card>
                            )}
                        </div>
                    )}
                    {activeTab === 'pairs' && !result && (
                        <Card hover={false}><p className="text-center text-slate-400 py-8">📁 Run an analysis above to see suspicious pairs.</p></Card>
                    )}

                    {/* ══ Similarity Graph ════════════════════════ */}
                    {activeTab === 'graph' && result && graphData && (
                        <Card hover={false} className="overflow-hidden">
                            <div className="flex items-center gap-4 mb-4 flex-wrap">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500" /><span className="text-xs text-slate-400">Normal node</span></div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-xs text-slate-400">Suspicious (≥70%)</span></div>
                                <div className="flex items-center gap-2"><div className="w-8 h-0.5 bg-red-500/60" /><span className="text-xs text-slate-400">High similarity</span></div>
                                <div className="flex items-center gap-2"><div className="w-8 h-0.5 bg-slate-400/40" /><span className="text-xs text-slate-400">Low similarity</span></div>
                            </div>
                            <canvas ref={canvasRef} className="w-full rounded-xl bg-dark-900/50 cursor-grab active:cursor-grabbing" style={{ height: '500px' }} />
                            <div className="mt-4 grid grid-cols-3 gap-4">
                                <div className="glass rounded-xl p-3 text-center"><p className="text-xs text-slate-400">Nodes (files)</p><p className="text-xl font-bold text-white">{graphData.nodes.length}</p></div>
                                <div className="glass rounded-xl p-3 text-center"><p className="text-xs text-slate-400">Edges (pairs ≥ 50%)</p><p className="text-xl font-bold text-white">{graphData.edges.length}</p></div>
                                <div className="glass rounded-xl p-3 text-center"><p className="text-xs text-slate-400">Total analyzed</p><p className="text-xl font-bold text-white">{totalFiles}</p></div>
                            </div>
                        </Card>
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

                    {/* ══ AST Tree Viewer (standalone — always available) ═════════ */}
                    {activeTab === 'ast' && (
                        <div>
                            <Card hover={false} className="mb-6">
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                    <HiOutlineCode className="w-4 h-4 text-purple-400" />
                                    Visualize Abstract Syntax Tree
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">Upload any Python (.py) file to see its full AST structure as a collapsible tree.</p>
                                <div className="flex items-end gap-4">
                                    <div className="flex-1">
                                        <label className="block mb-2 text-sm font-medium text-slate-300">Select a Python (.py) file</label>
                                        <input type="file" accept=".py" onChange={(e) => setAstFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-500/20 file:text-purple-300 hover:file:bg-purple-500/30 cursor-pointer" />
                                    </div>
                                    <Button onClick={handleAstVisualize} loading={astLoading} disabled={!astFile}>Visualize AST</Button>
                                </div>
                                {astError && <p className="mt-3 text-sm text-red-400">⚠️ {astError}</p>}
                            </Card>
                            {astLoading && <LoadingSpinner text="Parsing AST..." />}
                            {astResult && (
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                    <Card hover={false}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-lg font-semibold text-white">{astResult.filename}</h2>
                                            <div className="flex gap-2 flex-wrap">
                                                {Object.entries(nodeColors).slice(0, 8).map(([name, color]) => (
                                                    <div key={name} className="flex items-center gap-1">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                                        <span className="text-[10px] text-slate-500">{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="max-h-[500px] overflow-y-auto rounded-xl bg-dark-900/50 p-4">
                                            <TreeNode node={astResult.ast_tree} depth={0} />
                                        </div>
                                    </Card>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* ══ Structure Summary (standalone — always available) ═══════ */}
                    {activeTab === 'structure' && (
                        <div>
                            <Card hover={false} className="mb-6">
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                    <HiOutlineChartBar className="w-4 h-4 text-cyan-400" />
                                    Code Structure Summary
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">Upload any Python (.py) file to get its structural metrics — depth, complexity, functions, loops, and more.</p>
                                <div className="flex items-end gap-4">
                                    <div className="flex-1">
                                        <label className="block mb-2 text-sm font-medium text-slate-300">Select a Python (.py) file</label>
                                        <input type="file" accept=".py" onChange={(e) => setStructFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-500/20 file:text-purple-300 hover:file:bg-purple-500/30 cursor-pointer" />
                                    </div>
                                    <Button onClick={handleStructAnalyze} loading={structLoading} disabled={!structFile}>Analyze Structure</Button>
                                </div>
                                {structError && <p className="mt-3 text-sm text-red-400">⚠️ {structError}</p>}
                            </Card>
                            {structLoading && <LoadingSpinner text="Computing structural metrics..." />}
                            {structResult && (
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                    <div className="mb-6 flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-purple-500/20"><HiOutlineCode className="w-5 h-5 text-purple-400" /></div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-white">{structResult.file}</h2>
                                            <p className="text-xs text-slate-500">Structural analysis complete</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                                        <StatsCard label="AST Depth" value={structResult.metrics.ast_depth} icon={<HiOutlineAdjustments className="w-5 h-5" />} color="purple" />
                                        <StatsCard label="Function Count" value={structResult.metrics.function_count} icon={<HiOutlineCode className="w-5 h-5" />} color="cyan" />
                                        <StatsCard label="Loop Count" value={structResult.metrics.loop_count} icon={<HiOutlineRefresh className="w-5 h-5" />} color="pink" />
                                        <StatsCard label="If Statements" value={structResult.metrics.if_count} icon={<HiOutlineLightningBolt className="w-5 h-5" />} color="amber" />
                                        <StatsCard label="Cyclomatic Complexity" value={structResult.metrics.basic_cyclomatic_complexity} icon={<HiOutlineTemplate className="w-5 h-5" />} color="purple" />
                                        <StatsCard label="Unique Subtrees" value={structResult.unique_subtrees} icon={<HiOutlineFingerPrint className="w-5 h-5" />} color="cyan" />
                                    </div>
                                    <Card hover={false}>
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-sm text-slate-400">Total subtrees parsed</p><p className="text-2xl font-bold text-white mt-1">{structResult.total_subtrees}</p></div>
                                            <div className="text-right"><p className="text-sm text-slate-400">Uniqueness ratio</p><p className="text-2xl font-bold gradient-text mt-1">{structResult.total_subtrees > 0 ? ((structResult.unique_subtrees / structResult.total_subtrees) * 100).toFixed(1) : 0}%</p></div>
                                        </div>
                                    </Card>
                                </motion.div>
                            )}
                        </div>
                    )}
                </motion.div>
            )}

            <CodeComparisonModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pair={selectedPair} />
        </PageTransition>
    );
}
