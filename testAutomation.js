import fs from 'node:fs';
import path from 'node:path';

async function run() {
  console.log('--- Starting Automation Test ---');
  
  const baseUrl = 'http://localhost:3000';

  console.log('\n[1] Testing File Upload (via /api/upload-local)...');
  const filePath = path.resolve('test_upload.mp4');
  if (fs.existsSync(filePath)) {
    try {
      const uploadRes = await fetch(`${baseUrl}/api/upload-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localPath: filePath,
          originalName: 'test_upload.mp4'
        })
      });
      if (uploadRes.ok) {
        console.log('✅ Upload Success');
      }
    } catch (e) {
      console.log('Upload error', e);
    }
  }

  // 1. Test Download Torrent
  console.log('\n[2] Testing Torrent Download...');
  const testTitle = "Big Buck Bunny";
  const testImdbId = "tt1254207";
  const testType = "movie";

  try {
    console.log('Fetching streams...');
    const streamRes = await fetch(`${baseUrl}/api/stremio/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: testType,
        imdbId: testImdbId
      })
    });

    if (streamRes.ok) {
      const streamJson = await streamRes.json();
      console.log(`✅ Found ${streamJson.streams?.length || 0} streams.`);
      
      const testTorrentBody = {
        title: testTitle,
        imdbId: testImdbId,
        season: null,
        episode: null,
        epTitle: null,
        type: testType,
        streams: streamJson.streams || []
      };

      console.log('Queueing download...');
      const dlRes = await fetch(`${baseUrl}/api/stremio/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testTorrentBody)
      });
      
      if (dlRes.ok) {
        const dlJson = await dlRes.json();
        console.log('✅ Download Queued Success:', dlJson);
      } else {
        console.error('❌ Download Failed:', dlRes.status, await dlRes.text());
      }
    } else {
      console.error('❌ Fetch Streams Failed:', streamRes.status, await streamRes.text());
    }
  } catch (err) {
    console.error('❌ Download request error:', err);
  }
}

run();
