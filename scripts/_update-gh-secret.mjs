import { getSecret } from '#airo/secrets';
import sodium from 'libsodium-wrappers';

const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

// 1. Get repo public key
const pkRes = await fetch(`${BASE}/actions/secrets/public-key`, { headers: h });
const pk = await pkRes.json();
console.log('Public key id:', pk.key_id);

// 2. Encrypt with libsodium sealed box (X25519 + XSalsa20-Poly1305)
await sodium.ready;
const keyBytes = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
const secretBytes = sodium.from_string(token);
const encryptedBytes = sodium.crypto_box_seal(secretBytes, keyBytes);
const encrypted = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
console.log('Encrypted OK, length:', encrypted.length);

// 3. PUT the secret
const putRes = await fetch(`${BASE}/actions/secrets/GH_TOKEN`, {
  method: 'PUT', headers: h,
  body: JSON.stringify({ encrypted_value: encrypted, key_id: pk.key_id }),
});
console.log('PUT status:', putRes.status);
if (putRes.status === 204 || putRes.status === 201) {
  console.log('GH_TOKEN Actions secret updated ✓');
} else {
  console.error('Failed:', await putRes.text());
  process.exit(1);
}
