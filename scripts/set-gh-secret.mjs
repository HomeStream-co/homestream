import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const TOKEN = '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';
const SECRET_VALUE = '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';
const REPO = 'HomeStream-co/homestream';

// Install libsodium-wrappers
execSync('npm install libsodium-wrappers --prefix /tmp/sodium 2>/dev/null', { stdio: 'ignore' });

const sodium = (await import('/tmp/sodium/node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js')).default;
await sodium.ready;

// Get repo public key
const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
  headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'node' }
});
const { key_id, key: pubKeyB64 } = await pkRes.json();
console.log('key_id:', key_id);

// Encrypt using libsodium sealed box
const pubKey = sodium.from_base64(pubKeyB64, sodium.base64_variants.ORIGINAL);
const secretBytes = sodium.from_string(SECRET_VALUE);
const encryptedBytes = sodium.crypto_box_seal(secretBytes, pubKey);
const encryptedB64 = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

// PUT the secret
const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/GH_TOKEN`, {
  method: 'PUT',
  headers: {
    Authorization: `token ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'node'
  },
  body: JSON.stringify({ encrypted_value: encryptedB64, key_id })
});
console.log('Status:', res.status, res.statusText);
if (res.status !== 201 && res.status !== 204) {
  console.log(await res.text());
}
