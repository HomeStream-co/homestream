import https from 'https';

const token = process.env.GH_TOKEN;

// Job IDs from previous check
const WIN_JOB  = '78747994537'; // Windows - failed at step 11
const LIN_JOB  = '78747994538'; // Linux   - failed at step 10

function followRedirect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'HomeStream-Check'
      }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        followRedirect(res.headers.location).then(resolve).catch(reject);
        res.resume();
        return;
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function getLogs(jobId, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOGS: ${label} (job ${jobId})`);
  console.log('='.repeat(60));
  try {
    const logs = await followRedirect(
      `https://api.github.com/repos/HomeStream-co/homestream/actions/jobs/${jobId}/logs`
    );
    if (!logs || logs.length < 10) {
      console.log('(empty or no logs returned)');
      return;
    }
    // Print last 100 lines
    const lines = logs.split('\n');
    const start = Math.max(0, lines.length - 100);
    console.log(`... showing lines ${start}–${lines.length} of ${lines.length} total ...\n`);
    console.log(lines.slice(start).join('\n'));
  } catch(e) {
    console.log('Error fetching logs:', e.message);
  }
}

await getLogs(WIN_JOB, 'Windows - Upload NSIS artifact (step 11)');
await getLogs(LIN_JOB, 'Linux - Package & publish (step 10)');
