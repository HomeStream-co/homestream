import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';
const SHA = '3753bd9dee1a18c6fdaa694fca95f42f9b55eab1';

// Create lightweight tag ref directly (simpler, no tag object needed)
const r = await fetch(`${BASE}/git/refs`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ ref: 'refs/tags/v2.0.2', sha: SHA }),
});
const d = await r.json();
console.log('Status:', r.status, JSON.stringify(d).slice(0, 200));
