// ══════════════════════════════════════════════════════════════
//  CLONIQ – Unified TypeScript Type System
// ══════════════════════════════════════════════════════════════

// ── Atomic types ─────────────────────────────────────────────

export interface CodeLine {
    line_number: number;
    code: string;
}

export interface MatchingRegion {
    file1_lines: [number, number];
    file2_lines: [number, number];
    file1_code: CodeLine[];
    file2_code: CodeLine[];
}

export interface LLMVerdict {
    classification: string;
    confidence: string;
    algorithm_detected: string;
    reasoning: string;
    ai_adjusted_similarity_score?: number;
    adjustment_explanation?: string;
    error?: string;
}

export interface RefinedVerdict {
    refined_classification: string;
    refined_risk_level: string;
    original_structural_score: number;
    ai_adjusted_similarity_score?: number;
    llm_classification: string;
    llm_confidence: string;
    algorithm_detected: string;
    reasoning: string;
    recommendation: string;
}

export interface SuspiciousPair {
    file1: string;
    file2: string;
    similarity_score: number;
    matching_regions: MatchingRegion[];
    llm_verdict?: LLMVerdict;
    refined_verdict?: RefinedVerdict;
}

// ── Graph types ──────────────────────────────────────────────

export interface GraphNode {
    id: string;
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// ── Matrix types ─────────────────────────────────────────────

export interface MatrixData {
    files: string[];
    values: number[][];
}

// ── Cluster types ────────────────────────────────────────────

export interface Cluster {
    members: string[];
    average_similarity: number;
}

// ── File metrics ─────────────────────────────────────────────

export interface MetricsData {
    ast_depth: number;
    function_count: number;
    loop_count: number;
    if_count: number;
    basic_cyclomatic_complexity: number;
}

export interface FileMetrics {
    file: string;
    metrics: MetricsData;
    total_subtrees: number;
    unique_subtrees: number;
}

// ══════════════════════════════════════════════════════════════
//  Unified Analysis Result
//  Returned by all POST analysis endpoints
// ══════════════════════════════════════════════════════════════

export interface AnalysisSummary {
    total_files: number;
    suspicious_pairs_count: number;
    highest_similarity: number;
    cluster_count: number;
    // Optional fields for zip/github analysis
    user1_zip?: string;
    user2_zip?: string;
    user1_files?: number;
    user2_files?: number;
    repo_1?: string;
    repo_2?: string;
    repo_1_files?: number;
    repo_2_files?: number;
    overall_similarity?: number;
    // Google Sheet batch fields
    source?: string;
    google_sheet_url?: string;
    total_repositories?: number;
    total_students?: number;
    successfully_fetched?: number;
    failed_fetches?: number;
}

export interface SimilarityResult {
    pairs: SuspiciousPair[];
    matrix: MatrixData;
    graph: GraphData;
    clusters: Cluster[];
}

export interface AnalysisMetadata {
    analysis_type: string;
    timestamp: string;
    llm_enabled?: boolean;
}

export interface LLMSummary {
    pairs_evaluated_by_llm: number;
    classification_breakdown: Record<string, number>;
    risk_level_breakdown: Record<string, number>;
    likely_copy_count: number;
    standard_algorithm_count: number;
    template_count: number;
}

export interface BatchStudent {
    name: string;
    urn: string;
    github_url: string;
    files_count: string;
}

export interface BatchFetchError {
    student: string;
    github_url: string;
    error: string;
}

export interface BatchMetadata {
    students: BatchStudent[];
    fetch_errors: BatchFetchError[];
    csv_warnings: string[];
    total_comparisons: number;
}

export interface AnalysisResult {
    analysis_id: string;
    summary: AnalysisSummary;
    files: string[];
    similarity: SimilarityResult;
    metrics: FileMetrics[];
    metadata: AnalysisMetadata;
    errors?: { file: string; error: string }[];
    llm_summary?: LLMSummary;
    batch_metadata?: BatchMetadata;
}

// ── Standalone endpoint types (unchanged) ────────────────────

export interface ASTTreeNode {
    name: string;
    children?: ASTTreeNode[];
}

export interface VisualizeASTResponse {
    filename: string;
    ast_tree: ASTTreeNode;
}

export interface StructureSummaryResponse {
    file: string;
    metrics: MetricsData;
    total_subtrees: number;
    unique_subtrees: number;
}
