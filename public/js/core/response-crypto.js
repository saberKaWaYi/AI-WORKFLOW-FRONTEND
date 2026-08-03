const RESPONSE_KEY_HEX = '6f4d8a1c7b2e9035d6a4f8c1e7b0392d5a6c8f0143e9b27d60ac5e18f7429b3c';
const ALGORITHM = 'AES-256-GCM';
const IV_BYTES = 12;

let importedKey;

function hexToBytes(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid response encryption key');
  return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

function base64ToBytes(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`Missing encrypted response ${label}`);
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`Invalid encrypted response ${label}`);
  }
}

async function getKey(subtle) {
  if (!subtle) {
    throw new Error('Encrypted API responses require HTTPS or localhost');
  }
  if (!importedKey) {
    importedKey = subtle.importKey(
      'raw',
      hexToBytes(RESPONSE_KEY_HEX),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
  }
  return importedKey;
}

export async function decryptApiResponse(payload) {
  if (!payload?.encrypted) return payload;
  if (payload.algorithm !== ALGORITHM) throw new Error('Unsupported API encryption algorithm');

  const subtle = globalThis.crypto?.subtle;
  const iv = base64ToBytes(payload.iv, 'IV');
  if (iv.length !== IV_BYTES) throw new Error('Invalid encrypted response IV length');
  const ciphertext = base64ToBytes(payload.ciphertext, 'ciphertext');
  const key = await getKey(subtle);

  let plaintext;
  try {
    plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Unable to decrypt API response');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Decrypted API response is not valid JSON');
  }
}
