const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { YoutubeTranscript } = require('youtube-transcript');

const { breakScriptIntoScenes } = require('./lib/scene_breakdown');
const { generateAllSceneImages } = require('./lib/image_generator');
const { renderKineticVideo } = require('./lib/video_renderer');

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

// Start Channel Extraction & Processing API
app.post('/api/extract', async (req, res) => {
    const { 
        channelUrl, 
        videoLimit = '50',
        outputMode = 'pdf', // 'pdf', 'video', 'both'
        aspectRatio = '16:9' // '16:9', '9:16'
    } = req.body;

    if (!channelUrl) {
        return res.status(400).json({ error: 'Channel URL or handle is required' });
    }

    let handle = channelUrl.trim()
        .replace(/https?:\/\/(www\.)?youtube\.com\//i, '')
        .replace(/\/videos\/?$/, '')
        .replace(/\/$/, '');

    if (!handle.startsWith('@')) {
        handle = '@' + handle;
    }

    const sanitizeName = handle.replace(/[@/\\?%*:|"<>]/g, '_');
    const jobId = 'job_' + Date.now();

    activeJobs.set(jobId, {
        jobId,
        handle,
        videoLimit,
        outputMode,
        aspectRatio,
        status: 'starting',
        message: 'Initializing channel video lookup...',
        progress: 5,
        totalVideos: 0,
        processedCount: 0,
        currentVideoTitle: '',
        pdfUrl: '',
        videoUrl: '',
        fileName: ''
    });

    res.json({ jobId, message: 'Processing started' });

    runExtractionTask(jobId, handle, sanitizeName, videoLimit, outputMode, aspectRatio);
});

async function runExtractionTask(jobId, handle, sanitizeName, videoLimit, outputMode, aspectRatio) {
    const job = activeJobs.get(jobId);
    const jobTempDir = path.join(__dirname, 'temp_jobs', jobId);

    try {
        fs.mkdirSync(jobTempDir, { recursive: true });

        job.status = 'fetching_list';
        const limitLabel = videoLimit === 'all' ? 'all' : `latest ${videoLimit}`;
        job.message = `Fetching ${limitLabel} videos for ${handle}...`;
        job.progress = 10;

        const jsonlFile = path.join(jobTempDir, `${sanitizeName}_playlist.jsonl`);
        const limitFlag = (videoLimit && videoLimit !== 'all') ? `--playlist-end ${parseInt(videoLimit, 10)}` : '';
        const ytdlpCmd = `.\\yt-dlp.exe --flat-playlist -j ${limitFlag} "https://www.youtube.com/${handle}/videos" > "${jsonlFile}"`;

        try {
            execSync(ytdlpCmd, { shell: 'powershell.exe', cwd: __dirname });
        } catch (e) {
            console.log('yt-dlp command warning:', e.message);
        }

        if (!fs.existsSync(jsonlFile)) {
            job.status = 'error';
            job.message = `Could not find or fetch videos for YouTube handle: ${handle}`;
            return;
        }

        const content = fs.readFileSync(jsonlFile, 'utf16le');
        const lines = content.trim().split('\n').filter(Boolean);

        let videoList = [];
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

        if (videoLimit && videoLimit !== 'all') {
            const maxCount = parseInt(videoLimit, 10);
            if (videoList.length > maxCount) {
                videoList = videoList.slice(0, maxCount);
            }
        }

        if (videoList.length === 0) {
            job.status = 'error';
            job.message = `No videos found on channel ${handle}.`;
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

            job.progress = Math.round(15 + ((i + 1) / videoList.length) * 25);
            job.message = `Extracting Script [${i + 1}/${videoList.length}]: "${item.title}"`;

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

            await new Promise(r => setTimeout(r, 80));
        }

        // --- PIPELINE 1: GENERATE PDF E-BOOK ---
        if (outputMode === 'pdf' || outputMode === 'both') {
            job.status = 'generating_pdf';
            job.message = 'Generating HTML E-Book and rendering PDF document...';
            job.progress = outputMode === 'both' ? 45 : 85;

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
            <strong>Channel Handle:</strong> ${escapeHtml(handle)}<br>
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

            const cmd = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless --disable-gpu --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
            execSync(cmd);

            job.fileName = pdfFileName;
            job.pdfUrl = `/api/download/${pdfFileName}`;
        }

        // --- PIPELINE 2: GENERATE KINETIC TYPOGRAPHY VIDEO ---
        if (outputMode === 'video' || outputMode === 'both') {
            job.status = 'generating_scene_images';
            job.message = 'Breaking scripts into kinetic scenes & downloading AI background images...';
            job.progress = outputMode === 'both' ? 55 : 45;

            // Gather all available script scenes
            let allScenes = [];
            const validVideos = fullData.filter(d => d.wordCount > 0);

            if (validVideos.length > 0) {
                // Break top videos into kinetic scenes (up to 30 scenes max for high engagement)
                validVideos.forEach(v => {
                    const vScenes = breakScriptIntoScenes(v.script);
                    allScenes.push(...vScenes);
                });
            }

            // Cap at 35 scenes max for optimum render speed & performance
            if (allScenes.length > 35) {
                allScenes = allScenes.slice(0, 35);
            }

            if (allScenes.length === 0) {
                allScenes.push({
                    index: 1,
                    text: `Welcome to YouTube Channel ${handle}`,
                    wordCount: 5,
                    duration: 3.5,
                    emoji: '🚀',
                    imagePrompt: 'cinematic photographic YouTube content creation studio background'
                });
            }

            // Step A: Download AI Background Images in Parallel Batches
            const imagePaths = await generateAllSceneImages(
                allScenes, 
                aspectRatio, 
                jobTempDir, 
                (current, total, text) => {
                    const startPct = outputMode === 'both' ? 55 : 45;
                    const endPct = outputMode === 'both' ? 70 : 65;
                    job.progress = Math.round(startPct + (current / total) * (endPct - startPct));
                    job.message = `AI Image Gen [${current}/${total}]: "${(text || '').substring(0, 35)}..."`;
                }
            );

            // Step B: Render Kinetic Video (Canvas + FFmpeg)
            job.status = 'rendering_kinetic_video';
            job.message = `Rendering Kinetic Typography Video (${aspectRatio})...`;
            job.progress = outputMode === 'both' ? 72 : 68;

            const outputDir = path.join(__dirname, 'output_videos');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const cleanRatioName = aspectRatio.replace(':', 'x');
            const videoFileName = `${sanitizeName}_Kinetic_${cleanRatioName}.mp4`;
            const videoFilePath = path.join(outputDir, videoFileName);

            await renderKineticVideo(
                allScenes, 
                imagePaths, 
                aspectRatio, 
                videoFilePath, 
                jobTempDir,
                (renderedScene, totalScenes) => {
                    const startPct = outputMode === 'both' ? 72 : 68;
                    const endPct = 95;
                    job.progress = Math.round(startPct + (renderedScene / totalScenes) * (endPct - startPct));
                    job.message = `Rendering Video Scene [${renderedScene}/${totalScenes}]`;
                }
            );

            job.videoUrl = `/api/download-video/${videoFileName}`;
        }

        job.status = 'completed';
        job.progress = 100;
        job.message = 'Processing completed successfully!';

        if (outputMode === 'pdf' && fs.existsSync(jobTempDir)) {
            try { fs.rmSync(jobTempDir, { recursive: true, force: true }); } catch (e) {}
        }

    } catch (err) {
        console.error('Task error:', err);
        job.status = 'error';
        job.message = `Error processing request: ${err.message}`;
    }
}

// Download PDF API
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Download Video MP4 API
app.get('/api/download-video/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'output_videos', filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ error: 'Video file not found' });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 YouTube Script PDF & Kinetic Video Web App running at:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`====================================================`);
});
