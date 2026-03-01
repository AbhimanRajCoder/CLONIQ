import axios from 'axios';
import {
    AnalysisResult,
    VisualizeASTResponse,
    StructureSummaryResponse,
} from '@/types';

import { supabase } from '@/lib/supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 120000, // 2 minutes for large repos
});

api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
});

// ══════════════════════════════════════════════════════════════
//  Unified analysis endpoints — all return AnalysisResult
// ══════════════════════════════════════════════════════════════

// ── POST /analyze — Upload multiple .py files ────────────────
export async function analyzeFiles(files: File[]): Promise<AnalysisResult> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const { data } = await api.post<AnalysisResult>('/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
}

// ── POST /analyze-pair — Upload exactly two .py files ────────
export async function analyzePair(file1: File, file2: File): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append('file1', file1);
    formData.append('file2', file2);
    const { data } = await api.post<AnalysisResult>('/analyze-pair', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
}

// ── POST /compare-zips — Upload two ZIP archives ─────────────
export async function compareZips(zip1: File, zip2: File): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append('zip1', zip1);
    formData.append('zip2', zip2);
    const { data } = await api.post<AnalysisResult>('/compare-zips', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
}

// ── POST /compare-github-repos — Compare two repo URLs ──────
export async function compareGithubRepos(
    repoUrl1: string,
    repoUrl2: string
): Promise<AnalysisResult> {
    const { data } = await api.post<AnalysisResult>('/compare-github-repos', {
        repo_url_1: repoUrl1,
        repo_url_2: repoUrl2,
    });
    return data;
}

// ── POST /analyze-google-sheet — Batch from Google Sheet ─────
export async function analyzeGoogleSheet(
    googleSheetUrl: string
): Promise<AnalysisResult> {
    const { data } = await api.post<AnalysisResult>('/analyze-google-sheet', {
        google_sheet_url: googleSheetUrl,
    });
    return data;
}

// ══════════════════════════════════════════════════════════════
//  Standalone endpoints (not part of unified flow)
// ══════════════════════════════════════════════════════════════

// ── POST /visualize-ast — Upload single .py → AST tree ──────
export async function visualizeAST(file: File): Promise<VisualizeASTResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<VisualizeASTResponse>('/visualize-ast', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
}

// ── POST /structure-summary — Upload single .py → metrics ───
export async function structureSummary(file: File): Promise<StructureSummaryResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<StructureSummaryResponse>('/structure-summary', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
}

// ── GET /analysis/{id}/ast — Fetch AST for a specific file in a completed analysis
export async function getAnalysisAst(analysisId: string, filename: string): Promise<VisualizeASTResponse> {
    const { data } = await api.get<VisualizeASTResponse>(`/analysis/${analysisId}/ast`, {
        params: { file: filename }
    });
    return data;
}
