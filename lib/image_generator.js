/**
 * Pollinations.ai Parallel Image Generator Module
 * Downloads AI background images for each scene in parallel batches of 5.
 * Uses 6s fast timeout per image with graceful gradient background fallbacks.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

async function downloadImageWithTimeout(url, timeoutMs = 6000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Image API HTTP Error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

function generateFallbackGradientImage(width, height, outputPath, prompt = '') {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw dark cinematic gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.5, '#1e1b4b');
    gradient.addColorStop(1, '#020617');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Accent lighting circle
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.45, 0, Math.PI * 2);
    ctx.fill();

    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(outputPath, buffer);
}

async function fetchSceneImage(prompt, width, height, outputPath) {
    const encodedPrompt = encodeURIComponent(prompt || 'cinematic photo background');
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux`;

    try {
        const buffer = await downloadImageWithTimeout(url, 6000);
        fs.writeFileSync(outputPath, buffer);
        return true;
    } catch (err) {
        generateFallbackGradientImage(width, height, outputPath, prompt);
        return false;
    }
}

async function generateAllSceneImages(scenes, aspectRatio, jobTempDir, onProgress) {
    const width = aspectRatio === '9:16' ? 720 : 1280;
    const height = aspectRatio === '9:16' ? 1280 : 720;
    const imagesDir = path.join(jobTempDir, 'images');
    
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    const imagePaths = new Array(scenes.length);
    const BATCH_SIZE = 5; // Download 5 images in parallel

    for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        const batch = scenes.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (scene, bIdx) => {
            const index = i + bIdx;
            const imgPath = path.join(imagesDir, `scene_${scene.index}.jpg`);
            await fetchSceneImage(scene.imagePrompt, width, height, imgPath);
            imagePaths[index] = imgPath;
        }));

        if (onProgress) {
            const currentDone = Math.min(i + BATCH_SIZE, scenes.length);
            onProgress(currentDone, scenes.length, scenes[currentDone - 1].text);
        }
    }

    return imagePaths;
}

module.exports = {
    fetchSceneImage,
    generateAllSceneImages,
    generateFallbackGradientImage
};
