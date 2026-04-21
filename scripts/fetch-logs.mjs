import https from 'https';

const url = 'https://productionresultssa2.blob.core.windows.net/actions-results/0aebb158-149a-4b46-9347-fe817ddc6e97/workflow-job-run-c0352bf8-521d-52db-bbdf-6adc9a120b72/logs/job/job-logs.txt?rsct=text%2Fplain&se=2026-04-21T05%3A31%3A54Z&sig=HxyA8YIPAIvJecFH4YmjUlThtSi0G%2BW5mTwMqlUBO84%3D&ske=2026-04-21T07%3A06%3A16Z&skoid=ca7593d4-ee42-46cd-af88-8b886a2f84eb&sks=b&skt=2026-04-21T03%3A06%3A16Z&sktid=398a6654-997b-47e9-b12b-9515b896b4de&skv=2025-11-05&sp=r&spr=https&sr=b&st=2026-04-21T05%3A21%3A49Z&sv=2025-11-05';

https.get(url, res => {
  let d = '';
  res.on('data', x => d += x);
  res.on('end', () => {
    // Find the error section
    const lines = d.split('\n');
    const errorStart = lines.findIndex(l => l.includes('error') || l.includes('Error') || l.includes('ERROR'));
    const relevant = lines.slice(Math.max(0, errorStart - 5), errorStart + 40);
    console.log(relevant.join('\n'));
  });
}).on('error', e => console.error('Failed:', e.message));
