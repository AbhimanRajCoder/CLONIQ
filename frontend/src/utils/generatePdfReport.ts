/**
 * generatePdfReport.ts
 * ═══════════════════
 * Generates a professional plagiarism analysis PDF report
 * using jsPDF + jspdf-autotable.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalysisResult, SuspiciousPair } from '@/types';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Extract student name from a pair file label.
 * Labels look like: "Alice (URN001)/main.py"
 * Returns "Alice (URN001)" or the raw filename.
 */
function extractStudentLabel(filePath: string): string {
    const slashIdx = filePath.indexOf('/');
    if (slashIdx > 0) {
        return filePath.substring(0, slashIdx);
    }
    return filePath;
}

function extractFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
}

function getRiskLabel(pair: SuspiciousPair): string {
    if (pair.refined_verdict) {
        return pair.refined_verdict.refined_risk_level;
    }
    const score = pair.similarity_score;
    if (score >= 0.85) return 'HIGH';
    if (score >= 0.7) return 'MEDIUM';
    return 'LOW';
}

// ── Main export ──────────────────────────────────────────────

export function generatePdfReport(result: AnalysisResult): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleString();
    const isBatch = result.metadata.analysis_type === 'google_sheet_batch';
    const batch = result.batch_metadata;

    // ═══════════════════════════════════════════════════════════
    //  PAGE 1: Cover / Summary
    // ═══════════════════════════════════════════════════════════

    // Title
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('CLONIQ — Plagiarism Analysis Report', 14, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 174, 192);
    doc.text(`Generated: ${now}  |  Analysis ID: ${result.analysis_id}`, 14, 35);
    doc.text(`Engine: AST + CFG + DataFlow + Gemini AI Semantic Judge`, 14, 42);

    // Summary cards
    let y = 60;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Analysis Summary', 14, y);
    y += 8;

    const summaryData: string[][] = [
        ['Analysis Type', result.metadata.analysis_type.replace(/_/g, ' ').toUpperCase()],
        ['Total Files Analyzed', String(result.summary.total_files)],
        ['Suspicious Pairs Found', String(result.summary.suspicious_pairs_count)],
        ['Highest Similarity', `${(result.summary.highest_similarity * 100).toFixed(1)}%`],
        ['Clusters Detected', String(result.summary.cluster_count)],
    ];

    if (isBatch && batch) {
        summaryData.push(
            ['Total Students', String(result.summary.total_students ?? batch.students.length)],
            ['Repos Fetched', String(result.summary.successfully_fetched ?? batch.students.length)],
            ['Fetch Failures', String(result.summary.failed_fetches ?? batch.fetch_errors.length)],
            ['Total Comparisons', String(batch.total_comparisons)],
        );
    }

    if (result.llm_summary && result.llm_summary.pairs_evaluated_by_llm > 0) {
        summaryData.push(
            ['AI Pairs Evaluated', String(result.llm_summary.pairs_evaluated_by_llm)],
            ['AI Likely Copies', String(result.llm_summary.likely_copy_count)],
        );
    }

    autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
        margin: { left: 14, right: 14 },
    });

    // ═══════════════════════════════════════════════════════════
    //  PAGE 2: Students Table (batch mode only)
    // ═══════════════════════════════════════════════════════════

    if (isBatch && batch && batch.students.length > 0) {
        doc.addPage();

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text('Student Repositories', 14, 14);

        const studentRows = batch.students.map((s, i) => [
            String(i + 1),
            s.name,
            s.urn,
            s.github_url,
            s.files_count,
        ]);

        autoTable(doc, {
            startY: 28,
            head: [['#', 'Name', 'URN', 'GitHub URL', 'Files']],
            body: studentRows,
            theme: 'striped',
            headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 35 },
                2: { cellWidth: 30 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 15 },
            },
            margin: { left: 14, right: 14 },
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  PAGE 3+: Suspicious Pairs Table
    // ═══════════════════════════════════════════════════════════

    const pairs = result.similarity.pairs;
    if (pairs.length > 0) {
        doc.addPage();

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text(`Suspicious Pairs (${pairs.length})`, 14, 14);

        const pairRows = pairs.map((p, i) => {
            const student1 = extractStudentLabel(p.file1);
            const student2 = extractStudentLabel(p.file2);
            const file1 = extractFileName(p.file1);
            const file2 = extractFileName(p.file2);
            const score = `${(p.similarity_score * 100).toFixed(1)}%`;
            const aiScore = p.refined_verdict?.ai_adjusted_similarity_score !== undefined
                ? `${(p.refined_verdict.ai_adjusted_similarity_score * 100).toFixed(1)}%`
                : '—';
            const risk = getRiskLabel(p);
            const algo = p.refined_verdict?.algorithm_detected !== 'NONE'
                ? (p.refined_verdict?.algorithm_detected || '—')
                : '—';

            return [
                String(i + 1),
                student1,
                student2,
                `${file1} ↔ ${file2}`,
                score,
                aiScore,
                risk,
                algo,
                String(p.matching_regions.length),
            ];
        });

        autoTable(doc, {
            startY: 28,
            head: [['#', 'Student 1', 'Student 2', 'Files', 'Structural', 'AI Score', 'Risk', 'Algorithm', 'Matches']],
            body: pairRows,
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 7 },
            bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 32 },
                2: { cellWidth: 32 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 18, halign: 'center' },
                5: { cellWidth: 18, halign: 'center' },
                6: { cellWidth: 15, halign: 'center' },
                7: { cellWidth: 30 },
                8: { cellWidth: 15, halign: 'center' },
            },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                // Color-code risk column
                if (data.section === 'body' && data.column.index === 6) {
                    const val = String(data.cell.raw);
                    if (val === 'CRITICAL' || val === 'HIGH') {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (val === 'MEDIUM') {
                        data.cell.styles.textColor = [217, 119, 6];
                        data.cell.styles.fontStyle = 'bold';
                    } else {
                        data.cell.styles.textColor = [22, 163, 74];
                    }
                }
                // Color-code structural score
                if (data.section === 'body' && data.column.index === 4) {
                    const numVal = parseFloat(String(data.cell.raw));
                    if (numVal >= 80) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (numVal >= 60) {
                        data.cell.styles.textColor = [217, 119, 6];
                    }
                }
            },
        });

        // ═══════════════════════════════════════════════════════════
        //  PAGE 4+: Suspicious Clusters
        // ═══════════════════════════════════════════════════════════

        const clusters = result.similarity.clusters || [];
        if (clusters.length > 0) {
            doc.addPage();
            doc.setFillColor(88, 28, 135); // purple-900
            doc.rect(0, 0, pageWidth, 20, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.text(`Detected Similarity Clusters (${clusters.length})`, 14, 14);

            const clusterRows = clusters.map((cluster, idx) => {
                const membersStr = cluster.members.map(m => {
                    const student = extractStudentLabel(m);
                    const file = extractFileName(m);
                    return isBatch && student !== file ? `${student} — ${file}` : file;
                }).join('\n');
                return [
                    String(idx + 1),
                    membersStr,
                    String(cluster.members.length),
                    `${(cluster.average_similarity * 100).toFixed(1)}%`
                ];
            });

            autoTable(doc, {
                startY: 28,
                head: [['Cluster #', 'Files in Cluster', 'Member Count', 'Avg Similarity']],
                body: clusterRows,
                theme: 'striped',
                headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
                margin: { left: 14, right: 14 },
                columnStyles: {
                    0: { cellWidth: 20 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 30, halign: 'center' },
                    3: { cellWidth: 30, halign: 'center' },
                },
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  PAGE: Fetch Errors (batch mode, if any)
    // ═══════════════════════════════════════════════════════════

    if (isBatch && batch && batch.fetch_errors.length > 0) {
        doc.addPage();

        doc.setFillColor(127, 29, 29);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text(`Fetch Errors (${batch.fetch_errors.length})`, 14, 14);

        const errorRows = batch.fetch_errors.map((e, i) => [
            String(i + 1),
            e.student,
            e.github_url,
            e.error,
        ]);

        autoTable(doc, {
            startY: 28,
            head: [['#', 'Student', 'GitHub URL', 'Error']],
            body: errorRows,
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
            margin: { left: 14, right: 14 },
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  Footer on all pages
    // ═══════════════════════════════════════════════════════════

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setTextColor(160, 174, 192);
        doc.text(
            `CLONIQ — Code Plagiarism Detector  |  Page ${i} of ${totalPages}  |  ${now}`,
            pageWidth / 2, pageH - 5,
            { align: 'center' }
        );
    }

    // ── Save ─────────────────────────────────────────────────
    const filename = isBatch
        ? `plagiarism_report_batch_${result.analysis_id.slice(0, 8)}.pdf`
        : `plagiarism_report_${result.analysis_id.slice(0, 8)}.pdf`;

    doc.save(filename);
}
