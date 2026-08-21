const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { YoutubeTranscript } = require('youtube-transcript');

// Take channel handle or URL from command line argument
let channelInput = process.argv[2] || '@adeep_vishwakarma';
let handle = channelInput.replace('https://www.youtube.com/', '').replace('/', '');
if (!handle.startsWith('@')) {
    handle = '@' + handle;
}

const sanitizeName = handle.replace('@', '');

async function main() {
    console.log(`====================================================`);
    console.log(`🎬 YOUTUBE CHANNEL SCRIPT EXTRACTOR & PDF GENERATOR`);
    console.log(`Target Channel: ${handle}`);
    console.log(`====================================================\n`);

    console.log('--- STEP 1: Fetching Channel Video Metadata with yt-dlp ---');
    const jsonlFile = `${sanitizeName}_playlist.jsonl`;
    const ytdlpCmd = `.\\yt-dlp.exe --flat-playlist -j "https://www.youtube.com/${handle}/videos" > ${jsonlFile}`;

    try {
        console.log(`Fetching videos list for ${handle}...`);
        execSync(ytdlpCmd, { shell: 'powershell.exe' });
    } catch (e) {
        console.log('yt-dlp warning/error:', e.message);
    }

    if (!fs.existsSync(jsonlFile)) {
        console.error(`Error: Could not fetch video list for ${handle}`);
        return;
    }

    const content = fs.readFileSync(jsonlFile, 'utf16le');
    const lines = content.trim().split('\n').filter(Boolean);

    const videoList = [];
    for (const line of lines) {
        try {
            const data = JSON.parse(line);
            videoList.push({
                id: data.id,
                title: data.title || `Video ${data.id}`,
                url: `https://www.youtube.com/watch?v=${data.id}`
            });
        } catch (e) {}
    }

    console.log(`Found ${videoList.length} videos on ${handle}.\n`);

    console.log('--- STEP 2: Extracting Transcripts/Scripts for Each Video ---');
    const fullData = [];

    for (let i = 0; i < videoList.length; i++) {
        const item = videoList[i];
        console.log(`[${i + 1}/${videoList.length}] Extracting: "${item.title}"`);
        
        let scriptText = '';
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(item.id, { lang: 'hi' });
            if (transcript && transcript.length > 0) {
                scriptText = transcript.map(t => t.text).join(' ');
            } else {
                const fallback = await YoutubeTranscript.fetchTranscript(item.id);
                if (fallback && fallback.length > 0) {
                    scriptText = fallback.map(t => t.text).join(' ');
                } else {
                    scriptText = '[Script / Captions Not Available for this video]';
                }
            }
        } catch (err) {
            scriptText = '[Script / Captions Not Available for this video]';
        }

        fullData.push({
            index: i + 1,
            id: item.id,
            title: item.title,
            url: item.url,
            script: scriptText,
            wordCount: scriptText.startsWith('[Script') ? 0 : scriptText.split(/\s+/).length
        });

        await new Promise(r => setTimeout(r, 200));
    }

    const jsonFile = `${sanitizeName}_scripts.json`;
    fs.writeFileSync(jsonFile, JSON.stringify(fullData, null, 2), 'utf8');

    console.log('\n--- STEP 3: Generating HTML E-Book ---');
    const availableScriptsCount = fullData.filter(d => !d.script.startsWith('[Script')).length;

    let htmlContent = `<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <title>${sanitizeName} - YouTube Channel Scripts</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', sans-serif; color: #1a1a1a; line-height: 1.7; }
        .cover-page { page-break-after: always; min-height: 85vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border: 3px solid #ff0000; padding: 40px; border-radius: 12px; }
        .channel-logo { width: 80px; height: 80px; background: #ff0000; color: #fff; font-size: 36px; font-weight: bold; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
        .cover-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
        .cover-subtitle { font-size: 18px; color: #ff0000; font-weight: 600; margin-bottom: 30px; }
        .cover-meta { font-size: 14px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: left; display: inline-block; }
        .toc-page { page-break-after: always; padding: 10px 0; }
        .toc-header { font-size: 22px; font-weight: 700; color: #ff0000; border-bottom: 2px solid #ff0000; padding-bottom: 6px; margin-bottom: 20px; }
        .toc-item { font-size: 13px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #edf2f7; display: flex; justify-content: space-between; margin-bottom: 6px; }
        .toc-item a { color: #1e293b; text-decoration: none; font-weight: 600; }
        .video-card { page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: #fff; }
        .video-number { font-size: 12px; font-weight: 700; color: #ff0000; }
        .video-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 4px 0 8px 0; }
        .video-meta { font-size: 12px; color: #64748b; margin-bottom: 12px; }
        .video-script { font-size: 14px; color: #334155; white-space: pre-wrap; line-height: 1.8; background: #fafafa; padding: 16px; border-left: 4px solid #ff0000; border-radius: 6px; }
        .no-script { font-style: italic; color: #94a3b8; background: #fef2f2; border-left-color: #fca5a5; }
    </style>
</head>
<body>
    <div class="cover-page">
        <div class="channel-logo">YT</div>
        <div class="cover-title">${sanitizeName}</div>
        <div class="cover-subtitle">Complete YouTube Video Scripts Collection</div>
        <div class="cover-meta">
            <strong>Channel Handle:</strong> ${handle}<br>
            <strong>Total Videos:</strong> ${fullData.length}<br>
            <strong>Scripts Extracted:</strong> ${availableScriptsCount}<br>
            <strong>Generated Date:</strong> ${new Date().toLocaleDateString()}
        </div>
    </div>
    <div class="toc-page">
        <div class="toc-header">📋 Table of Contents</div>
        ${fullData.map(item => `
            <div class="toc-item">
                <span><strong>#${item.index}</strong> <a href="#video-${item.id}">${escapeHtml(item.title)}</a></span>
                <span>${item.wordCount > 0 ? item.wordCount + ' words' : 'No Subtitles'}</span>
            </div>
        `).join('')}
    </div>
    <h2>📝 Video Scripts</h2>
    ${fullData.map(item => `
        <div class="video-card" id="video-${item.id}">
            <div class="video-number">Video #${item.index}</div>
            <div class="video-title">${escapeHtml(item.title)}</div>
            <div class="video-meta">URL: <a href="${item.url}">${item.url}</a> | Words: ${item.wordCount}</div>
            <div class="video-script ${item.wordCount > 0 ? '' : 'no-script'}">${escapeHtml(item.script)}</div>
        </div>
    `).join('')}
</body>
</html>`;

    const htmlFile = `${sanitizeName}_scripts.html`;
    fs.writeFileSync(htmlFile, htmlContent, 'utf8');

    console.log('\n--- STEP 4: Converting HTML to PDF with Edge Headless ---');
    const pdfFile = `${sanitizeName}_scripts.pdf`;
    const pdfPath = path.resolve(pdfFile);
    const htmlPath = path.resolve(htmlFile);

    const cmd = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless --disable-gpu --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
    execSync(cmd);

    console.log(`\n🎉 DONE! Generated PDF: ${pdfPath}`);
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main().catch(console.error);
