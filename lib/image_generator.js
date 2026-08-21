/**
 * Pollinations.ai Image Generator Module
 * Downloads AI background images for each scene using the free Pollinations.ai Flux model.
 * Provides fallback dark gradient background on network failure or timeout.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

async function downloadImageWithTimeout(url, timeoutMs = 12000) {
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

function generateFallbackGradientImage(width, height, outputPath, sceneText = '') {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw dark cinematic gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.5, '#1e1b4b');
    gradient.addColorStop(1, '#020617');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Ambient accent lighting circle
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.4, 0, Math.PI * 2);
    ctx.fill();

    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(outputPath, buffer);
}

async function fetchSceneImage(prompt, width, height, outputPath) {
    const encodedPrompt = encodeURIComponent(prompt || 'cinematic atmospheric photo');
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux`;

    try {
        const buffer = await downloadImageWithTimeout(url, 12000);
        fs.writeFileSync(outputPath, buffer);
        return true;
    } catch (err) {
        console.warn(`[ImageGen Warning] Pollinations image failed for prompt "${prompt}": ${err.message}. Using fallback gradient.`);
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

    const imagePaths = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const imgPath = path.join(imagesDir, `scene_${scene.index}.jpg`);
        
        if (onProgress) {
            onProgress(i + 1, scenes.length, scene.text);
        }

        await fetchSceneImage(scene.imagePrompt, width, height, imgPath);
        imagePaths.push(imgPath);
    }

    return imagePaths;
}

module.exports = {
    fetchSceneImage,
    generateAllSceneImages,
    generateFallbackGradientImage
};
