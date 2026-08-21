/**
 * Enhanced Scene Breakdown & Visual Prompt Generator Module
 * Translates Hindi/English script chunks into rich visual English AI prompts
 * for Pollinations.ai so background images match the video context perfectly.
 */

const EMOJI_KEYWORD_MAP = {
    money: '💰', wealth: '💸', rich: '🤑', dollars: '💵', secret: '🤫',
    mind: '🧠', brain: '🧠', focus: '🎯', power: '⚡', time: '⏰',
    clock: '⏱️', success: '🚀', king: '👑', win: '🏆', warning: '⚠️',
    danger: '☠️', stop: '🛑', habit: '🔄', book: '📚', speak: '🎙️',
    english: '🗣️', look: '🗿', discipline: '🗡️', body: '💪', phone: '📱',
    scroll: '📱', college: '🎓', student: '🧑‍🎓', rule: '📜', rules: '📜',
    पैसा: '💰', दिमाग: '🧠', समय: '⏰', टाइम: '⏰', सीक्रेट: '🤫',
    सफलता: '🚀', राजा: '👑', पावर: '⚡', किताब: '📚', नियम: '📜',
    habits: '🔄', goal: '🎯', motivation: '🔥', fire: '🔥', life: '🌟'
};

const VISUAL_PROMPT_MAP = [
    { keywords: ['बोल', 'बात', 'कन्वर्सेशन', 'speak', 'talk', 'conversation'], prompt: 'cinematic photo of a confident speaker talking on stage with soft spotlight' },
    { keywords: ['दिमाग', 'माइंड', 'सोच', 'brain', 'mind', 'think', 'thought'], prompt: 'glowing futuristic 3d human brain neural network visualization' },
    { keywords: ['लोग', 'इंसान', 'people', 'crowd', 'person', 'guys'], prompt: 'dramatic portrait of people in modern city aesthetic' },
    { keywords: ['स्मार्ट', 'स्मार्टनेस', 'smart', 'intelligent', 'clever'], prompt: 'sharp modern elegant person looking confident portrait' },
    { keywords: ['पैसा', 'अमीर', 'मनी', 'money', 'rich', 'wealth', 'cash'], prompt: 'stacks of cash money glowing gold luxury aesthetic' },
    { keywords: ['समय', 'टाइम', 'घड़ी', 'time', 'clock', 'hours'], prompt: 'dramatic cinematic golden hourglass time passing' },
    { keywords: ['सफलता', 'जीत', 'success', 'win', 'goal', 'achieve'], prompt: 'successful person standing at mountain peak at sunrise' },
    { keywords: ['कम्युनिकेशन', 'रूल्स', 'communication', 'rules', 'habits'], prompt: 'glowing digital communication nodes and open book' },
    { keywords: ['फोन', 'मोबाइल', 'स्क्रॉल', 'phone', 'mobile', 'screen'], prompt: 'person holding glowing smartphone in dark moody room' },
    { keywords: ['कॉलेज', 'स्कूल', 'स्टूडेंट', 'college', 'student', 'study'], prompt: 'modern university campus library students studying' },
    { keywords: ['दोस्त', 'फ्रेंड्स', 'friend', 'friends'], prompt: 'group of young cheerful friends laughing together sunset' },
    { keywords: ['राजा', 'किंग', 'king', 'lion', 'power'], prompt: 'majestic royal lion head cinematic golden aura' }
];

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

function generateVisualImagePrompt(chunkText) {
    if (!chunkText) return 'cinematic dramatic background photo, 8k resolution, detailed lighting';
    
    const lower = chunkText.toLowerCase();

    // Check matching visual prompt
    for (const entry of VISUAL_PROMPT_MAP) {
        for (const kw of entry.keywords) {
            if (lower.includes(kw)) {
                return `${entry.prompt}, 8k resolution, photorealistic, dramatic lighting, masterpiece`;
            }
        }
    }

    // Extract English words if any
    const englishWords = chunkText.replace(/[^a-zA-Z\s]/g, '').trim();
    if (englishWords.length > 3) {
        return `cinematic photo representing ${englishWords.substring(0, 50)}, highly detailed 8k photo, dramatic studio lighting`;
    }

    // Fallback thematic visual prompt
    return `cinematic moody aesthetic dark studio background with subtle warm lighting, 8k resolution, ultra detailed`;
}

function breakScriptIntoScenes(scriptText) {
    if (!scriptText || scriptText.startsWith('[Script')) {
        return [];
    }

    const cleanText = scriptText.replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    // Split by sentence & phrase boundaries (. , ! ? | :)
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

    const scenes = [];

    phrases.forEach(phrase => {
        const words = phrase.split(/\s+/).filter(Boolean);
        if (words.length <= 9) {
            scenes.push(phrase);
        } else {
            // Split long sentences into 6-8 word sub-chunks for kinetic readability
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

    return scenes.map((text, index) => {
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const duration = Math.min(Math.max(wordCount / 2.5, 1.8), 4.5);
        const emoji = inferEmoji(text);
        const imagePrompt = generateVisualImagePrompt(text);

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
    generateVisualImagePrompt,
    inferEmoji
};
