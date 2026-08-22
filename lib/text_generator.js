/**
 * lib/text_generator.js
 * Pollinations.ai Cloud Text Generation API with Intelligent Fallback Script Synthesizer
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
 * Includes timeout and retry logic.
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
                await sleep(1500);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(POLLINATIONS_TEXT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/plain, application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                if (text && text.trim().length > 0 && !text.includes('"error":402') && !text.includes('"error":429')) {
                    return text.trim();
                }
            }

            throw new Error(`HTTP ${response.status}`);

        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`Pollinations Text API unavailable: ${lastError ? lastError.message : 'Unknown error'}`);
}

/**
 * Generates a complete, structured original script and title ideas for a video topic.
 * Uses Pollinations AI when available, with intelligent fallback synthesis when Cloud AI API is busy/rate-limited.
 *
 * @param {Object} videoData - Object containing video title, url, hook, script
 * @returns {Promise<{suggestedMainTitle: string, titlesText: string, scriptText: string}>}
 */
async function generateScriptAndTitlesForVideo(videoData) {
    const title = videoData.title || 'Untitled Video';
    const hook = videoData.hook || '';
    const snippet = (videoData.script || '').substring(0, 500);

    const scriptPrompt = `
You are a YouTube scriptwriter. Write a 100% ORIGINAL 300-word YouTube video script on the topic: "${title}".
Structure: [Hook], [Introduction], [Core Key Insights], [Actionable Takeaways], and [Call To Action].
Tone: Conversational, engaging, YouTube creator style.
`;

    const titlesPrompt = `
Generate 5 high-CTR YouTube video title options for a video about: "${title}".
Provide ONLY a numbered list (1 to 5).
`;

    try {
        await sleep(600);
        const scriptText = await generateText(scriptPrompt);

        await sleep(400);
        const titlesText = await generateText(titlesPrompt);

        const firstTitleMatch = titlesText.match(/1\.\s*(.+)/);
        const suggestedMainTitle = firstTitleMatch ? firstTitleMatch[1].trim() : `${title} (Fresh Take)`;

        return {
            suggestedMainTitle,
            titlesText,
            scriptText
        };

    } catch (err) {
        console.log(`Using intelligent fallback synthesizer for "${title}" (${err.message})`);

        // Clean title for fallback
        const cleanTitle = title.replace(/[@/\\?%*:|"<>]/g, '').trim();

        const fallbackTitles = [
            `1. ${cleanTitle} (2026 Fresh Perspective)`,
            `2. The Secret Behind ${cleanTitle}`,
            `3. How to Master ${cleanTitle} in 5 Easy Steps`,
            `4. What Nobody Tells You About ${cleanTitle}`,
            `5. The Ultimate Guide to ${cleanTitle}`
        ].join('\n');

        const fallbackHook = (hook && !hook.startsWith('[No')) 
            ? `"${hook}"`
            : `"Have you ever wondered what really makes ${cleanTitle} so impactful? In this breakdown, we reveal the core principles you need to know."`;

        const fallbackScript = `[HOOK]
${fallbackHook}

[INTRODUCTION]
Welcome back! In today's video, we are diving deep into ${cleanTitle}. If you want to understand the underlying mechanics and upgrade your approach, this guide will give you practical, actionable insights you can apply right away.

[CORE KEY INSIGHTS]
1. Understanding the Foundation:
Most people focus on surface-level symptoms rather than the root cause. When you reframe your perspective on ${cleanTitle}, you gain complete clarity and control over the outcome.

2. Strategic Execution:
Instead of reacting impulsively, apply structured principles. Focus on high-leverage habits, discipline, and emotional control.

3. Long-Term Compound Effect:
Consistency beats short-term intensity every time. Small, deliberate daily adjustments compound into massive long-term transformations.

[ACTIONABLE TAKEAWAYS]
- Identify your primary friction points and document them clearly.
- Apply the 5-second reflection rule before taking decisive action.
- Focus strictly on high-impact, high-retention outcomes.

[CALL TO ACTION]
If you found value in this breakdown, drop a Like on this video, subscribe for more content strategy guides, and comment your thoughts below!`;

        return {
            suggestedMainTitle: `${cleanTitle} (Fresh Take)`,
            titlesText: fallbackTitles,
            scriptText: fallbackScript
        };
    }
}

module.exports = {
    generateText,
    generateScriptAndTitlesForVideo,
    sleep
};
