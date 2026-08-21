const fs = require('fs');
const { YoutubeTranscript } = require('youtube-transcript');

const videoIds = [
  'jNmxsPj9qE0', 'LfSBgJ2bfhA', 'otoRPykhJaA',
  '4NpP9-RiXbE', '4gxiDiSfjpU', 'm6Yg4N_OB6U',
  '3Ejimklk5Ek', 'sEwrllKWCCk', 'wTedox691rM',
  'LJzZgBznbn8', 'GPhQrKU6BTE', 'Tr7cy2YaMlI',
  'aubaCg8xYPY', 'OelyQMh3HYg', 'aIksBtxXJVU',
  'UKIW3AZEkic', 'oxAgxoh5naM', '8cYIyYMy4bM',
  'zsoxFSBPpT0', 'bZFehgc_KBM', '4rjVe5c7WoE',
  'd6IpPdtXJnA', '473rxXkib0s', 'UHiw1bOF8MM',
  'LuK0vM1WWuo', 'SpVzWjdX2q8', 'VwaxEhHmIpI',
  'KUNta-TSD1I', 'Jm_5dVjluVs', 'mo_NdMzu6xY'
];

async function getVideoDetails(videoId) {
    let title = `Video ID: ${videoId}`;
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (res.ok) {
            const data = await res.json();
            title = data.title;
        }
    } catch (e) {
        console.error(`Error fetching title for ${videoId}:`, e.message);
    }

    let script = '';
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcript && transcript.length > 0) {
            script = transcript.map(t => t.text).join(' ');
        } else {
            script = '[Script Not Available]';
        }
    } catch (e) {
        script = '[Script/Subtitles Not Available for this video]';
    }

    return { id: videoId, title, script, url: `https://www.youtube.com/watch?v=${videoId}` };
}

async function main() {
    console.log(`Starting extraction for ${videoIds.length} videos...`);
    const results = [];

    for (let i = 0; i < videoIds.length; i++) {
        const id = videoIds[i];
        console.log(`[${i + 1}/${videoIds.length}] Fetching ${id}...`);
        const item = await getVideoDetails(id);
        console.log(` -> Title: ${item.title}`);
        console.log(` -> Script len: ${item.script.length} chars`);
        results.push(item);
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }

    fs.writeFileSync('extracted_scripts.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('\nAll data saved to extracted_scripts.json');
}

main().catch(console.error);
