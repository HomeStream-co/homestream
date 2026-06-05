import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };

// Check token validity and scopes
const res = await fetch('https://api.github.com/user', { headers: h });
console.log('Status:', res.status);
console.log('X-OAuth-Scopes:', res.headers.get('x-oauth-scopes'));
console.log('X-Accepted-OAuth-Scopes:', res.headers.get('x-accepted-oauth-scopes'));
const data = await res.json();
console.log('User:', data.login, '| Token type:', data.type);

// Check if the release exists
const relRes = await fetch('https://api.github.com/repos/HomeStream-co/homestream/releases/tags/v2.0.2', { headers: h });
console.log('\nRelease v2.0.2 status:', relRes.status);
if (relRes.ok) {
  const rel = await relRes.json();
  console.log('Release id:', rel.id, '| draft:', rel.draft, '| assets:', rel.assets?.length);
}
