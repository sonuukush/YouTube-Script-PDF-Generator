const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { YoutubeTranscript } = require('youtube-transcript');

const { generateText, generateScriptAndTitlesForVideo, calculateTextSimilarity, sleep } = require('./lib/text_generator');
const { 
    rankVideosByRetentionScore, 
    extractHookText, 
    analyzeLengthVsViewsPattern, 
    extractTrendingKeywords 
} = require('./lib/competitor_analyzer');
const { generateCompetitorPdfReport, renderPdfFromHtml } = require('./lib/competitor_report_pdf');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const activeJobs = new Map();

function escapeHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTranscriptViaYtDlp(videoId) {
    try {
        const tmpDir = os.tmpdir();
        const outputPrefix = path.join(tmpDir, `ytsubs_${videoId}_${Date.now()}`);
        const ytDlpCmd = getYtDlpExe();

        // 1. Try native Hindi subtitle tracks first
        let cmd = `${ytDlpCmd} --write-sub --write-auto-sub --skip-download --sub-format vtt --sub-lang "hi,hi-orig,hi-IN" --output "${outputPrefix}" "https://www.youtube.com/watch?v=${videoId}"`;
        try {
            execSync(cmd, { cwd: __dirname, timeout: 15000, stdio: 'ignore' });
        } catch (e) {}

        let baseName = path.basename(outputPrefix);
        let files = fs.readdirSync(tmpDir).filter(f => f.startsWith(baseName) && f.endsWith('.vtt'));

        // 2. If Hindi not found, try native English subtitle tracks
        if (files.length === 0) {
            cmd = `${ytDlpCmd} --write-sub --write-auto-sub --skip-download --sub-format vtt --sub-lang "en,en-orig,en-US" --output "${outputPrefix}" "https://www.youtube.com/watch?v=${videoId}"`;
            try {
                execSync(cmd, { cwd: __dirname, timeout: 15000, stdio: 'ignore' });
            } catch (e) {}
            files = fs.readdirSync(tmpDir).filter(f => f.startsWith(baseName) && f.endsWith('.vtt'));
        }

        if (files.length > 0) {
            const preferredFile = files.find(f => f.includes('.hi.')) || files.find(f => f.includes('.hi-orig.')) || files.find(f => f.includes('.en.')) || files[0];
            const vttPath = path.join(tmpDir, preferredFile);
            const vttContent = fs.readFileSync(vttPath, 'utf8');

            files.forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)); } catch(e){} });

            const lines = vttContent.split('\n');
            const textParts = [];
            let lastLine = '';

            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:') || line.includes('-->') || line.startsWith('NOTE')) {
                    continue;
                }
                const clean = line.replace(/<[^>]+>/g, '').trim();
                if (clean && clean !== lastLine) {
                    textParts.push(clean);
                    lastLine = clean;
                }
            }

            const fullText = textParts.join(' ').trim();
            if (fullText.length > 0) {
                console.log(`[yt-dlp] Extracted transcript for ${videoId} (${preferredFile})`);
                return fullText;
            }
        }
    } catch (err) {
        console.log('yt-dlp transcript extraction error:', err.message);
    }
    return null;
}

async function getRobustTranscript(videoId) {
    // 1. Try YoutubeTranscript default track (most reliable for primary caption)
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcript && transcript.length > 0) {
            const text = transcript.map(t => t.text).join(' ').trim();
            if (text.length > 0) {
                return text;
            }
        }
    } catch (e) {}

    // 2. Try specific language tracks ('hi', 'en', 'hi-orig', 'hi-Latn', 'en-US')
    const languages = ['hi', 'en', 'hi-orig', 'hi-Latn', 'en-US'];
    for (const lang of languages) {
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
            if (transcript && transcript.length > 0) {
                const text = transcript.map(t => t.text).join(' ').trim();
                if (text.length > 0) {
                    return text;
                }
            }
        } catch (e) {}
    }

    // 3. Fallback: Parse captionTracks from YouTube HTML player response
    try {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
            }
        });
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/"captionTracks":\s*(\[.*?\])/);
            if (match) {
                const tracks = JSON.parse(match[1]);
                const preferredTrack = tracks.find(t => t.languageCode === 'hi') || 
                                       tracks.find(t => t.languageCode === 'en') || 
                                       tracks[0];
                if (preferredTrack && preferredTrack.baseUrl) {
                    const subRes = await fetch(preferredTrack.baseUrl);
                    if (subRes.ok) {
                        const xmlText = await subRes.text();
                        const textMatches = Array.from(xmlText.matchAll(/<text[^>]*>(.*?)<\/text>/gi));
                        if (textMatches.length > 0) {
                            const cleanText = textMatches
                                .map(m => m[1]
                                    .replace(/&amp;/g, '&')
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/&#39;/g, "'")
                                    .replace(/&quot;/g, '"')
                                    .replace(/<[^>]+>/g, ''))
                                .join(' ');
                            if (cleanText.trim().length > 0) {
                                return cleanText.trim();
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.log('CaptionTracks scraper error:', e.message);
    }

    // 4. Fallback to yt-dlp binary (Handles cloud/datacenter IP blocks seamlessly)
    const ytDlpText = getTranscriptViaYtDlp(videoId);
    if (ytDlpText) {
        return ytDlpText;
    }

    return '[Script / Captions Not Available for this video]';
}

function getYtDlpExe() {
    const localExe = path.join(__dirname, 'yt-dlp.exe');
    if (process.platform === 'win32' && fs.existsSync(localExe)) {
        return `.\\yt-dlp.exe`;
    }
    if (fs.existsSync('/usr/local/bin/yt-dlp')) {
        return '/usr/local/bin/yt-dlp';
    }
    return 'yt-dlp';
}


function execYtDlp(cmdStr) {
    if (process.platform === 'win32') {
        return execSync(cmdStr, { shell: 'powershell.exe', cwd: __dirname, encoding: 'utf8' });
    } else {
        return execSync(cmdStr, { shell: '/bin/sh', cwd: __dirname, encoding: 'utf8' });
    }
}

async function fetchChannelVideosFallback(displayHandle) {
    const handle = displayHandle.replace(/^@/, '');
    const urls = [
        `https://www.youtube.com/@${handle}/videos`,
        `https://www.youtube.com/c/${handle}/videos`,
        `https://www.youtube.com/user/${handle}/videos`
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            if (!res.ok) continue;
            const html = await res.text();
            
            const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/window\["ytInitialData"\] = ({.*?});/s);
            if (match) {
                const jsonStr = match[1];
                const videoIdMatches = Array.from(jsonStr.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g));
                const titleMatches = Array.from(jsonStr.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}/g));

                const seen = new Set();
                const videos = [];
                for (let i = 0; i < videoIdMatches.length; i++) {
                    const id = videoIdMatches[i][1];
                    if (!seen.has(id)) {
                        seen.add(id);
                        const title = (titleMatches[i] && titleMatches[i][1]) ? titleMatches[i][1] : `Video ${id}`;
                        videos.push({
                            id,
                            title,
                            url: `https://www.youtube.com/watch?v=${id}`,
                            viewCount: 10000,
                            likeCount: 500,
                            durationSec: 570
                        });
                    }
                }
                if (videos.length > 0) return videos;
            }
        } catch (e) {
            console.log('Fallback channel scraper note:', e.message);
        }
    }
    return [];
}

/**
 * Robust YouTube URL & handle resolver.
 * Handles @handle, handle without @, full channel URLs, custom URLs, etc.
 */
function parseYouTubeChannel(input) {
    let raw = (input || '').trim();
    if (!raw) {
        return { displayHandle: '@channel', sanitizeName: '_channel', targetUrl: '' };
    }

    // Clean up accidental filename artifacts (e.g. if user pastes _Drk-Minds_competitor_playlist.jsonl)
    raw = raw.replace(/(_competitor_playlist|_playlist)?\.jsonl$/i, '')
             .replace(/_scripts\.(html|pdf)$/i, '')
             .replace(/_competitor_growth_report\.(html|pdf)$/i, '');

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        let cleanUrl = raw.replace(/\/videos\/?$/i, '').replace(/\/$/, '');
        let match = cleanUrl.match(/youtube\.com\/(@[^\/]+)/i);
        let displayHandle = match ? match[1] : ('@' + cleanUrl.split('/').pop());
        let sanitizeName = displayHandle.replace(/[@/\\?%*:|"<>]/g, '_');
        let targetUrl = cleanUrl.endsWith('/videos') ? cleanUrl : `${cleanUrl}/videos`;
        return { displayHandle, sanitizeName, targetUrl };
    }

    // Strip leading underscores if copied from a filename like _Drk-Minds
    let cleanHandle = raw.replace(/^_+/, '');
    let displayHandle = cleanHandle.startsWith('@') ? cleanHandle : '@' + cleanHandle;
    let sanitizeName = displayHandle.replace(/[@/\\?%*:|"<>]/g, '_');
    let targetUrl = `https://www.youtube.com/${displayHandle}/videos`;
    return { displayHandle, sanitizeName, targetUrl };
}

/**
 * Safely reads a jsonl file attempting utf16le and utf8 encodings.
 */
function readJsonlFileSafely(filePath) {
    if (!fs.existsSync(filePath)) return '';
    try {
        let content = fs.readFileSync(filePath, 'utf16le');
        if (content.trim().startsWith('{')) return content;
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return fs.readFileSync(filePath, 'utf8');
    }
}

// SSE Endpoint for Live Progress Updates
app.get('/api/progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(() => {
        const job = activeJobs.get(jobId);
        if (job) {
            sendEvent(job);
            if (job.status === 'completed' || job.status === 'error') {
                clearInterval(interval);
                res.end();
            }
        }
    }, 500);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// --- EXISTING PIPELINE: PDF Script E-Book Extraction ---
app.post('/api/extract', async (req, res) => {
    const { channelUrl, videoLimit = '50' } = req.body;

    if (!channelUrl) {
        return res.status(400).json({ error: 'Channel URL or handle is required' });
    }

    const { displayHandle, sanitizeName, targetUrl } = parseYouTubeChannel(channelUrl);
    const jobId = 'job_' + Date.now();

    activeJobs.set(jobId, {
        jobId,
        handle: displayHandle,
        videoLimit,
        status: 'starting',
        message: 'Initializing channel video lookup...',
        progress: 5,
        totalVideos: 0,
        processedCount: 0,
        currentVideoTitle: '',
        pdfUrl: '',
        fileName: ''
    });

    res.json({ jobId, message: 'Processing started' });

    runExtractionTask(jobId, displayHandle, sanitizeName, targetUrl, videoLimit);
});

async function runExtractionTask(jobId, displayHandle, sanitizeName, targetUrl, videoLimit) {
    const job = activeJobs.get(jobId);

    try {
        job.status = 'fetching_list';
        const limitLabel = videoLimit === 'all' ? 'all' : `latest ${videoLimit}`;
        job.message = `Fetching ${limitLabel} videos for ${displayHandle}...`;
        job.progress = 10;

        const jsonlFile = path.join(__dirname, `${sanitizeName}_playlist.jsonl`);
        const limitFlag = (videoLimit && videoLimit !== 'all') ? `--playlist-end ${parseInt(videoLimit, 10)}` : '';
        const ytdlpBin = getYtDlpExe();
        const ytdlpCmd = `${ytdlpBin} --flat-playlist -j ${limitFlag} "${targetUrl}" > "${jsonlFile}"`;

        try {
            execYtDlp(ytdlpCmd);
        } catch (e) {
            console.log('yt-dlp command warning:', e.message);
        }

        const content = readJsonlFileSafely(jsonlFile);
        let videoList = [];
        if (content) {
            const lines = content.trim().split('\n').filter(Boolean);
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
        }

        if (videoList.length === 0) {
            console.log('yt-dlp returned no videos, invoking fetchChannelVideosFallback for ' + displayHandle);
            videoList = await fetchChannelVideosFallback(displayHandle);
        }

        if (videoList.length === 0) {
            job.status = 'error';
            job.message = `Could not find or fetch videos for YouTube handle: ${displayHandle}`;
            return;
        }

        if (videoLimit && videoLimit !== 'all') {
            const maxCount = parseInt(videoLimit, 10);
            if (videoList.length > maxCount) {
                videoList = videoList.slice(0, maxCount);
            }
        }

        if (videoList.length === 0) {
            job.status = 'error';
            job.message = `No videos found on channel ${displayHandle}.`;
            return;
        }

        job.totalVideos = videoList.length;
        job.status = 'extracting_scripts';
        job.message = `Found ${videoList.length} videos. Extracting scripts...`;
        job.progress = 15;

        const fullData = [];

        for (let i = 0; i < videoList.length; i++) {
            const item = videoList[i];
            job.processedCount = i + 1;
            job.currentVideoTitle = item.title;

            job.progress = Math.round(15 + ((i + 1) / videoList.length) * 60);
            job.message = `Extracting Script [${i + 1}/${videoList.length}]: "${item.title}"`;

            const scriptText = await getRobustTranscript(item.id);

            fullData.push({
                index: i + 1,
                id: item.id,
                title: item.title,
                url: item.url,
                script: scriptText,
                wordCount: scriptText.startsWith('[Script') ? 0 : scriptText.split(/\s+/).length
            });

            await new Promise(r => setTimeout(r, 40));
        }

        // GENERATE PDF E-BOOK
        job.status = 'generating_pdf';
        job.message = 'Generating HTML E-Book and rendering PDF document...';
        job.progress = 85;

        const availableScriptsCount = fullData.filter(d => !d.script.startsWith('[Script')).length;
        const scopeText = videoLimit === 'all' ? 'All Videos' : `Latest ${videoList.length} Videos`;

        let htmlContent = `<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(sanitizeName)} - YouTube Channel Scripts (${scopeText})</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Plus Jakarta Sans', Arial, sans-serif; color: #1e293b; line-height: 1.7; margin: 0; padding: 0; background-color: #fff; }
        .cover-page { page-break-after: always; min-height: 85vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border: 3px solid #ff0000; padding: 40px; border-radius: 12px; margin-top: 10px; }
        .channel-logo { width: 85px; height: 85px; background: #ff0000; color: #fff; font-size: 38px; font-weight: bold; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 4px 12px rgba(255,0,0,0.3); }
        .cover-title { font-size: 32px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
        .cover-subtitle { font-size: 19px; color: #ff0000; font-weight: 600; margin-bottom: 30px; }
        .cover-meta { font-size: 14px; background: #f8fafc; padding: 20px 35px; border-radius: 10px; border: 1px solid #e2e8f0; text-align: left; display: inline-block; line-height: 2; }
        .toc-page { page-break-after: always; padding: 10px 0; }
        .toc-header { font-size: 24px; font-weight: 700; color: #ff0000; border-bottom: 2.5px solid #ff0000; padding-bottom: 8px; margin-bottom: 20px; }
        .toc-item { font-size: 13px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #edf2f7; display: flex; justify-content: space-between; margin-bottom: 6px; }
        .toc-item a { color: #1e293b; text-decoration: none; font-weight: 600; }
        .video-card { page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px; background: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
        .video-number { font-size: 12px; font-weight: 700; color: #ff0000; text-transform: uppercase; letter-spacing: 0.8px; }
        .video-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 6px 0 10px 0; }
        .video-meta { font-size: 12px; color: #64748b; margin-bottom: 12px; }
        .video-meta a { color: #2563eb; text-decoration: none; }
        .video-script { font-size: 14px; color: #334155; text-align: justify; white-space: pre-wrap; line-height: 1.8; background: #fafafa; padding: 18px; border-left: 4px solid #ff0000; border-radius: 6px; }
        .no-script { font-style: italic; color: #94a3b8; background: #fef2f2; border-left-color: #fca5a5; }
    </style>
</head>
<body>
    <div class="cover-page">
        <div class="channel-logo">YT</div>
        <div class="cover-title">${escapeHtml(sanitizeName)}</div>
        <div class="cover-subtitle">YouTube Video Scripts Collection (${scopeText})</div>
        <div class="cover-meta">
            <strong>Channel Handle:</strong> ${escapeHtml(displayHandle)}<br>
            <strong>Extraction Scope:</strong> ${scopeText}<br>
            <strong>Total Videos Included:</strong> ${fullData.length}<br>
            <strong>Videos with Scripts:</strong> ${availableScriptsCount}<br>
            <strong>Generated Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
    </div>
    <div class="toc-page">
        <div class="toc-header">📋 Table of Contents (${scopeText})</div>
        ${fullData.map(item => `
            <div class="toc-item">
                <span><strong>#${item.index}</strong> <a href="#video-${item.id}">${escapeHtml(item.title)}</a></span>
                <span style="color:${item.wordCount > 0 ? '#16a34a' : '#dc2626'}; font-weight:600;">
                    ${item.wordCount > 0 ? item.wordCount + ' words' : 'No Subtitles'}
                </span>
            </div>
        `).join('')}
    </div>
    <h2 style="font-size: 22px; color: #0f172a; margin-top: 30px; margin-bottom: 25px; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
        📝 Complete Video Scripts
    </h2>
    ${fullData.map(item => `
        <div class="video-card" id="video-${item.id}">
            <div class="video-number">Video #${item.index}</div>
            <div class="video-title">${escapeHtml(item.title)}</div>
            <div class="video-meta">URL: <a href="${item.url}" target="_blank">${item.url}</a> | Words: ${item.wordCount}</div>
            <div class="video-script ${item.wordCount > 0 ? '' : 'no-script'}">${escapeHtml(item.script)}</div>
        </div>
    `).join('')}
</body>
</html>`;

        const suffix = videoLimit === 'all' ? '_All' : `_Top${videoLimit}`;
        const htmlFileName = `${sanitizeName}${suffix}_scripts.html`;
        const pdfFileName = `${sanitizeName}${suffix}_scripts.pdf`;
        const htmlPath = path.join(__dirname, htmlFileName);
        const pdfPath = path.join(__dirname, pdfFileName);

        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        renderPdfFromHtml(htmlPath, pdfPath);

        job.fileName = pdfFileName;
        job.pdfUrl = `/api/download/${pdfFileName}`;

        job.status = 'completed';
        job.progress = 100;
        job.message = 'Processing completed successfully! PDF is ready.';

    } catch (err) {
        console.error('Task error:', err);
        job.status = 'error';
        job.message = `Error processing request: ${err.message}`;
    }
}

// --- NEW FEATURE: CHANNEL GROWTH RESEARCH MODE (POLLINATIONS.AI CLOUD TEXT API) ---
app.post('/api/analyze-competitor', async (req, res) => {
    const { channelUrl, competitorLimit = '5' } = req.body;

    if (!channelUrl) {
        return res.status(400).json({ error: 'Competitor Channel URL or handle is required' });
    }

    const { displayHandle, sanitizeName, targetUrl } = parseYouTubeChannel(channelUrl);
    const jobId = 'job_growth_' + Date.now();

    activeJobs.set(jobId, {
        jobId,
        handle: displayHandle,
        competitorLimit,
        status: 'starting',
        message: `Initializing competitor research for ${displayHandle}...`,
        progress: 5,
        pdfUrl: '',
        fileName: ''
    });

    res.json({ jobId, message: 'Competitor Research task started' });

    runCompetitorAnalysisTask(jobId, displayHandle, sanitizeName, targetUrl, competitorLimit);
});

async function runCompetitorAnalysisTask(jobId, displayHandle, sanitizeName, targetUrl, competitorLimit) {
    const job = activeJobs.get(jobId);

    try {
        // STEP 1: FETCH ALL COMPETITOR VIDEOS METADATA
        job.status = 'fetching_channel_videos';
        job.message = `Fetching videos & engagement metadata for competitor ${displayHandle}...`;
        job.progress = 10;

        const jsonlFile = path.join(__dirname, `${sanitizeName}_competitor_playlist.jsonl`);
        if (fs.existsSync(jsonlFile)) {
            try { fs.unlinkSync(jsonlFile); } catch (e) {}
        }

        const ytdlpBin = getYtDlpExe();
        const ytdlpCmd = `${ytdlpBin} --flat-playlist -j "${targetUrl}" > "${jsonlFile}"`;

        try {
            execYtDlp(ytdlpCmd);
        } catch (e) {
            console.log('yt-dlp competitor warning:', e.message);
        }

        const content = readJsonlFileSafely(jsonlFile);
        let rawVideos = [];
        if (content) {
            const lines = content.trim().split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    rawVideos.push({
                        id: data.id,
                        title: data.title || `Video ${data.id}`,
                        url: `https://www.youtube.com/watch?v=${data.id}`,
                        viewCount: data.view_count || data.views || 0,
                        likeCount: data.like_count || data.likes || 0,
                        durationSec: data.duration || 0,
                        uploadDate: data.upload_date || ''
                    });
                } catch (e) {}
            }
        }

        if (rawVideos.length === 0) {
            console.log('yt-dlp returned no competitor videos, invoking fetchChannelVideosFallback for ' + displayHandle);
            rawVideos = await fetchChannelVideosFallback(displayHandle);
        }

        if (rawVideos.length === 0) {
            job.status = 'error';
            job.message = `Could not find or fetch video metadata for competitor handle: ${displayHandle}`;
            return;
        }

        if (rawVideos.length === 0) {
            job.status = 'error';
            job.message = `No video metadata found for competitor ${displayHandle}.`;
            return;
        }

        // STEP 2: RANK VIDEOS BY COMPOSITE RETENTION PROXY SCORE
        job.status = 'ranking_by_retention_score';
        job.message = `Analyzing ${rawVideos.length} videos. Computing retention scores...`;
        job.progress = 20;

        const limitNum = parseInt(competitorLimit, 10) || 5;
        const candidateVideos = rankVideosByRetentionScore(rawVideos, limitNum);

        // Enrich candidate videos with detailed likes metadata via yt-dlp --dump-json
        job.message = `Fetching detailed engagement & likes metadata for Top ${candidateVideos.length} videos...`;
        for (let i = 0; i < candidateVideos.length; i++) {
            const item = candidateVideos[i];
            try {
                const ytdlpBin = getYtDlpExe();
                const dumpCmd = `${ytdlpBin} --dump-json "https://www.youtube.com/watch?v=${item.id}"`;
                const dumpJsonStr = execYtDlp(dumpCmd);
                if (dumpJsonStr) {
                    const detail = JSON.parse(dumpJsonStr);
                    if (detail.like_count !== undefined && detail.like_count !== null) {
                        item.likeCount = detail.like_count;
                        item.likes = detail.like_count;
                    }
                    if (detail.view_count) item.viewCount = detail.view_count;
                    if (detail.duration) item.durationSec = detail.duration;
                }
            } catch (e) {
                console.log(`yt-dlp dump-json info note for video ${item.id}:`, e.message);
            }

            if (!item.likeCount && item.likeCount !== 0) {
                job.message = `Likes count hidden by creator for '${item.title}' — using view-only retention scoring`;
            }
        }

        // Re-rank with accurate likes metadata
        const topVideos = rankVideosByRetentionScore(candidateVideos, limitNum);
        
        // STEP 3: EXTRACT TRANSCRIPTS & HOOKS FOR TOP VIDEOS
        job.status = 'extracting_hooks';
        job.message = `Extracting transcripts and opening hooks for Top ${topVideos.length} videos...`;
        job.progress = 30;

        const fullData = [];
        const hooks = [];

        for (let i = 0; i < topVideos.length; i++) {
            const item = topVideos[i];
            job.progress = Math.round(30 + ((i + 1) / topVideos.length) * 15);
            job.message = `Extracting Transcript & Hook [${i + 1}/${topVideos.length}]: "${item.title}"`;

            const scriptText = await getRobustTranscript(item.id);

            const hookText = extractHookText(scriptText);

            fullData.push({
                index: i + 1,
                id: item.id,
                title: item.title,
                url: item.url,
                script: scriptText,
                hook: hookText,
                wordCount: scriptText.startsWith('[Script') ? 0 : scriptText.split(/\s+/).length
            });

            hooks.push({
                index: i + 1,
                videoTitle: item.title,
                videoUrl: item.url,
                hookText: hookText
            });

            await new Promise(r => setTimeout(r, 40));
        }

        // STEP 4: GENERATE NEW ORIGINAL SCRIPTS VIA AI TEXT GENERATOR
        job.status = 'generating_new_scripts';
        job.message = `Generating ${fullData.length} New Original Scripts...`;
        job.progress = 45;

        const generatedScripts = [];

        for (let i = 0; i < fullData.length; i++) {
            const videoData = fullData[i];
            videoData.durationSec = topVideos[i] ? (topVideos[i].durationSec || 570) : 570;
            job.progress = Math.round(45 + ((i + 1) / fullData.length) * 35);
            job.message = `Generating Full-Length Original Script & Titles [${i + 1}/${fullData.length}]: "${videoData.title}"`;

            let res = await generateScriptAndTitlesForVideo(videoData);

            // Similarity check against previously generated scripts in batch
            for (const prev of generatedScripts) {
                const sim = calculateTextSimilarity(res.scriptText, prev.scriptText);
                if (sim > 0.20) {
                    console.warn(`Script similarity warning (${Math.round(sim * 100)}%) between script #${i + 1} and script #${prev.index}. Unique angle active.`);
                    job.message = `Script #${i + 1} checked for unique topic content (${Math.round(sim * 100)}% similarity).`;
                    break;
                }
            }

            generatedScripts.push({
                index: i + 1,
                inspiredByTitle: videoData.title,
                inspiredByUrl: videoData.url,
                suggestedMainTitle: res.suggestedMainTitle,
                titlesText: res.titlesText,
                scriptText: res.scriptText,
                wordCount: res.wordCount || res.scriptText.split(/\s+/).length
            });
        }

        // STEP 5: ANALYZE NICHE TRENDS & DURATION PATTERNS
        job.status = 'analyzing_trends';
        job.message = 'Analyzing niche keyword trends & video duration performance...';
        job.progress = 85;

        const lengthAnalysis = analyzeLengthVsViewsPattern(topVideos);
        const trendingKeywords = extractTrendingKeywords(fullData);

        // STEP 6: BUILD STYLED PDF REPORT
        job.status = 'building_pdf';
        job.message = 'Compiling Research Report HTML and rendering PDF document...';
        job.progress = 92;

        const pdfFileName = `${sanitizeName}_Competitor_Growth_Report.pdf`;
        const pdfPath = path.join(__dirname, pdfFileName);

        generateCompetitorPdfReport({
            handle: displayHandle,
            topVideos,
            hooks,
            lengthAnalysis,
            trendingKeywords,
            generatedScripts
        }, pdfPath);

        job.fileName = pdfFileName;
        job.pdfUrl = `/api/download/${pdfFileName}`;

        job.status = 'completed';
        job.progress = 100;
        job.message = 'Competitor Research & AI Script Generation completed successfully!';

    } catch (err) {
        console.error('Competitor Task error:', err);
        job.status = 'error';
        job.message = `Error processing request: ${err.message}`;
    }
}

// Download PDF / HTML API Route
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    let filePath = path.join(__dirname, filename);

    // If requested .pdf is missing on server disk, but corresponding .html file exists, attempt on-the-fly PDF render!
    if (!fs.existsSync(filePath) && filename.endsWith('.pdf')) {
        const htmlFile = filePath.replace(/\.pdf$/i, '.html');
        if (fs.existsSync(htmlFile)) {
            console.log(`PDF missing on server disk, rendering on-the-fly from ${htmlFile}...`);
            try {
                renderPdfFromHtml(htmlFile, filePath);
            } catch (e) {
                console.error('On-the-fly PDF render failed:', e.message);
            }
        }
    }

    if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
        } else if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.sendFile(filePath);
    } else {
        res.status(404).type('text/plain').send(`File ${filename} not found on server.`);
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 YouTube Script PDF & Competitor Research Studio running at:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`====================================================`);
});
