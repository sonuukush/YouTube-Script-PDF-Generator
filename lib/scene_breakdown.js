/**
 * Scene Breakdown Module
 * Splits video transcript text into 5-10 word kinetic chunks,
 * calculates reading duration, infers contextual emojis, and builds AI image prompts.
 */

const EMOJI_KEYWORD_MAP = {
    // English keywords
    money: '💰', wealth: '💸', rich: '🤑', dollars: '💵', secret: '🤫',
    mind: '🧠', brain: '🧠', focus: '🎯', power: '⚡', time: '⏰',
    clock: '⏱️', success: '🚀', king: '👑', win: '🏆', warning: '⚠️',
    danger: '☠️', stop: '🛑', habit: '🔄', book: '📚', speak: '🎙️',
    english: '🗣️', look: '🗿', discipline: '🗡️', body: '💪', phone: '📱',
    scroll: '📱', college: '🎓', student: '🧑‍🎓', rule: '📜', rules: '📜',
    
    // Hindi / Hinglish keywords
    पैसा: '💰', दिमाग: '🧠', समय: '⏰', टाइम: '⏰', सीक्रेट: '🤫',
    सफलता: '🚀', राजा: '👑', पावर: '⚡', किताब: '📚', नियम: '📜',
    habits: '🔄', goal: '🎯', motivation: '🔥', fire: '🔥', life: '🌟'
};

function inferEmoji(text) {
    if (!text) return '';
    const lower = text.toLowerCase();
    for (const [key, emoji] of Object.entries(EMOJI_KEYWORD_MAP)) {
        if (lower.includes(key)) {
            return emoji;
        }
    }
    return '';
}

function breakScriptIntoScenes(scriptText) {
    if (!scriptText || scriptText.startsWith('[Script')) {
        return [];
    }

    // Clean text
    const cleanText = scriptText.replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    // Split by punctuation marks first
    const rawSentences = cleanText.split(/([.!?:|]+)/).filter(Boolean);
    const phrases = [];

    let currentPhrase = '';
    for (let i = 0; i < rawSentences.length; i++) {
        const part = rawSentences[i].trim();
        if (/^[.!?:|]+$/.test(part)) {
            currentPhrase += part;
            if (currentPhrase.trim()) {
                phrases.push(currentPhrase.trim());
                currentPhrase = '';
            }
        } else {
            if (currentPhrase) {
                currentPhrase += ' ' + part;
            } else {
                currentPhrase = part;
            }
        }
    }
    if (currentPhrase.trim()) {
        phrases.push(currentPhrase.trim());
    }

    // Now chunk long phrases into 5-10 word segments
    const scenes = [];

    phrases.forEach(phrase => {
        const words = phrase.split(/\s+/).filter(Boolean);
        if (words.length <= 10) {
            scenes.push(phrase);
        } else {
            // Split into 6-8 word sub-chunks
            let temp = [];
            for (let w = 0; w < words.length; w++) {
                temp.push(words[w]);
                if (temp.length >= 7 || w === words.length - 1) {
                    scenes.push(temp.join(' '));
                    temp = [];
                }
            }
        }
    });

    // Map into detailed scene objects
    return scenes.map((text, index) => {
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        // Estimated reading speed: ~2.5 words per second (min 1.5s, max 5.0s)
        const duration = Math.min(Math.max(wordCount / 2.5, 1.5), 5.0);
        const emoji = inferEmoji(text);
        
        // Clean prompt text for Pollinations.ai
        const sanitizedPrompt = text.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 60);
        const imagePrompt = `cinematic photographic scene representing ${sanitizedPrompt || 'dramatic background'}, 8k resolution, detailed lighting, atmospheric photo`;

        return {
            index: index + 1,
            text,
            wordCount,
            duration: parseFloat(duration.toFixed(2)),
            emoji,
            imagePrompt
        };
    });
}

module.exports = {
    breakScriptIntoScenes,
    inferEmoji
};
