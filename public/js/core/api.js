import { decryptApiResponse } from './response-crypto.js';

function readApiError(data, status) {
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (typeof data?.detail === 'string' && data.detail) return data.detail;
  return `Request failed (${status})`;
}

export async function api(url, options = {}) {
  const { headers = {}, body, ...requestOptions } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...requestOptions,
    body,
    headers: {
      Accept: 'application/json',
      ...(body != null && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  });
  const text = await response.text();
  const parsed = parseJson(text);
  const data = parsed.value;
  if (!response.ok) throw new Error(readApiError(data, response.status));
  if (text && !parsed.valid) throw new Error(`Invalid JSON response (${response.status})`);
  return decryptApiResponse(data);
}

function parseJson(text) {
  if (!text) return { valid: true, value: null };
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false, value: null };
  }
}
