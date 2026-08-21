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

const data = JSON.parse(fs.readFileSync('extracted_scripts.json', 'utf8'));
console.log(`Loaded ${data.length} videos from extracted_scripts.json`);

const availableScriptsCount = data.filter(d => d.script && !d.script.startsWith('[Script')).length;

let htmlContent = `<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <title>Adeep Vishwakarma - YouTube Channel All Video Scripts</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');
        
        @page {
            size: A4;
            margin: 15mm 15mm 15mm 15mm;
        }

        body {
            font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', Arial, sans-serif;
            color: #1a1a1a;
            line-height: 1.7;
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
            border: 3px solid #ff0000;
            padding: 50px 30px;
            box-sizing: border-box;
            border-radius: 12px;
            margin-top: 10px;
        }

        .channel-logo {
            width: 90px;
            height: 90px;
            background-color: #ff0000;
            color: white;
            font-size: 40px;
            font-weight: bold;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 25px auto;
            box-shadow: 0 4px 10px rgba(255,0,0,0.3);
        }

        .cover-title {
            font-size: 34px;
            font-weight: 700;
            color: #111;
            margin-bottom: 10px;
        }

        .cover-subtitle {
            font-size: 20px;
            color: #ff0000;
            font-weight: 600;
            margin-bottom: 35px;
        }

        .cover-meta {
            font-size: 15px;
            color: #444;
            line-height: 2;
            background-color: #f9fafb;
            padding: 20px 40px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
            display: inline-block;
            text-align: left;
        }

        .toc-page {
            page-break-after: always;
            padding: 10px 0;
        }

        .toc-header {
            font-size: 24px;
            font-weight: 700;
            color: #ff0000;
            border-bottom: 2.5px solid #ff0000;
            padding-bottom: 8px;
            margin-bottom: 25px;
        }

        .toc-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .toc-item {
            font-size: 13px;
            padding: 8px 12px;
            background: #f8fafc;
            border-radius: 6px;
            border: 1px solid #edf2f7;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .toc-item a {
            color: #1e293b;
            text-decoration: none;
            font-weight: 600;
        }

        .video-card {
            page-break-inside: avoid;
            margin-bottom: 30px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 22px;
            background-color: #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.03);
        }

        .video-header {
            border-bottom: 2px solid #edf2f7;
            padding-bottom: 12px;
            margin-bottom: 16px;
        }

        .video-number {
            font-size: 12px;
            font-weight: 700;
            color: #ff0000;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }

        .video-title {
            font-size: 19px;
            font-weight: 700;
            color: #0f172a;
            margin: 6px 0 10px 0;
            line-height: 1.4;
        }

        .video-meta {
            font-size: 12px;
            color: #64748b;
        }

        .video-meta a {
            color: #2563eb;
            text-decoration: none;
            word-break: break-all;
        }

        .video-script {
            font-size: 14px;
            color: #334155;
            text-align: justify;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.8;
            background: #fafafa;
            padding: 18px;
            border-left: 4px solid #ff0000;
            border-radius: 6px;
        }

        .no-script {
            font-style: italic;
            color: #94a3b8;
            background: #fef2f2;
            border-left-color: #fca5a5;
        }
    </style>
</head>
<body>

    <div class="cover-page">
        <div class="channel-logo">AV</div>
        <div class="cover-title">Adeep Vishwakarma</div>
        <div class="cover-subtitle">Complete YouTube Channel Video Scripts Collection</div>
        <div class="cover-meta">
            <strong>YouTube Channel:</strong> @adeep_vishwakarma<br>
            <strong>Channel URL:</strong> https://www.youtube.com/@adeep_vishwakarma<br>
            <strong>Total Videos Included:</strong> ${data.length}<br>
            <strong>Videos with Subtitles/Scripts:</strong> ${availableScriptsCount}<br>
            <strong>Generated Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
    </div>

    <div class="toc-page">
        <div class="toc-header">📋 Table of Contents (वीडियो सूची)</div>
        <div class="toc-grid">
`;

data.forEach((item, idx) => {
    const isAvailable = item.script && !item.script.startsWith('[Script');
    const wordCount = isAvailable ? item.script.split(/\s+/).length : 0;
    htmlContent += `
            <div class="toc-item">
                <span><strong>#${idx + 1}</strong> <a href="#video-${item.id}">${escapeHtml(item.title)}</a></span>
                <span style="color:${isAvailable ? '#16a34a' : '#dc2626'}; font-weight:600; font-size:11px; padding:2px 8px; background:${isAvailable ? '#f0fdf4' : '#fef2f2'}; border-radius:4px;">
                    ${isAvailable ? wordCount + ' words' : 'No Subtitles'}
                </span>
            </div>`;
});

htmlContent += `
        </div>
    </div>

    <h2 style="font-size: 22px; color: #0f172a; margin-top: 30px; margin-bottom: 25px; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
        📝 Complete Video Scripts
    </h2>
`;

data.forEach((item, idx) => {
    const isAvailable = item.script && !item.script.startsWith('[Script');
    const wordCount = isAvailable ? item.script.split(/\s+/).length : 0;
    htmlContent += `
    <div class="video-card" id="video-${item.id}">
        <div class="video-header">
            <div class="video-number">Video #${idx + 1}</div>
            <div class="video-title">${escapeHtml(item.title)}</div>
            <div class="video-meta">
                <strong>URL:</strong> <a href="${item.url}" target="_blank">${item.url}</a> | 
                <strong>Status:</strong> ${isAvailable ? `${wordCount} words` : 'Captions Not Available'}
            </div>
        </div>
        <div class="video-script ${isAvailable ? '' : 'no-script'}">
            ${escapeHtml(item.script)}
        </div>
    </div>`;
});

htmlContent += `
</body>
</html>`;

fs.writeFileSync('Adeep_Vishwakarma_Scripts.html', htmlContent, 'utf8');
console.log('Successfully written Adeep_Vishwakarma_Scripts.html');

// Convert to PDF using Edge
const pdfPath = path.resolve('Adeep_Vishwakarma_Channel_Scripts.pdf');
const htmlPath = path.resolve('Adeep_Vishwakarma_Scripts.html');

const cmd = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless --disable-gpu --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;

console.log('Generating PDF...');
execSync(cmd);
console.log('PDF Generated successfully!');
