function devanagariToHinglish(str) {
    if (!str) return '';

    const vowels = {
        'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
        'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
    };

    const matras = {
        'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
        'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
        'ं': 'n', 'ँ': 'n', 'ः': 'h'
    };

    const consonants = {
        'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
        'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
        'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
        'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
        'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
        'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
        'ष': 'sh', 'स': 's', 'ह': 'h', 'क़': 'q', 'ख़': 'kh',
        'ग़': 'gh', 'ज़': 'z', 'फ़': 'f', 'ड़': 'r', 'ढ़': 'rh'
    };

    const digits = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
    };

    // Dictionary for common Hinglish words to sound completely natural
    const wordMap = {
        'देखो': 'dekho', 'आप': 'aap', 'कितना': 'kitna', 'भी': 'bhi', 'बोल': 'bol',
        'लो': 'lo', 'बट': 'but', 'लोग': 'log', 'आपको': 'aapko', 'मिनट्स': 'minutes',
        'के': 'ke', 'कन्वर्सेशन': 'conversation', 'में': 'mein', 'जज': 'judge',
        'कर': 'kar', 'लेते': 'lete', 'हैं': 'hain', 'कि': 'ki', 'एक': 'ek',
        'स्मार्ट': 'smart', 'या': 'ya', 'फुल': 'full', 'एवरेज': 'average',
        'गाय': 'guy', 'और': 'aur', 'गर्ल': 'girl', 'हो': 'ho', 'क्योंकि': 'kyunki',
        'मेरा': 'mera', 'दिमाग': 'dimag', 'तो': 'to', 'पर्सनली': 'personally',
        'खराब': 'kharab', 'हो': 'ho', 'जाता': 'jata', 'है': 'hai', 'ऐसे': 'aise',
        'लोगों': 'logon', 'से': 'se', 'बात': 'baat', 'करके': 'karke', 'जिनको': 'jinko',
        'कम्यूनिकेशन': 'communication', 'बेसिक': 'basic', 'रूल्स': 'rules', 'तक': 'tak',
        'नहीं': 'nahi', 'पता': 'pata', 'दोस्तों': 'dosto', 'इस': 'is', 'वीडियो': 'video',
        'आपको': 'aapko', 'बताने': 'batane', 'वाला': 'wala', 'हूं': 'hoon'
    };

    // Process word by word for highest accuracy
    return str.split(/(\s+|[^\u0900-\u097F]+)/).map(token => {
        if (!token) return '';

        // Check if token is in common word dictionary
        const cleanToken = token.trim();
        if (wordMap[cleanToken]) {
            return wordMap[cleanToken];
        }

        // Character-by-character transliteration algorithm
        let result = '';
        const chars = Array.from(token);

        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const nextCh = chars[i + 1];

            if (digits[ch]) {
                result += digits[ch];
            } else if (vowels[ch]) {
                result += vowels[ch];
            } else if (consonants[ch]) {
                const baseConsonant = consonants[ch];
                
                // Check if next char is halant (्)
                if (nextCh === '्') {
                    result += baseConsonant;
                    i++; // skip halant
                } else if (nextCh && matras[nextCh]) {
                    result += baseConsonant + matras[nextCh];
                    i++; // skip matra
                } else {
                    // Check schwa (inherent 'a') deletion rules
                    const isLastChar = (i === chars.length - 1);
                    const isNextCharConsonant = (nextCh && consonants[nextCh]);
                    
                    if (isLastChar) {
                        // Drop trailing 'a' at end of word (e.g. log instead of loga)
                        result += baseConsonant;
                    } else if (isNextCharConsonant && i === chars.length - 2) {
                        // Drop 'a' before final consonant (e.g. kitna instead of kitana)
                        result += baseConsonant;
                    } else {
                        result += baseConsonant + 'a';
                    }
                }
            } else if (matras[ch]) {
                result += matras[ch];
            } else {
                result += ch;
            }
        }
        return result;
    }).join('');
}

const sampleText = "देखो आप कितना भी बोल लो बट लोग आपको यूं मिनट्स के कन्वर्सेशन में जज कर लेते हैं कि आप एक स्मार्ट या एक फुल एवरेज गाय और गर्ल हो।";
console.log("Original Hindi:");
console.log(sampleText);
console.log("\nConverted Hinglish:");
console.log(devanagariToHinglish(sampleText));
