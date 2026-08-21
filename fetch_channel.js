const fs = require('fs');

async function main() {
    console.log('Fetching channel page via Node fetch...');
    const res = await fetch('https://www.youtube.com/@adeep_vishwakarma/videos', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
        }
    });
    
    const html = await res.text();
    fs.writeFileSync('channel_utf8.html', html, 'utf8');
    console.log('Saved channel_utf8.html, length:', html.length);

    // Look for videoId and title in JSON
    const videoMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
    const uniqueIds = [...new Set(videoMatches.map(m => m[1]))];
    console.log(`Found ${uniqueIds.length} unique video IDs:`, uniqueIds);

    // Extract ytInitialData
    const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
    let videoList = [];

    if (jsonMatch) {
        try {
            const data = JSON.parse(jsonMatch[1]);
            const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
            for (const tab of tabs) {
                const items = tab.tabRenderer?.content?.richGridRenderer?.contents || [];
                for (const item of items) {
                    const v = item.richItemRenderer?.content?.videoRenderer;
                    if (v) {
                        videoList.push({
                            id: v.videoId,
                            title: v.title?.runs?.[0]?.text || v.title?.simpleText || ''
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing JSON:', e.message);
        }
    }

    if (videoList.length === 0 && uniqueIds.length > 0) {
        // Fallback title extractor
        for (const id of uniqueIds) {
            const regex = new RegExp(`"videoId":"${id}".*?"title":\\{"runs":\\[\\{"text":"([^"]+)"\\}`, 's');
            const m = html.match(regex);
            videoList.push({
                id: id,
                title: m ? m[1] : `Video ${id}`
            });
        }
    }

    console.log('\nExtracted Video List:');
    console.log(JSON.stringify(videoList, null, 2));

    fs.writeFileSync('videos.json', JSON.stringify(videoList, null, 2));
}

main().catch(console.error);
