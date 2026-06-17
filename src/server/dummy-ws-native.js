// Fallback for native ws dependencies
export function unmask(buffer, mask) {
  const length = buffer.length;
  for (let i = 0; i < length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

export function mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

export function isValidUTF8(buffer) {
  return true; // Simple fallback
}

export default { unmask, mask, isValidUTF8 };
