'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    HiOutlineArrowsExpand,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
    HiOutlineRefresh,
    HiOutlineX,
    HiOutlineSearch,
    HiOutlineAdjustments,
    HiOutlineCollection,
    HiOutlineExclamationCircle,
    HiOutlineDocumentText
} from 'react-icons/hi';
import { AnalysisResult, SuspiciousPair } from '@/types';

// ------------- Types -------------

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    suspicious: boolean;
    degree: number;
    avgSimilarity: number;
}

interface CanvasEdge {
    source: string;
    target: string;
    weight: number;
    pairData: SuspiciousPair;
    isSuspicious: boolean;
}

interface SimilarityGraphProps {
    result: AnalysisResult;
}

// ------------- Helpers -------------

function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function getHeatColor(score: number): string {
    if (score <= 0) return 'rgba(148, 163, 184, 0.5)'; // slate
    if (score >= 1.0) return 'rgba(239, 68, 68, 1.0)'; // red

    const stops = [
        { t: 0.0, r: 148, g: 163, b: 184, a: 0.2 },   // slate
        { t: 0.5, r: 56, g: 189, b: 248, a: 0.5 },   // light blue
        { t: 0.7, r: 245, g: 158, b: 11, a: 0.8 },    // amber
        { t: 0.85, r: 239, g: 68, b: 68, a: 0.95 },   // red
        { t: 1.0, r: 220, g: 38, b: 38, a: 1.0 },     // dark red
    ];

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

const shortName = (name: string) => name.split('/').pop() || name;

// ------------- Main Component -------------

export default function SimilarityGraph({ result }: SimilarityGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Graph state
    const [nodes, setNodes] = useState<CanvasNode[]>([]);
    const [edges, setEdges] = useState<CanvasEdge[]>([]);

    // Viewport state
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const isDraggingMap = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Physics State
    const [physicsEnabled, setPhysicsEnabled] = useState(true);
    const animationRef = useRef<number>(0);
    const dragNodeRef = useRef<{ id: string | null; offsetX: number; offsetY: number }>({ id: null, offsetX: 0, offsetY: 0 });

    // Filters & Controls
    const [threshold, setThreshold] = useState(0.5);
    const [suspiciousOnly, setSuspiciousOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Selection state
    const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<CanvasEdge | null>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

    // 1. Initialize Graph Data
    useEffect(() => {
        if (!result) return;

        const newNodesMap = new Map<string, CanvasNode>();
        const newEdges: CanvasEdge[] = [];

        result.files.forEach((f, i) => {
            const random = seededRandom(i * 999);
            newNodesMap.set(f, {
                id: f,
                x: 400 + (random() - 0.5) * 400,
                y: 300 + (random() - 0.5) * 400,
                vx: 0, vy: 0,
                radius: 15,
                suspicious: false,
                degree: 0,
                avgSimilarity: 0
            });
        });

        const degreeMap = new Map<string, number>();
        const simSumMap = new Map<string, number>();

        result.similarity.pairs.forEach(pair => {
            if (pair.similarity_score >= threshold) {
                newEdges.push({
                    source: pair.file1,
                    target: pair.file2,
                    weight: pair.similarity_score,
                    pairData: pair,
                    isSuspicious: pair.similarity_score >= 0.7
                });

                degreeMap.set(pair.file1, (degreeMap.get(pair.file1) || 0) + 1);
                degreeMap.set(pair.file2, (degreeMap.get(pair.file2) || 0) + 1);
                simSumMap.set(pair.file1, (simSumMap.get(pair.file1) || 0) + pair.similarity_score);
                simSumMap.set(pair.file2, (simSumMap.get(pair.file2) || 0) + pair.similarity_score);

                if (pair.similarity_score >= 0.7) {
                    const n1 = newNodesMap.get(pair.file1);
                    const n2 = newNodesMap.get(pair.file2);
                    if (n1) n1.suspicious = true;
                    if (n2) n2.suspicious = true;
                }
            }
        });

        let filteredNodes = Array.from(newNodesMap.values());

        // Calculate degree and avg similarity to adjust radius
        filteredNodes.forEach(n => {
            const deg = degreeMap.get(n.id) || 0;
            n.degree = deg;
            n.avgSimilarity = deg > 0 ? (simSumMap.get(n.id) || 0) / deg : 0;
            n.radius = 12 + Math.min(deg * 3, 20) + (n.avgSimilarity * 10);
        });

        if (suspiciousOnly) {
            filteredNodes = filteredNodes.filter(n => n.suspicious);
        }

        setNodes(filteredNodes);
        setEdges(newEdges.filter(e =>
            newNodesMap.has(e.source) && newNodesMap.has(e.target) &&
            (!suspiciousOnly || (newNodesMap.get(e.source)?.suspicious && newNodesMap.get(e.target)?.suspicious))
        ));

    }, [result, threshold, suspiciousOnly]);

    // 2. Physics Simulation Loop
    useEffect(() => {
        if (!physicsEnabled || nodes.length === 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const simulate = () => {
            const damping = 0.85; // highly damped for stability
            const repulsionK = 8000;
            const attractionK = 0.03;
            const idealLength = 150;

            // Repulsion
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Collision detection + strong repulsion
                    const minDist = nodes[i].radius + nodes[j].radius + 20;
                    if (dist < minDist) {
                        const force = (minDist - dist) * 0.5;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        nodes[i].vx -= fx; nodes[i].vy -= fy;
                        nodes[j].vx += fx; nodes[j].vy += fy;
                    } else {
                        const force = repulsionK / (dist * dist);
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        nodes[i].vx -= fx; nodes[i].vy -= fy;
                        nodes[j].vx += fx; nodes[j].vy += fy;
                    }
                }
            }

            // Attraction
            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            for (const edge of edges) {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                if (!s || !t) continue;

                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - idealLength) * attractionK * Math.max(0.5, edge.weight * 2);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                s.vx += fx; s.vy += fy;
                t.vx -= fx; t.vy -= fy;
            }

            // Center Gravity
            const cx = 0; // Center is 0,0 in world space
            const cy = 0;
            for (const node of nodes) {
                node.vx += (cx - node.x) * 0.005;
                node.vy += (cy - node.y) * 0.005;
            }

            // Integrate
            let totalVelocity = 0;
            for (const node of nodes) {
                if (dragNodeRef.current.id === node.id) continue;
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                totalVelocity += Math.abs(node.vx) + Math.abs(node.vy);
            }

            // Stop animation if velocity is very low to save CPU
            if (totalVelocity > 0.5) {
                animationRef.current = requestAnimationFrame(simulate);
            } else {
                setPhysicsEnabled(false);
            }

            renderCanvas();
        };

        animationRef.current = requestAnimationFrame(simulate);
        return () => cancelAnimationFrame(animationRef.current);
    }, [nodes, edges, physicsEnabled]);

    // 3. Render Canvas Iteration
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        // Auto-resize
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Apply Transform (Pan & Zoom)
        ctx.translate(canvas.width / 2 + transform.x, canvas.height / 2 + transform.y);
        ctx.scale(transform.k, transform.k);

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // Determine highlighting
        let highlightNodes = new Set<string>();
        let highlightEdges = new Set<string>();

        if (selectedNode || hoveredNode) {
            const focusId = selectedNode?.id || hoveredNode;
            highlightNodes.add(focusId!);
            edges.forEach(e => {
                if (e.source === focusId || e.target === focusId) {
                    highlightEdges.add(e.source + '-' + e.target);
                    highlightNodes.add(e.source);
                    highlightNodes.add(e.target);
                }
            });
        }

        const hasFocus = highlightNodes.size > 0;

        // Draw Edges
        edges.forEach(edge => {
            const s = nodeMap.get(edge.source);
            const t = nodeMap.get(edge.target);
            if (!s || !t) return;

            const edgeId = edge.source + '-' + edge.target;
            const isHighlighted = highlightEdges.has(edgeId) || selectedEdge?.pairData === edge.pairData;
            const isFaded = hasFocus && !isHighlighted;

            ctx.beginPath();
            // Curved edges
            const midX = (s.x + t.x) / 2;
            const midY = (s.y + t.y) / 2;
            const cpX = midX + (t.y - s.y) * 0.2;
            const cpY = midY - (t.x - s.x) * 0.2;

            ctx.moveTo(s.x, s.y);
            ctx.quadraticCurveTo(cpX, cpY, t.x, t.y);

            ctx.lineWidth = isHighlighted ? Math.max(2, edge.weight * 8) : Math.max(1, edge.weight * 5);
            ctx.strokeStyle = getHeatColor(edge.weight);
            ctx.globalAlpha = isFaded ? 0.05 : isHighlighted ? 1.0 : (edge.weight - 0.2);
            ctx.stroke();

            // Label on hover/highlight
            if ((isHighlighted || hoveredEdge === edgeId) && !isFaded) {
                const lx = (s.x + t.x) / 2;
                const ly = (s.y + t.y) / 2;
                ctx.globalAlpha = 1;
                ctx.fillStyle = getHeatColor(edge.weight);
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${(edge.weight * 100).toFixed(0)}%`, lx, ly - 8);
            }
        });

        // Draw Nodes
        nodes.forEach(node => {
            const isHighlighted = highlightNodes.has(node.id);
            const isSelected = selectedNode?.id === node.id;
            const isFaded = hasFocus && !isHighlighted;
            const isSearched = searchQuery && node.id.toLowerCase().includes(searchQuery.toLowerCase());

            ctx.globalAlpha = isFaded ? 0.1 : 1.0;

            // Glow
            if (node.suspicious && !isFaded) {
                const time = Date.now() / 1000;
                const glowSize = node.radius + 15 + Math.sin(time * 3) * 5;
                const grd = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, glowSize);
                grd.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
                grd.addColorStop(1, 'rgba(239, 68, 68, 0)');
                ctx.beginPath();
                ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();
            }

            // Search Highlight Ring
            if (isSearched && !isFaded) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // Node Base
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            const grad = ctx.createLinearGradient(
                node.x - node.radius, node.y - node.radius,
                node.x + node.radius, node.y + node.radius
            );

            if (node.suspicious) {
                grad.addColorStop(0, '#ef4444');
                grad.addColorStop(1, '#991b1b');
            } else if (node.degree > 0) {
                grad.addColorStop(0, '#38bdf8');
                grad.addColorStop(1, '#0284c7');
            } else {
                grad.addColorStop(0, '#94a3b8');
                grad.addColorStop(1, '#475569');
            }

            ctx.fillStyle = grad;
            ctx.fill();

            ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = isSelected ? 4 : 1.5;
            ctx.stroke();

            // Label
            if (!isFaded || isSearched) {
                const label = shortName(node.id);
                ctx.font = isHighlighted ? 'bold 12px Inter, sans-serif' : '10px Inter, sans-serif';
                ctx.fillStyle = isHighlighted ? '#ffffff' : '#cbd5e1';
                ctx.textAlign = 'center';
                ctx.fillText(label.length > 20 ? label.slice(0, 18) + '…' : label, node.x, node.y + node.radius + 16);
            }
        });

        ctx.restore();
    }, [nodes, edges, transform, selectedNode, hoveredNode, selectedEdge, hoveredEdge, searchQuery]);

    // Re-render when dependencies change without physics loop
    useEffect(() => {
        if (!physicsEnabled) {
            renderCanvas();
        }
    }, [renderCanvas, physicsEnabled]);

    // 4. Input Events
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Transform mouse coords to world coords
        const getWorldCoords = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            // mouse relative to canvas
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // apply reverse transform
            const wx = (mx - (canvas.width / 2 + transform.x)) / transform.k;
            const wy = (my - (canvas.height / 2 + transform.y)) / transform.k;

            return { wx, wy, mx, my };
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newK = Math.min(Math.max(0.1, transform.k * Math.exp(delta)), 10);

            setTransform(prev => ({
                ...prev,
                k: newK
            }));
        };

        const handleMouseDown = (e: MouseEvent) => {
            const { wx, wy, mx, my } = getWorldCoords(e);

            // Check nodes
            let clickedNode = null;
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                const dx = wx - node.x;
                const dy = wy - node.y;
                if (dx * dx + dy * dy < node.radius * node.radius * 1.5) { // generous hit area
                    clickedNode = node;
                    break;
                }
            }

            if (clickedNode) {
                dragNodeRef.current = { id: clickedNode.id, offsetX: wx - clickedNode.x, offsetY: wy - clickedNode.y };
                setSelectedNode(clickedNode);
                setSelectedEdge(null);
                setPhysicsEnabled(true);
            } else {
                // Check edges if no node clicked
                let clickedEdge = null;
                for (const edge of edges) {
                    const s = nodes.find(n => n.id === edge.source);
                    const t = nodes.find(n => n.id === edge.target);
                    if (!s || !t) continue;

                    // Box approx
                    const minX = Math.min(s.x, t.x) - 10;
                    const maxX = Math.max(s.x, t.x) + 10;
                    const minY = Math.min(s.y, t.y) - 10;
                    const maxY = Math.max(s.y, t.y) + 10;

                    if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) {
                        clickedEdge = edge;
                        break;
                    }
                }

                if (clickedEdge) {
                    setSelectedEdge(clickedEdge);
                    setSelectedNode(null);
                } else {
                    // Pan map
                    isDraggingMap.current = true;
                    lastMousePos.current = { x: mx, y: my };
                    setSelectedNode(null);
                    setSelectedEdge(null);
                }
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            const { wx, wy, mx, my } = getWorldCoords(e);

            // Drag Node
            if (dragNodeRef.current.id) {
                const node = nodes.find(n => n.id === dragNodeRef.current.id);
                if (node) {
                    node.x = wx - dragNodeRef.current.offsetX;
                    node.y = wy - dragNodeRef.current.offsetY;
                    node.vx = 0;
                    node.vy = 0;
                }
                canvas.style.cursor = 'grabbing';
                return;
            }

            // Pan Map
            if (isDraggingMap.current) {
                const dx = mx - lastMousePos.current.x;
                const dy = my - lastMousePos.current.y;
                setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                lastMousePos.current = { x: mx, y: my };
                canvas.style.cursor = 'grabbing';
                return;
            }

            // Hover states
            let foundHoverNode = false;
            let foundHoverEdge = false;
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                const dx = wx - node.x;
                const dy = wy - node.y;
                if (dx * dx + dy * dy < node.radius * node.radius * 1.5) {
                    setHoveredNode(node.id);
                    foundHoverNode = true;
                    break;
                }
            }

            if (!foundHoverNode) {
                setHoveredNode(null);
                // check edge
                for (const edge of edges) {
                    const s = nodes.find(n => n.id === edge.source);
                    const t = nodes.find(n => n.id === edge.target);
                    if (!s || !t) continue;
                    const minX = Math.min(s.x, t.x) - 10;
                    const maxX = Math.max(s.x, t.x) + 10;
                    const minY = Math.min(s.y, t.y) - 10;
                    const maxY = Math.max(s.y, t.y) + 10;
                    if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) {
                        setHoveredEdge(edge.source + '-' + edge.target);
                        foundHoverEdge = true;
                        break;
                    }
                }
                if (!foundHoverEdge) setHoveredEdge(null);
            } else {
                setHoveredEdge(null);
            }

            if (foundHoverNode) {
                canvas.style.cursor = 'pointer';
            } else if (foundHoverEdge) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'grab';
            }
        };

        const handleMouseUp = () => {
            dragNodeRef.current.id = null;
            isDraggingMap.current = false;
            canvas.style.cursor = 'grab';
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            canvas.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [nodes, edges, transform, renderCanvas]);

    // 5. Controls
    const fitToScreen = () => {
        if (nodes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        const w = Math.max(maxX - minX, 100);
        const h = Math.max(maxY - minY, 100);
        const cw = containerRef.current?.clientWidth || 800;
        const ch = containerRef.current?.clientHeight || 600;

        const scale = Math.min(cw / w, ch / h) * 0.8;

        setTransform({
            x: -(minX + maxX) / 2 * scale,
            y: -(minY + maxY) / 2 * scale,
            k: scale
        });
    };

    // Derived Statistics
    const metrics = useMemo(() => {
        const suspiciousNodes = nodes.filter(n => n.suspicious).length;
        const clusters = new Set(nodes.filter(n => n.suspicious).map(n => n.degree)).size; // Rough proxy
        return { suspiciousNodes, clusters };
    }, [nodes]);

    return (
        <div className="flex flex-col gap-4 relative">
            {/* Graph Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-base p-3 rounded-xl border border-surface-border shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={fitToScreen} className="p-2 hover:bg-surface-secondary rounded-lg text-slate-400 hover:text-white transition-colors" title="Fit to Screen">
                        <HiOutlineArrowsExpand className="w-5 h-5" />
                    </button>
                    <button onClick={() => setTransform(p => ({ ...p, k: p.k * 1.2 }))} className="p-2 hover:bg-surface-secondary rounded-lg text-slate-400 hover:text-white transition-colors" title="Zoom In">
                        <HiOutlineZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={() => setTransform(p => ({ ...p, k: p.k / 1.2 }))} className="p-2 hover:bg-surface-secondary rounded-lg text-slate-400 hover:text-white transition-colors" title="Zoom Out">
                        <HiOutlineZoomOut className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-surface-border mx-1" />
                    <button onClick={() => setPhysicsEnabled(!physicsEnabled)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${physicsEnabled ? 'bg-accent-purple/10 border-accent-purple text-accent-purple' : 'glass border-surface-border text-slate-400'}`}>
                        <HiOutlineRefresh className={`w-4 h-4 ${physicsEnabled ? 'animate-spin-slow' : ''}`} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Physics {physicsEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Threshold</span>
                        <input type="range" min="0.5" max="1.0" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-24 accent-purple-500" />
                        <span className="text-xs font-mono text-white w-8">{(threshold * 100).toFixed(0)}%</span>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 border-l border-surface-border pl-4 cursor-pointer">
                        <input type="checkbox" checked={suspiciousOnly} onChange={(e) => setSuspiciousOnly(e.target.checked)} className="rounded text-accent-purple focus:ring-accent-purple bg-surface-secondary border-surface-border" />
                        Suspicious Only
                    </label>
                    <div className="relative border-l border-surface-border pl-4">
                        <HiOutlineSearch className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Find file..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-surface-secondary border border-surface-border rounded-lg pl-8 pr-3 py-1 text-xs text-white focus:ring-1 focus:ring-accent-cyan outline-none w-40"
                        />
                    </div>
                </div>
            </div>

            {/* Canvas Container */}
            <div ref={containerRef} className="relative w-full h-[600px] rounded-2xl bg-[#09090b] border border-surface-border overflow-hidden ring-1 ring-white/5 shadow-inner">
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 10px 10px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

                <canvas ref={canvasRef} className="absolute inset-0 outline-none" />

                {/* Legend Overlay */}
                <div className="absolute top-4 left-4 p-3 rounded-xl bg-surface-base/80 backdrop-blur border border-surface-border space-y-2 pointer-events-none">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Graph Legend</p>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-500 to-red-800" /><span className="text-xs text-slate-300">Suspicious File (≥70%)</span></div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600" /><span className="text-xs text-slate-300">Normal File (≤69%)</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-red-500" /><span className="text-xs text-slate-300">High Similarity Match</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-slate-500" /><span className="text-xs text-slate-300">Low Similarity Match</span></div>
                </div>

                {/* Sidebar Overlay: Node Info */}
                <AnimatePresence>
                    {selectedNode && (
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 50 }}
                            className="absolute top-4 right-4 w-72 bg-surface-base/90 backdrop-blur-md border border-surface-border rounded-xl shadow-2xl p-4 flex flex-col z-20"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <HiOutlineDocumentText className="w-4 h-4 text-accent-cyan" /> File Details
                                </h3>
                                <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white"><HiOutlineX /></button>
                            </div>

                            <p className="font-mono text-xs text-white bg-surface-secondary p-2 rounded truncate border border-surface-border mb-4" title={selectedNode.id}>
                                {selectedNode.id}
                            </p>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="p-2 rounded bg-surface-secondary border border-surface-border">
                                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Connections</p>
                                    <p className="text-lg font-bold text-white mt-0.5">{selectedNode.degree}</p>
                                </div>
                                <div className="p-2 rounded bg-surface-secondary border border-surface-border">
                                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Avg Similarity</p>
                                    <p className={`text-lg font-bold mt-0.5 ${selectedNode.avgSimilarity >= 0.7 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {(selectedNode.avgSimilarity * 100).toFixed(0)}%
                                    </p>
                                </div>
                            </div>

                            {selectedNode.suspicious && (
                                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded mb-2">
                                    <p className="text-xs text-red-400 font-semibold flex items-center gap-1">
                                        <HiOutlineExclamationCircle /> High Risk File
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Sidebar Overlay: Edge Info */}
                    {selectedEdge && (
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 50 }}
                            className="absolute top-4 right-4 w-80 bg-surface-base/95 backdrop-blur-md border border-surface-border rounded-xl shadow-2xl p-4 flex flex-col z-20"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <HiOutlineAdjustments className="w-4 h-4 text-accent-purple" /> Pair Analysis
                                </h3>
                                <button onClick={() => setSelectedEdge(null)} className="text-slate-400 hover:text-white"><HiOutlineX /></button>
                            </div>

                            <div className="space-y-2 mb-4">
                                <p className="font-mono text-[10px] text-slate-300 bg-surface-secondary px-2 py-1.5 rounded truncate border border-surface-border" title={selectedEdge.source}>
                                    <span className="text-slate-500 mr-2">A</span> {shortName(selectedEdge.source)}
                                </p>
                                <p className="font-mono text-[10px] text-slate-300 bg-surface-secondary px-2 py-1.5 rounded truncate border border-surface-border" title={selectedEdge.target}>
                                    <span className="text-slate-500 mr-2">B</span> {shortName(selectedEdge.target)}
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary border border-surface-border mb-4">
                                <span className="text-xs font-semibold text-white">Overall Similarity</span>
                                <span className={`text-xl font-black ${selectedEdge.weight >= 0.7 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {(selectedEdge.weight * 100).toFixed(0)}%
                                </span>
                            </div>



                            {selectedEdge.pairData.refined_verdict && (
                                <div className="mt-4 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded">
                                    <p className="text-xs text-emerald-400 font-semibold mb-1">AI Verdict: {selectedEdge.pairData.refined_verdict.refined_risk_level}</p>
                                    <p className="text-[10px] text-emerald-400/80 leading-relaxed max-h-24 overflow-y-auto pr-1">
                                        {selectedEdge.pairData.refined_verdict.reasoning}
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Analytics Summary Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div className="bg-surface-base border border-surface-border rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-secondary"><DocumentIcon className="w-5 h-5 text-slate-400" /></div>
                    <div><p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Files</p><p className="text-xl font-bold text-white">{nodes.length}</p></div>
                </div>
                <div className="bg-surface-base border border-surface-border rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10"><HiOutlineExclamationCircle className="w-5 h-5 text-red-400" /></div>
                    <div><p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Suspicious Files</p><p className="text-xl font-bold text-red-400">{metrics.suspiciousNodes}</p></div>
                </div>
                <div className="bg-surface-base border border-surface-border rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10"><HiOutlineCollection className="w-5 h-5 text-amber-400" /></div>
                    <div><p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Related Clusters</p><p className="text-xl font-bold text-amber-400">{metrics.clusters}</p></div>
                </div>
                <div className="bg-surface-base border border-surface-border rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10"><HiOutlineAdjustments className="w-5 h-5 text-cyan-400" /></div>
                    <div><p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Edges Shown</p><p className="text-xl font-bold text-cyan-400">{edges.length}</p></div>
                </div>
            </div>
        </div>
    );
}

function DocumentIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
    )
}
