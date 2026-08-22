/**
 * lib/competitor_analyzer.js
 * Analytics, scoring, hook extraction, and keyword trend analysis for Competitor Research.
 */

/**
 * Calculates a composite view-retention & performance proxy score for a video.
 * Factors:
 * - viewsRatio: video views relative to channel average views
 * - likeRatio: engagement rate (likes / views)
 * - recencyFactor: views per day since upload
 *
 * @param {Array} videos - Array of raw video objects fetched from channel
 * @returns {Array} Sorted top 20 video objects with computed scores
 */
function rankVideosByRetentionScore(videos, limit = 20) {
    if (!videos || videos.length === 0) return [];

    const totalViews = videos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
    const avgViews = Math.max(1, totalViews / videos.length);
    const now = new Date();

    const scored = videos.map(v => {
        const views = v.viewCount || 0;
        const likes = v.likeCount || 0;
        const durationSec = v.durationSec || 0;

        // Calculate age in days
        let ageInDays = 30; // default fallback
        if (v.uploadDate) {
            // uploadDate is typically YYYYMMDD in yt-dlp
            const y = parseInt(v.uploadDate.substring(0, 4), 10);
            const m = parseInt(v.uploadDate.substring(4, 6), 10) - 1;
            const d = parseInt(v.uploadDate.substring(6, 8), 10);
            const pubDate = new Date(y, m, d);
            const diffTime = Math.abs(now - pubDate);
            ageInDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        }

        const viewsRatio = views / avgViews;
        const likeRatio = views > 0 ? (likes / views) : 0;
        const viewsPerDay = views / ageInDays;

        // Composite Retention Proxy Formula:
        // Score = (viewsRatio * 40) + (likeRatio * 400) + (Math.log10(viewsPerDay + 1) * 20)
        const compositeScore = Math.round((viewsRatio * 40) + (likeRatio * 400) + (Math.log10(viewsPerDay + 1) * 20));

        // Formatted duration string (HH:MM:SS or MM:SS)
        let formattedDuration = v.durationStr || 'N/A';
        if (!formattedDuration || formattedDuration === 'N/A') {
            if (durationSec > 0) {
                const mins = Math.floor(durationSec / 60);
                const secs = Math.floor(durationSec % 60);
                formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
        }

        return {
            ...v,
            views,
            likes,
            ageInDays,
            viewsPerDay: Math.round(viewsPerDay),
            compositeScore,
            formattedDuration
        };
    });

    // Sort by composite score descending
    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    // Return Top limit (default 20)
    const maxCount = parseInt(limit, 10) || 20;
    return scored.slice(0, maxCount);
}

/**
 * Extracts the opening 15-30s hook (~40-60 words or first 2 sentences) from a video transcript.
 * @param {string} scriptText - Full script transcript text
 * @returns {string} Extracted hook text
 */
function extractHookText(scriptText) {
    if (!scriptText || scriptText.startsWith('[Script')) {
        return '[No transcript available to extract hook]';
    }

    const cleaned = scriptText.trim().replace(/\s+/g, ' ');
    const words = cleaned.split(' ');

    if (words.length <= 50) {
        return cleaned;
    }

    // Take first 50 words
    let hook = words.slice(0, 50).join(' ');
    
    // Clean trailing punctuation if needed
    if (!/[.!?]$/.test(hook)) {
        hook += '...';
    }

    return hook;
}

/**
 * Categorizes videos into length ranges and computes view patterns.
 * @param {Array} videos - Array of scored video objects
 * @returns {Array} Length breakdown summary objects
 */
function analyzeLengthVsViewsPattern(videos) {
    const buckets = {
        '0-3 min (Short Form)': { count: 0, totalViews: 0, name: '0-3 min (Short Form)' },
        '3-6 min (Mid-Short)': { count: 0, totalViews: 0, name: '3-6 min (Mid-Short)' },
        '6-10 min (Mid Form)': { count: 0, totalViews: 0, name: '6-10 min (Mid Form)' },
        '10+ min (Long Form)': { count: 0, totalViews: 0, name: '10+ min (Long Form)' }
    };

    for (const v of videos) {
        const sec = v.durationSec || 0;
        let bucketKey = '10+ min (Long Form)';
        if (sec <= 180) bucketKey = '0-3 min (Short Form)';
        else if (sec <= 360) bucketKey = '3-6 min (Mid-Short)';
        else if (sec <= 600) bucketKey = '6-10 min (Mid Form)';

        buckets[bucketKey].count += 1;
        buckets[bucketKey].totalViews += (v.views || 0);
    }

    const result = Object.values(buckets).map(b => {
        const avgViews = b.count > 0 ? Math.round(b.totalViews / b.count) : 0;
        return {
            range: b.name,
            videoCount: b.count,
            totalViews: b.totalViews,
            avgViews
        };
    });

    // Find highest average views bucket
    let bestBucket = result[0];
    for (const b of result) {
        if (b.avgViews > bestBucket.avgViews) {
            bestBucket = b;
        }
    }

    return {
        breakdown: result,
        bestBucketRange: bestBucket.avgViews > 0 ? bestBucket.range : 'N/A',
        bestBucketAvgViews: bestBucket.avgViews
    };
}

/**
 * Extracts and tallies top recurring keywords and multi-word phrases across transcripts.
 * Filters out English and Hindi/Devanagari stopwords and punctuation (e.g. danda ।).
 *
 * @param {Array} fullData - Array of objects containing scripts
 * @returns {Array} Top 15 recurring keywords/phrases with frequencies
 */
function extractTrendingKeywords(fullData) {
    const stopWords = new Set([
        // English stopwords
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
        'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
        'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
        'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some',
        'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
        'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
        'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'having', 'should', 'would',
        // Hindi (Hinglish + Devanagari) stopwords
        'hai', 'hain', 'ho', 'hote', 'hoti', 'hota', 'ko', 'ki', 'ke', 'ka', 'me', 'mein', 'par', 'se', 'bhi', 'aur', 'ya',
        'lekin', 'mgar', 'to', 'bhi', 'ne', 'apna', 'apni', 'apne', 'kar', 'karo', 'karna', 'karke', 'kiya', 'raha', 'rahi',
        'rahe', 'kya', 'kaise', 'kyun', 'kaha', 'kab', 'ye', 'yeh', 'wo', 'woh', 'jo', 'sab', 'sabse', 'aaj', 'kal', 'baat',
        'sirf', 'bahut', 'ek', 'do', 'teen', 'chaar', 'script', 'captions', 'video', 'not', 'available',
        // Devanagari stopwords
        'है', 'हैं', 'हो', 'होते', 'होती', 'होता', 'को', 'की', 'के', 'का', 'में', 'पर', 'से', 'भी', 'और', 'या',
        'लेकिन', 'मगर', 'तो', 'ने', 'अपना', 'अपनी', 'अपने', 'कर', 'करो', 'करना', 'करके', 'किया', 'करते', 'करती',
        'रहा', 'रही', 'रहे', 'क्या', 'कैसे', 'क्यों', 'कहा', 'कब', 'ये', 'यह', 'वो', 'वह', 'जो', 'सब', 'सबसे',
        'आज', 'कल', 'बात', 'सिर्फ', 'बहुत', 'एक', 'दो', 'तीन', 'चार', 'तुम्हें', 'तुम्हारा', 'तुम्हारी', 'तुम्हारे',
        'मुझे', 'मेरा', 'मेरी', 'मेरे', 'हमारा', 'हमारी', 'हमारे', 'तुम', 'तुमने', 'मैंने', 'उसने', 'उन्होंने', 'उसका',
        'उसकी', 'उसके', 'अंदर', 'बाहर', 'नहीं', 'ना', 'जैसे', 'वैसे', 'तरह', 'चीज', 'लोग', 'लोगों', 'कोई', 'किसी',
        'कुछ', 'इस', 'उस', 'अब', 'जब', 'तब', 'अगर', 'ताकि', 'इसलिए', 'साथ', 'बाद', 'पहले', 'आगे', 'पीछे', 'कम',
        'ज्यादा', 'होगा', 'होगी', 'होंगे', 'गया', 'गई', 'गए', 'अनुसार', 'इतना', 'उतना', 'जितना', 'आप', 'आपका', 'आपकी', 'आपके'
    ]);

    const freqMap = {};

    for (const item of fullData) {
        if (!item.script || item.script.startsWith('[Script')) continue;

        // Strip punctuation including Devanagari danda ।
        const cleanText = item.script.toLowerCase()
            .replace(/[।.,\/#!$%\^&\*;:{}=\-_`~()?"'💀🔥]/g, ' ')
            .replace(/\s+/g, ' ');

        const rawTokens = cleanText.split(' ')
            .map(t => t.trim().replace(/^[^a-z0-9\u0900-\u097F]+|[^a-z0-9\u0900-\u097F]+$/gi, ''))
            .filter(t => t.length > 2 && !stopWords.has(t));

        // Single word frequencies
        for (const t of rawTokens) {
            freqMap[t] = (freqMap[t] || 0) + 1;
        }

        // Bigrams (2-word phrases) - give 2x weight boost for meaningful phrase matching
        for (let i = 0; i < rawTokens.length - 1; i++) {
            const phrase = `${rawTokens[i]} ${rawTokens[i + 1]}`;
            freqMap[phrase] = (freqMap[phrase] || 0) + 2;
        }
    }

    const sorted = Object.entries(freqMap)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count);

    return sorted.slice(0, 15);
}

module.exports = {
    rankVideosByRetentionScore,
    extractHookText,
    analyzeLengthVsViewsPattern,
    extractTrendingKeywords
};
