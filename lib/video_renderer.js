/**
 * Kinetic Typography Video Renderer Engine
 * Uses @napi-rs/canvas + fluent-ffmpeg + @ffmpeg-installer/ffmpeg.
 * Registers OS-independent Devanagari font from assets/fonts/mangal.ttf via GlobalFonts.
 * Performs Ken Burns zoom, kinetic text animation, FFmpeg H.264 MP4 encoding,
 * and automatic sub-directory cleanup.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

// Register OS-Independent Devanagari Font
const fontPath = path.join(__dirname, '../assets/fonts/mangal.ttf');
if (fs.existsSync(fontPath)) {
    try {
        GlobalFonts.registerFromPath(fontPath, 'Mangal');
        console.log(`[VideoRenderer] Registered OS-independent font: ${fontPath}`);
    } catch (e) {
        console.warn(`[VideoRenderer Warning] Font registration failed: ${e.message}`);
    }
} else {
    console.warn(`[VideoRenderer Warning] Font file not found at ${fontPath}`);
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

async function renderKineticVideo(scenes, imagePaths, aspectRatio, outputVideoPath, currentVideoTempDir, onProgress) {
    const width = aspectRatio === '9:16' ? 720 : 1280;
    const height = aspectRatio === '9:16' ? 1280 : 720;
    const fps = 25;

    const framesDir = path.join(currentVideoTempDir, 'frames');
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }

    let globalFrameCounter = 0;
    const totalScenes = scenes.length;

    console.log(`[VideoRenderer] Rendering ${totalScenes} kinetic scenes (${aspectRatio})...`);

    for (let s = 0; s < totalScenes; s++) {
        const scene = scenes[s];
        const imgPath = imagePaths[s];
        const sceneDuration = scene.duration;
        const totalSceneFrames = Math.max(1, Math.round(sceneDuration * fps));

        let bgImage = null;
        if (imgPath && fs.existsSync(imgPath)) {
            try {
                bgImage = await loadImage(imgPath);
            } catch (e) {
                console.warn(`Could not load image ${imgPath}: ${e.message}`);
            }
        }

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const displayText = scene.emoji ? `${scene.text} ${scene.emoji}` : scene.text;

        for (let f = 0; f < totalSceneFrames; f++) {
            globalFrameCounter++;
            const progressRatio = f / totalSceneFrames;

            // Clear canvas
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);

            // 1. Ken Burns Slow Zoom Effect on Background
            if (bgImage) {
                const scale = 1.0 + progressRatio * 0.12; // Zoom 1.0 -> 1.12
                const drawWidth = width * scale;
                const drawHeight = height * scale;
                const offsetX = (width - drawWidth) / 2;
                const offsetY = (height - drawHeight) / 2;

                ctx.save();
                ctx.drawImage(bgImage, offsetX, offsetY, drawWidth, drawHeight);
                
                // Dark overlay vignette for readable text
                const overlay = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.7);
                overlay.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
                overlay.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
                ctx.fillStyle = overlay;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
            }

            // 2. Kinetic Typography Text Rendering
            ctx.save();
            const fontSize = aspectRatio === '9:16' ? 44 : 52;
            ctx.font = `bold ${fontSize}px "Mangal", "Nirmala UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const maxTextWidth = width * 0.82;
            const lines = wrapText(ctx, displayText, maxTextWidth);
            const lineHeight = fontSize * 1.35;
            const totalTextHeight = lines.length * lineHeight;
            const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

            let textAlpha = Math.min(1.0, progressRatio * 4.0); // Fade-in during first 25%
            let scaleEffect = 1.0 + Math.max(0, (0.15 - progressRatio)) * 0.8; // Pop effect at start

            ctx.globalAlpha = textAlpha;

            lines.forEach((line, index) => {
                const y = startY + index * lineHeight;

                ctx.save();
                ctx.translate(width / 2, y);
                ctx.scale(scaleEffect, scaleEffect);

                // Thick dark stroke for high contrast
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 10;
                ctx.lineJoin = 'round';
                ctx.strokeText(line, 0, 0);

                // Bright Fill (Alternating Yellow/White accent)
                ctx.fillStyle = (index % 2 === 0) ? '#FFFFFF' : '#FDE047';
                ctx.fillText(line, 0, 0);

                ctx.restore();
            });

            ctx.restore();

            // Save Frame to disk
            const frameFileName = `frame_${String(globalFrameCounter).padStart(6, '0')}.png`;
            const frameFilePath = path.join(framesDir, frameFileName);
            const buffer = canvas.toBuffer('image/png');
            fs.writeFileSync(frameFilePath, buffer);
        }

        if (onProgress) {
            onProgress(s + 1, totalScenes);
        }
    }

    console.log(`[VideoRenderer] Generated ${globalFrameCounter} frames. Starting FFmpeg MP4 encoding...`);

    const inputPattern = path.join(framesDir, 'frame_%06d.png').replace(/\\/g, '/');

    // Stitch frames into MP4 using FFmpeg
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputPattern)
            .inputOptions(['-start_number 1', '-r ' + fps])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset fast',
                '-crf 22'
            ])
            .output(outputVideoPath)
            .on('start', (cmd) => {
                console.log(`[VideoRenderer] FFmpeg spawned: ${cmd}`);
            })
            .on('end', () => {
                console.log(`[VideoRenderer] 🎉 Video successfully encoded to: ${outputVideoPath}`);
                
                // Clean up ONLY current video's sub temp folder
                try {
                    if (fs.existsSync(currentVideoTempDir)) {
                        fs.rmSync(currentVideoTempDir, { recursive: true, force: true });
                    }
                } catch (cleanupErr) {}

                resolve(outputVideoPath);
            })
            .on('error', (err) => {
                console.error(`[VideoRenderer Error] FFmpeg encoding failed: ${err.message}`);
                reject(err);
            })
            .run();
    });
}

module.exports = {
    renderKineticVideo
};
