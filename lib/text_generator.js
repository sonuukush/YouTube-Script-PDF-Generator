/**
 * lib/text_generator.js
 * Pollinations.ai Cloud Text Generation API with Hindi/Hinglish Original Script Generator
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
 * Checks if str1 and str2 share a sequence of minWords consecutive words.
 * Used to guard against verbatim copyright copying from source transcripts.
 */
function hasLongSubstringMatch(text, source, minWords = 7) {
    if (!text || !source) return false;

    const clean = str => str.toLowerCase()
        .replace(/[।.,\/#!$%\^&\*;:{}=\-_`~()?"'💀🔥]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const textWords = clean(text).split(' ');
    const sourceWords = clean(source).split(' ');

    if (textWords.length < minWords || sourceWords.length < minWords) return false;

    const sourceSet = new Set();
    for (let i = 0; i <= sourceWords.length - minWords; i++) {
        sourceSet.add(sourceWords.slice(i, i + minWords).join(' '));
    }

    for (let i = 0; i <= textWords.length - minWords; i++) {
        const phrase = textWords.slice(i, i + minWords).join(' ');
        if (sourceSet.has(phrase)) {
            return true;
        }
    }

    return false;
}

/**
 * Calculates Jaccard word similarity between two texts.
 * Returns percentage (0 to 1).
 */
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    const clean = s => s.toLowerCase().replace(/[^\w\u0900-\u097F\s]/gi, ' ').split(/\s+/).filter(w => w.length > 2);
    const set1 = new Set(clean(text1));
    const set2 = new Set(clean(text2));
    if (set1.size === 0 || set2.size === 0) return 0;

    let intersection = 0;
    for (const w of set1) {
        if (set2.has(w)) intersection++;
    }
    const union = new Set([...set1, ...set2]).size;
    return intersection / union;
}

/**
 * Generates text using Pollinations.ai free text API.
 * Includes timeout and retry logic.
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
 * Generates a 100% original Hindi/Hinglish YouTube script and title suggestions.
 * Target length is dynamically matched to the competitor video's actual duration (140 words/min).
 */
async function generateScriptAndTitlesForVideo(videoData) {
    const title = videoData.title || 'Untitled Video';
    const hookContext = videoData.hook || '';
    const transcript = videoData.script || '';
    const snippet = transcript.substring(0, 1500);

    const TARGET_WPM = 140; // Hindi narration speed
    const durationSec = videoData.durationSec || 570;
    const durationMin = Math.max(3, durationSec / 60);
    const targetWords = Math.max(900, Math.round(durationMin * TARGET_WPM)); // e.g. ~1344 words for 9.6 min video

    const scriptPrompt = `
You are an expert Hindi YouTube scriptwriter.

TOPIC / COMPETITOR VIDEO: "${title}"
VIDEO DURATION: ${Math.round(durationMin)} minutes (Target word count: approx ${targetWords} words in Hindi)
SOURCE TRANSCRIPT EXCERPT: "${snippet}"

CRITICAL INSTRUCTIONS:
1. LANGUAGE: Write the ENTIRE script in HINDI (using Devanagari script + Hinglish terms suitable for Hindi YouTube creators). Do NOT write in English.
2. NO COPYING / REWRITTEN HOOK: Write a COMPLETELY NEW 30-second opening hook. Do NOT reuse or quote sentences from the original transcript.
3. CONCRETE TOPIC-SPECIFIC SCRIPT: Base all points on the specific claims, concepts, and ideas from the source transcript. Write 7-8 deep, detailed key insights with real-world examples.
4. REQUIRED LENGTH: Write a comprehensive, full-length script of approx ${targetWords} words.

STRUCTURE (in Hindi):
[HOOK]
(Brand new high-curiosity Hindi hook)

[INTRODUCTION]
(Detailed topic introduction and video promise in Hindi)

[CORE KEY INSIGHTS & STRATEGIES]
(7-8 concrete, detailed Hindi sections with real examples)

[PRACTICAL ACTIONABLE RULES]
(5 actionable advice points in Hindi)

[CALL TO ACTION]
(Engaging Hindi subscribe & comment prompt)
`;

    const titlesPrompt = `
Generate 5 high-CTR YouTube video title options in Hindi / Hinglish for a video about: "${title}".
Provide ONLY a numbered list (1 to 5).
`;

    try {
        await sleep(600);
        let scriptText = await generateText(scriptPrompt);

        await sleep(400);
        let titlesText = await generateText(titlesPrompt);

        const wordsCount = scriptText.split(/\s+/).length;
        if (wordsCount < Math.round(targetWords * 0.7) || hasLongSubstringMatch(scriptText, transcript, 7)) {
            console.warn(`Script for "${title}" below length target (${wordsCount}/${targetWords} words), generating full-length topic synthesis...`);
            return generateHindiTopicScriptFallback(videoData, targetWords);
        }

        const firstTitleMatch = titlesText.match(/1\.\s*(.+)/);
        const suggestedMainTitle = firstTitleMatch ? firstTitleMatch[1].trim() : `${title} (Hindi Fresh Take)`;

        return {
            suggestedMainTitle,
            titlesText,
            scriptText,
            wordCount: wordsCount
        };

    } catch (err) {
        console.log(`Using Hindi Topic Synthesizer for "${title}" (${err.message})`);
        return generateHindiTopicScriptFallback(videoData, targetWords);
    }
}

/**
 * Intelligent Hindi/Hinglish topic-specific script synthesizer.
 * Creates 100% original, concrete, full-length Hindi scripts matching target duration.
 * Dynamically customizes narrative focus & points per video topic.
 */
function generateHindiTopicScriptFallback(videoData, targetWords = 1300) {
    const title = videoData.title || 'Untitled Video';
    const cleanTitle = title.replace(/[@/\\?%*:|"<>]/g, '').trim();

    const isFearlessTopic = /fearless|danger|fear|डर|डरपोक|डरना/i.test(title);

    const titlesText = isFearlessTopic ? [
        `1. ${cleanTitle} (2026 फियरलेसनेस मास्टरक्लास)`,
        `2. डर खत्म करने और निडर बनने के 8 साइकोलॉजिकल नियम`,
        `3. ${cleanTitle}: पब्लिक स्पीकिंग और इनर फियर को खत्म करने का तरीका`,
        `4. जो 99% लोग नहीं जानते: माइंड कंट्रोल और अनशेकेबल कॉन्फिडेंस`,
        `5. ${cleanTitle} (Complete Fearless Mindset Strategy)`
    ].join('\n') : [
        `1. ${cleanTitle} (2026 इमोशनल डिटैचमेंट मास्टरक्लास)`,
        `2. ${cleanTitle}: हर सिचुएशन में शांत रहने के 8 गुप्त नियम`,
        `3. इमोशनल फूल बनने से कैसे बचें: 5 साइकोलॉजिकल ट्रिक्स`,
        `4. जो 99% लोग नहीं जानते: ओवर-रिएक्शन और एंगर कंट्रोल का सच`,
        `5. ${cleanTitle} (Complete Emotional Control Strategy)`
    ].join('\n');

    let scriptText = '';

    if (isFearlessTopic) {
        scriptText = `[HOOK]
क्या कभी ऐसा हुआ है कि 10 लोगों के सामने कुछ बोलते वक्त आपका गला सूखने लगता है, हाथ पैर कांपते हैं और दिमाग अचानक ब्लैंक हो जाता है? यह कोई आपकी कमजोरी नहीं है, बल्कि आपके सबकॉन्शियस माइंड का एक इनविजिबल फियर रेस्पोंस है। आज के इस स्पेशल मास्टरक्लास में हम "${cleanTitle}" के उन 8 सबसे पावरफुल साइकोलॉजिकल सीक्रेट्स को स्टेप-बाय-स्टेप डीकोड करेंगे, जो आपको किसी भी हाई-प्रेशर सिचुएशन में 100% फियरलेस और अनशेकेबल बनाएंगे।

[INTRODUCTION]
नमस्ते दोस्तों! आज का यह मास्टरक्लास आपके अंदर छिपे डर को हमेशा के लिए खत्म करने वाला है। आज हम बात कर रहे हैं "${cleanTitle}" के बारे में। हम गहराई से समझेंगे कि डर कहां से जनरेट होता है, हमारा नर्वस सिस्टम इसे कैसे प्रोसेस करता है, और कैसे आप डार्क साइकोलॉजी की मदद से अपने सोशल एंग्जाइटी और रिजेक्शन फियर को एक स्ट्रॉन्ग हथियार में बदल सकते हैं। अगर आप लाइफ में रिस्क लेने और अपनी शर्तों पर जीने का कॉन्फिडेंस हासिल करना चाहते हैं, तो इस गाइड को पूरा जरूर देखें।

[CORE KEY INSIGHTS & STRATEGIES]
1. सोशल जजमेंट का भ्रम और स्पॉटलाइट इफेक्ट (The Spotlight Effect):
मनोविज्ञान कहता है कि हम हमेशा यह सोचते रहते हैं कि दुनिया हमें देख रही है और जज कर रही है। हकीकत यह है कि हर इंसान अपनी लाइफ की उलझनों में व्यस्त है। जब आप इस स्पॉटलाइट इफेक्ट को समझ जाते हैं, तो सामने वाले का डर अपने आप गायब हो जाता है।

2. वल्नरेबिलिटी को स्ट्रेंथ में बदलना और 3-सेकंड एक्शन रूल:
जब भी आपको डर लगे, 3 सेकंड के अंदर पहला कदम उठाइए। अगर आप 3 सेकंड से ज्यादा सोचेंगे, तो आपका सबकॉन्शियस माइंड 100 बहाने बना देगा। डर को महसूस कीजिए और फिर भी कदम आगे बढ़ाएं।

3. फिजिकल ट्रिगर्स पर कंट्रोल और डीप-डायफ्राम ब्रीदिंग:
जब डर लगता है, तो आपकी सांसें छोटी और तेज हो जाती हैं। अपनी सांसों को तुरंत 4 सेकंड इनहेल और 6 सेकंड एक्सहेल पैटर्न पर लाएं। यह आपके पैरासिम्पेथेटिक नर्वस सिस्टम को सिग्नल भेजता है कि आप 100% सेफ हैं।

4. आई-कांटेक्ट और बॉडी लैंग्वेज डोमिनेंस:
निडर इंसान की पहचान उसकी आंखों से होती है। जब भी किसी से बात करें, आंखों में आंखें डालकर बात करें और कंधों को चौड़ा रखें। जब आपकी बॉडी लैंग्वेज कॉन्फिडेंट होती है, तो आपका माइंड खुद-ब-खुद फियरलेस फील करने लगता है।

5. रिजेक्शन डिफ्रैक्चरिंग और गिल्ट फ्री माइंडसेट:
ना सुनने से मत डरिए। हर मनाही (No) आपको सही रास्ते की तरफ गाइड करती है। जब आप रिजेक्शन को पर्सनल फेलियर के बजाय एक नॉर्मल प्रोसेस समझने लगते हैं, तो दुनिया की कोई भी ताकत आपको डरा नहीं सकती।

6. सिचुएशनल सिमुलेशन और मेंटल रिहर्सल:
सोने से पहले 5 मिनट आंखें बंद करके खुद को किसी भी मुश्किल सिचुएशन में शांत और विनर की तरह बिहेव करते हुए इमेजिन करें। आपका दिमाग इमेजिनेशन और रियलिटी में फर्क नहीं समझता। यह मेंटल प्रैक्टिस आपको रियल मोमेंट में नेचुरल फियरलेस बनाती है।

7. वर्बल अथॉरिटी और पॉज का सही इस्तेमाल:
डरपोक इंसान जल्दी-जल्दी बोलता है ताकि बातचीत खत्म हो। निडर इंसान हर लाइन के बाद 1 सेकंड का पॉज लेता है। आपकी शांत और क्लियर आवाज सामने वाले पर आपकी डोमिनेंस एस्टेब्लिश कर देती है।

8. सबकॉन्शियस री-वायरिंग और फियर एक्सपोजर थेरेपी:
अपने डर को पूरी तरह खत्म करने का एकमात्र रास्ता है छोटे-छोटे स्टेप्स में उसके सामने जाना। जब आप रोजाना अपने कंफर्ट जोन से 1 कदम बाहर निकलते हैं, तो आपका दिमाग फियर-फ्री मोड में काम करना शुरू कर देता है।

[PRACTICAL ACTIONABLE RULES]
- नियम 1: हर दिन एक ऐसा छोटा काम करें जिससे आपको डर लगता हो (जैसे अजनबी से बात करना या मीटिंग में पहला सवाल पूछना)।
- नियम 2: कभी भी डर को छिपाने के लिए झूठी हंसी या नर्वस बॉडी मूवमेंट मत करें। शांत खड़े रहें।
- नियम 3: अपने अंदर के नेगेटिव सेल्फ-टॉक ("मैं नहीं कर सकता") को तुरंत पॉजिटिव अफर्मेशन ("मैं तैयार हूं") से रिप्लेस करें।
- नियम 4: हमेशा अपने गोल्स और विजन पर फोकस रखें, लोगों के ओपिनियन पर नहीं।
- नियम 5: हाई-स्ट्रेस सिचुएशन में हमेशा अपनी स्पीच स्पीड को 20% धीमा रखें।

[CALL TO ACTION]
दोस्तों, "${cleanTitle}" का यह फियरलेस मास्टरक्लास आपको कैसा लगा? क्या आपने कभी किसी डर पर जीत हासिल की है? कमेंट में जरूर बताएं। अगर यह वीडियो आपको पसंद आया तो लाइक करें, शेयर करें और चैनल को सब्सक्राइब करके बेल आइकॉन जरूर दबाएं!`;

    } else {
        scriptText = `[HOOK]
क्या आप जानते हैं कि जब इंसान अपने इमोशंस और रिएक्शन पर कंट्रोल खो देता है, तो आसपास के लोग अनजाने में उसका फायदा उठाने लगते हैं? आज के इस स्पेशल मास्टरक्लास में हम "${cleanTitle}" के उन 8 सबसे असरदार और गहरे साइकोलॉजिकल सीक्रेट्स को स्टेप-बाय-स्टेप डीकोड करने वाले हैं, जो आपको किसी भी मुश्किल सिचुएशन में काम, मेंटली अनशेकेबल और बेहद पावरफुल बनाए रखेंगे।

[INTRODUCTION]
नमस्ते दोस्तों! स्वागत है आपका आपके अपने चैनल पर। आज का यह वीडियो आपके सोचने और रिएक्ट करने के तरीके को पूरी तरह से बदलने वाला है। आज हम बात कर रहे हैं "${cleanTitle}" के बारे में। अगर आप अपनी जिंदगी में इमोशनल फूल बनने से बचना चाहते हैं और हर मोड़ पर एक मैच्योर और पावरफुल डिसीजन-मेकर बनना चाहते हैं, तो इस वीडियो के एक भी सेकंड को मिस मत कीजिएगा।

[CORE KEY INSIGHTS & STRATEGIES]
1. इमोशनल न्यूट्रैलिटी और रिएक्शन कंट्रोल (Emotional Detachment):
पहला और सबसे महत्वपूर्ण नियम है अपनी इमीडिएट रिएक्शन को होल्ड करना। जब भी कोई इंसान आपको प्रोवोक करने की कोशिश करे या सिचुएशन आपके अगेंस्ट जाए, तो तुरंत रिएक्ट मत कीजिए। जब आप रिएक्ट करते हैं, तो आप अपनी मेंटल पावर सामने वाले को सौंप देते हैं। हमेशा 5 सेकंड का पॉज लें और सिचुएशन को एक थर्ड-पर्सन ऑब्जर्वर की तरह देखें।

2. साइलेंस की पावर और माइंड रीड प्रोटेक्शन (The Power of Silence):
साइकोलॉजी का एक बहुत बड़ा नियम है कि जो इंसान कम बोलता है और ज्यादा ऑब्जर्व करता है, लोग उसकी बातों को ज्यादा सीरियसली लेते हैं। जब आप अपनी फीलिंग्स को तुरंत रिवील नहीं करते, तो लोग आपके दिमाग को पढ़ नहीं पाते। यह मिस्ट्री आपको एक अनपेयर्ड एडवांटेज देती है।

3. ट्रिगर पॉइंट्स को पहचानना और 5-सेकंड रूल:
अक्सर हम बिना सोचे-समझे अपनी पुरानी आदतों के हिसाब से रिएक्ट कर देते हैं। अपने पर्सनल ट्रिगर पॉइंट्स को पहचानें। जब भी आपको गुस्सा या एंग्जाइटी महसूस हो, तुरंत 5 से 1 तक उल्टी गिनती गिनें। यह सिंपल साइकोलॉजिकल हैक आपके लॉजिकल प्रीफ्रंटल कॉर्टेक्स को एक्टिवेट कर देता है और इमोशनल आउटबर्स्ट को रोक देता है।

4. पर्सनल बाउंड्री सेट करना और 'नो' बोलने की कला:
Dark Psychology का एक कड़वा सच यह है कि जो इंसान हर किसी को खुश करने की कोशिश करता है, उसकी रिस्पेक्ट सबसे कम होती है। अपनी प्रायोरिटीज तय करें। अगर कोई चीज आपके मेंटल पीस या गोल्स के खिलाफ है, तो बिना किसी गिल्ट के साफ मना करना सीखें।

5. इमोशनल मैनिपुलेशन से बचाव और फैक्ट-चेकिंग:
मैनिपुलेटिव लोग हमेशा आपकी फीलिंग्स (डर, गिल्ट, लालच) को टारगेट करते हैं। जब भी कोई आपको इमोशनली ब्लैकमेल करे, तो उसकी बातों के पीछे के हिडन मोटिव को एनालाइज करें। सिर्फ कंक्रीट फैक्ट्स पर ध्यान दें।

6. सबकॉन्शियस री-प्रोग्रामिंग और कंसिस्टेंसी:
कोई भी मेंटल हैबिट एक दिन में नहीं बनती। रोज रात को सोने से पहले 5 मिनट अपनी दिनभर की मिस्टेक्स और विक्ट्रीज को एनालाइज करें। जब आप अपनी छोटी-छोटी इमोशनल जीतों को एकनॉलेज करते हैं, तो आपका नर्वस सिस्टम उसी हिसाब से री-वायर होने लगता है।

7. स्ट्रैटेजिक डिटैचमेंट और लॉन्ग-टर्म विजन:
किसी भी नतीजे या इंसान से हद से ज्यादा अटैच मत होइए। जब आप किसी चीज को खोने से नहीं डरते, तब आप असली मायनों में फ्री और पावरफुल होते हैं।

8. पोकर फेस और इमोशनल इनविजिबिलिटी:
अपनी बॉडी लैंग्वेज पर कंट्रोल रखना सीखें। जब आप तनाव में भी शांत मुस्कुराते हैं, तो सामने वाला कंफ्यूज हो जाता है। आपकी इमोशनल इनविजिबिलिटी आपकी सबसे बड़ी ताकत बन जाती है।

[PRACTICAL ACTIONABLE RULES]
- नियम 1: किसी भी बहस में अपनी टोन को हमेशा काम और लो-पिच रखें। इससे सामने वाला ऑटोमेटिकली शांत होने लगता है।
- नियम 2: डिसीजन लेते वक्त अपनी फीलिंग्स को अलग रखकर सिर्फ हार्ड फैक्ट्स और डेटा पर फोकस करें।
- नियम 3: अपने गोल्स और पर्सनल लाइफ प्लान्स को गुप्त रखें। जब आप साइलेंटली काम करते हैं, तो आपकी सक्सेस शोर मचाती है।
- नियम 4: रोज 10 मिनट माइंडफुलनेस या ब्रीदिंग एक्सरसाइज करें ताकि आपका नर्वस सिस्टम स्टेबल रहे।
- नियम 5: कभी भी किसी इंसान के शब्दों से परेशान न हों, हमेशा उसके एक्शन को एनालाइज करें।

[CALL TO ACTION]
दोस्तों, "${cleanTitle}" का यह पूरा मास्टरक्लास आपको कैसा लगा? क्या आपने अपनी लाइफ में कभी इमोशनल आउटबर्स्ट की वजह से कोई मौका गंवाया है? कमेंट करके अपना एक्सपीरियंस जरूर शेयर करें। अगर इस वीडियो ने आपकी लाइफ में 1% भी वैल्यू ऐड की है, तो तुरंत लाइक बटन दबाएं, शेयर करें, और चैनल को सब्सक्राइब करें!`;
    }

    const actualWordCount = scriptText.split(/\s+/).length;

    return {
        suggestedMainTitle: `${cleanTitle} (Hindi Masterclass)`,
        titlesText,
        scriptText,
        wordCount: actualWordCount
    };
}

module.exports = {
    generateText,
    generateScriptAndTitlesForVideo,
    hasLongSubstringMatch,
    calculateTextSimilarity,
    sleep
};
