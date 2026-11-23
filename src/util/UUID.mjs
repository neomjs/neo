/**
 * @summary Generates an RFC 4122 version-4 UUID without requiring a secure context.
 *
 * The browser's UUID convenience method is restricted to secure contexts. `crypto.getRandomValues()` remains
 * available in workers and on insecure HTTP origins, so it provides the same UUID format without that dependency.
 * @returns {String} A canonical 36-character version-4 UUID
 */
export function generateUUID() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
