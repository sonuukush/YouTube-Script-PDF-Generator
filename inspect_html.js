const fs = require('fs');
const html = fs.readFileSync('channel.html', 'utf8');

console.log('HTML Length:', html.length);

// Regex search for watch?v=
const matches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
const videoIds = [...new Set(matches.map(m => m[1]))];
console.log('Video IDs found via watch?v= :', videoIds);

// Look for title patterns
const titleMatches = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}/g)];
console.log('Title matches:', titleMatches.length);
titleMatches.slice(0, 10).forEach(m => console.log('-', m[1]));
