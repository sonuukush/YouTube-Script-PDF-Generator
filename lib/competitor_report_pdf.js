/**
 * lib/competitor_report_pdf.js
 * Builds styled HTML and converts to downloadable PDF for Competitor Research Reports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function escapeHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generates HTML and converts it to PDF via Edge Headless.
 * @param {Object} reportData - All report metrics, top videos, hooks, and LLM generated scripts
 * @param {string} outputPdfPath - Target absolute path for PDF
 * @returns {string} PDF file path
 */
function generateCompetitorPdfReport(reportData, outputPdfPath) {
    const {
        handle,
        modelName,
        topVideos,
        hooks,
        lengthAnalysis,
        trendingKeywords,
        generatedScripts
    } = reportData;

    const sanitizeName = handle.replace(/[@/\\?%*:|"<>]/g, '_');
    const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let htmlContent = `<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <title>Channel Growth Research & AI Content Report - ${escapeHtml(handle)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');
        @page { size: A4; margin: 15mm; }
        body { 
            font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Plus Jakarta Sans', Arial, sans-serif; 
            color: #1e293b; 
            line-height: 1.6; 
            margin: 0; 
            padding: 0; 
            background-color: #fff; 
        }
        
        .cover-page { 
            page-break-after: always; 
            min-height: 85vh; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            align-items: center; 
            text-align: center; 
            border: 3px solid #2563eb; 
            padding: 40px; 
            border-radius: 16px; 
            margin-top: 10px; 
            background: linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);
        }
        .report-badge {
            background: #2563eb;
            color: #ffffff;
            font-size: 13px;
            font-weight: 700;
            padding: 6px 16px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 20px;
        }
        .cover-title { font-size: 30px; font-weight: 800; color: #0f172a; margin-bottom: 10px; }
        .cover-subtitle { font-size: 18px; color: #2563eb; font-weight: 600; margin-bottom: 30px; }
        .cover-meta { 
            font-size: 14px; 
            background: #ffffff; 
            padding: 22px 35px; 
            border-radius: 12px; 
            border: 1px solid #cbd5e1; 
            text-align: left; 
            display: inline-block; 
            line-height: 2;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .section-header { 
            font-size: 22px; 
            font-weight: 800; 
            color: #0f172a; 
            border-bottom: 3px solid #2563eb; 
            padding-bottom: 8px; 
            margin-top: 35px; 
            margin-bottom: 20px;
            page-break-before: always;
        }
        .first-section { page-break-before: avoid; }

        .card { 
            background: #ffffff; 
            border: 1px solid #e2e8f0; 
            border-radius: 10px; 
            padding: 18px 22px; 
            margin-bottom: 20px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }

        /* Tables */
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        th { background: #1e293b; color: #ffffff; font-weight: 700; text-align: left; padding: 10px 12px; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }

        .highlight-box {
            background: #eff6ff;
            border-left: 4px solid #2563eb;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .hook-item {
            background: #f8fafc;
            border-left: 4px solid #f59e0b;
            padding: 14px 18px;
            border-radius: 6px;
            margin-bottom: 14px;
        }
        .hook-title { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 4px; }
        .hook-text { font-style: italic; color: #475569; font-size: 13px; }

        .script-card {
            page-break-inside: avoid;
            margin-bottom: 30px;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 24px;
            background: #ffffff;
        }
        .script-badge {
            display: inline-block;
            background: #10b981;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 12px;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .script-title { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
        .script-meta { font-size: 12px; color: #64748b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px dashed #e2e8f0; }
        
        .titles-box {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 14px 18px;
            margin-bottom: 18px;
        }
        .titles-header { font-weight: 700; color: #166534; font-size: 13px; margin-bottom: 6px; }

        .script-content {
            font-size: 14px;
            color: #334155;
            white-space: pre-wrap;
            line-height: 1.8;
            background: #fafafa;
            padding: 18px;
            border-radius: 8px;
            border: 1px solid #f1f5f9;
        }
    </style>
</head>
<body>

    <!-- COVER PAGE -->
    <div class="cover-page">
        <div class="report-badge">🚀 Channel Growth & AI Content Research</div>
        <div class="cover-title">Competitor Analysis & Original Content Generator</div>
        <div class="cover-subtitle">Target Channel: ${escapeHtml(handle)}</div>
        <div class="cover-meta">
            <strong>Target Channel Handle:</strong> ${escapeHtml(handle)}<br>
            <strong>Analysis Scope:</strong> Top 20 High-Retention Performing Videos<br>
            <strong>Local AI LLM Engine:</strong> Ollama (${escapeHtml(modelName)})<br>
            <strong>New Original Scripts Generated:</strong> ${generatedScripts.length}<br>
            <strong>Report Date:</strong> ${formattedDate}
        </div>
    </div>

    <!-- SECTION 1: EXECUTIVE INSIGHTS -->
    <div class="section-header first-section">📊 Section 1: Executive Niche Insights</div>
    
    <div class="highlight-box">
        <strong>💡 Optimal Video Length Pattern:</strong><br>
        Videos in the <strong>${escapeHtml(lengthAnalysis.bestBucketRange)}</strong> category had the highest average performance for this competitor channel, averaging <strong>${lengthAnalysis.bestBucketAvgViews.toLocaleString()} views</strong> per video.
    </div>

    <h3 style="font-size:16px; color:#0f172a; margin-top:20px;">⏱️ Video Length vs Average Views Breakdown</h3>
    <table>
        <thead>
            <tr>
                <th>Video Length Range</th>
                <th>Video Count</th>
                <th>Total Combined Views</th>
                <th>Average Views / Video</th>
            </tr>
        </thead>
        <tbody>
            ${lengthAnalysis.breakdown.map(b => `
                <tr>
                    <td><strong>${escapeHtml(b.range)}</strong></td>
                    <td>${b.videoCount}</td>
                    <td>${b.totalViews.toLocaleString()}</td>
                    <td><strong style="color:#2563eb;">${b.avgViews.toLocaleString()}</strong></td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h3 style="font-size:16px; color:#0f172a; margin-top:25px;">🔥 Top Recurring Niche Keywords & Topics</h3>
    <table>
        <thead>
            <tr>
                <th>Rank</th>
                <th>Topic / Keyword</th>
                <th>Frequency Across Transcripts</th>
            </tr>
        </thead>
        <tbody>
            ${trendingKeywords.slice(0, 12).map((k, idx) => `
                <tr>
                    <td>#${idx + 1}</td>
                    <td><strong style="color:#0f172a;">${escapeHtml(k.word)}</strong></td>
                    <td>${k.count} mentions</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <!-- SECTION 2: TOP 20 COMPETITOR VIDEOS & HOOKS -->
    <div class="section-header">🔥 Section 2: Top 20 High-Retention Videos & Hooks</div>
    
    <p style="font-size:13px; color:#64748b; margin-bottom:15px;">
        Ranked by composite view-retention score (views ratio, engagement likes, and recency factor).
    </p>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Video Title</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Duration</th>
                <th>Score</th>
            </tr>
        </thead>
        <tbody>
            ${topVideos.map((v, idx) => `
                <tr>
                    <td><strong>#${idx + 1}</strong></td>
                    <td><a href="${v.url}" target="_blank" style="color:#2563eb; text-decoration:none;">${escapeHtml(v.title)}</a></td>
                    <td>${v.views.toLocaleString()}</td>
                    <td>${v.likes > 0 ? v.likes.toLocaleString() : 'N/A'}</td>
                    <td>${v.formattedDuration}</td>
                    <td><span style="background:#dbeafe; color:#1e40af; font-weight:700; padding:2px 8px; border-radius:10px;">${v.compositeScore}</span></td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h3 style="font-size:16px; color:#0f172a; margin-top:30px; margin-bottom:15px;">🎣 First 15-30 Second Opening Hooks Analysis</h3>
    ${hooks.map((h, idx) => `
        <div class="hook-item">
            <div class="hook-title">#${idx + 1}. ${escapeHtml(h.videoTitle)}</div>
            <div class="hook-text">"${escapeHtml(h.hookText)}"</div>
        </div>
    `).join('')}

    <!-- SECTION 3: NEW ORIGINAL SCRIPTS GENERATED BY LOCAL OLLAMA LLM -->
    <div class="section-header">💡 Section 3: 20 Original AI Scripts & Title Suggestions</div>
    <p style="font-size:13px; color:#64748b; margin-bottom:20px;">
        Generated using Local Ollama LLM (<strong>${escapeHtml(modelName)}</strong>). Guardrails applied: 100% original script structure, explanations, and wording inspired by competitor topics.
    </p>

    ${generatedScripts.map((item, idx) => `
        <div class="script-card">
            <div class="script-badge">Original Script Idea #${idx + 1}</div>
            <div class="script-title">New Script: ${escapeHtml(item.suggestedMainTitle || item.inspiredByTitle)}</div>
            <div class="script-meta">
                <strong>Inspired By Competitor Video:</strong> <a href="${item.inspiredByUrl}" target="_blank">${escapeHtml(item.inspiredByTitle)}</a>
            </div>

            <div class="titles-box">
                <div class="titles-header">🎯 High-CTR YouTube Title Suggestions (Pick One):</div>
                <div style="font-size:13px; color:#14532d; white-space:pre-wrap; line-height:1.6;">${escapeHtml(item.titlesText)}</div>
            </div>

            <h4 style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:8px;">📝 Complete Original Script:</h4>
            <div class="script-content">${escapeHtml(item.scriptText)}</div>
        </div>
    `).join('')}

</body>
</html>`;

    const htmlPath = outputPdfPath.replace(/\.pdf$/i, '.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // Render PDF via Edge Headless
    const cmd = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless --disable-gpu --print-to-pdf="${outputPdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
    execSync(cmd);

    return outputPdfPath;
}

module.exports = {
    generateCompetitorPdfReport
};
