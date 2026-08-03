const RESPONSE_KEY_HEX = '6f4d8a1c7b2e9035d6a4f8c1e7b0392d5a6c8f0143e9b27d60ac5e18f7429b3c';

let importedKey;

function hexToBytes(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid response encryption key');
  return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getKey() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Encrypted API responses require HTTPS or localhost');
  }
  if (!importedKey) {
    importedKey = globalThis.crypto.subtle.importKey(
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
  if (payload.algorithm !== 'AES-256-GCM') throw new Error('Unsupported API encryption algorithm');

  const key = await getKey();
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
