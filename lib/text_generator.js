/**
 * lib/text_generator.js
 * Pollinations.ai Free Cloud Text Generation API Wrapper
 */

const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/';

/**
 * Helper to pause execution for a given duration in milliseconds.
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates text using Pollinations.ai free text API.
 * GET https://text.pollinations.ai/{URL-encoded-prompt}
 * Retries once on failure, then throws if still unavailable.
 *
 * @param {string} prompt - Text prompt for generation
 * @returns {Promise<string>} Generated text response
 */
async function generateText(prompt) {
    const maxRetries = 1;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Pollinations Text API retry attempt ${attempt}...`);
                await sleep(1500);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

            // 1. Try GET endpoint: https://text.pollinations.ai/{encoded-prompt}
            const encodedPrompt = encodeURIComponent(prompt.substring(0, 1800));
            const response = await fetch(`${POLLINATIONS_TEXT_URL}${encodedPrompt}`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/plain, application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                if (text && text.trim().length > 0 && !text.includes('"error":402')) {
                    return text.trim();
                }
            }

            // 2. Fallback: Try POST endpoint
            const postController = new AbortController();
            const postTimeoutId = setTimeout(() => postController.abort(), 20000);

            const postRes = await fetch(POLLINATIONS_TEXT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/plain',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                }),
                signal: postController.signal
            });

            clearTimeout(postTimeoutId);

            if (postRes.ok) {
                const postText = await postRes.text();
                if (postText && postText.trim().length > 0 && !postText.includes('"error":402')) {
                    return postText.trim();
                }
            }

            throw new Error(`Pollinations Text API returned HTTP ${response.status}`);

        } catch (err) {
            lastError = err;
            console.warn(`Pollinations Text API attempt ${attempt + 1} failed: ${err.message}`);
        }
    }

    throw new Error(`Pollinations Text API unavailable after retries: ${lastError ? lastError.message : 'Unknown error'}`);
}

module.exports = {
    generateText,
    sleep
};
