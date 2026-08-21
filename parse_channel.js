const fs = require('fs');

const html = fs.readFileSync('channel.html', 'utf8');

// Extract ytInitialData JSON from page
const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
if (!match) {
    console.log('ytInitialData not found, extracting videoIds via regex...');
    const videoMatches = [...html.matchAll(/"videoId":"([^"]+)"/g)];
    const uniqueIds = [...new Set(videoMatches.map(m => m[1]))];
    console.log('Found video IDs:', uniqueIds);
    process.exit(0);
}

try {
    const data = JSON.parse(match[1]);
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    let videoItems = [];
    
    for (const tab of tabs) {
        const tabRenderer = tab.tabRenderer;
        if (tabRenderer) {
            const content = tabRenderer.content;
            const richGridRenderer = content?.richGridRenderer;
            const sectionListRenderer = content?.sectionListRenderer;
            
            if (richGridRenderer) {
                const contents = richGridRenderer.contents || [];
                for (const item of contents) {
                    const richItemRenderer = item.richItemRenderer;
                    const videoRenderer = richItemRenderer?.content?.videoRenderer;
                    if (videoRenderer) {
                        videoItems.push({
                            id: videoRenderer.videoId,
                            title: videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText,
                            lengthText: videoRenderer.lengthText?.simpleText || '',
                            publishedTimeText: videoRenderer.publishedTimeText?.simpleText || ''
                        });
                    }
                }
            }
        }
    }
    
    // Also fallback check regex for all videoIds with titles if array is small
    const videoMatches = [...html.matchAll(/"videoId":"([^"]+)".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g)];
    for (const m of videoMatches) {
        if (!videoItems.some(v => v.id === m[1])) {
            videoItems.push({ id: m[1], title: m[2] });
        }
    }

    console.log(`Found ${videoItems.length} videos`);
    fs.writeFileSync('videos.json', JSON.stringify(videoItems, null, 2));
} catch (err) {
    console.error('Error parsing JSON:', err.message);
}
