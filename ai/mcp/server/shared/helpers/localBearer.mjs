import {randomBytes, timingSafeEqual} from 'crypto';

/**
 * Number of random bytes in a disposable local bearer credential.
 * @type {Number}
 */
export const LOCAL_BEARER_BYTE_LENGTH = 32;

/**
 * Canonical unpadded-base64url length for a 32-byte value.
 * @type {Number}
 */
export const LOCAL_BEARER_ENCODED_LENGTH = 43;

const localBearerPattern = new RegExp(`^[A-Za-z0-9_-]{${LOCAL_BEARER_ENCODED_LENGTH}}$`);

/**
 * @summary Decodes a canonical disposable local bearer token.
 *
 * Rejects non-strings, padding, non-base64url characters, non-canonical encodings, and values
 * that do not decode to exactly 32 bytes. Returning `null` keeps validation side-effect-free and
 * lets the auth seam choose the caller-facing error type without exposing bearer material.
 * @param {*} token Candidate token
 * @returns {Buffer|null}
 */
export function decodeLocalBearerToken(token) {
    if (typeof token !== 'string' || !localBearerPattern.test(token)) {
        return null
    }

    const bytes = Buffer.from(token, 'base64url');

    if (bytes.length !== LOCAL_BEARER_BYTE_LENGTH || bytes.toString('base64url') !== token) {
        return null
    }

    return bytes
}

/**
 * @summary Reports whether a value is a canonical 32-byte local bearer token.
 * @param {*} token Candidate token
 * @returns {Boolean}
 */
export function isLocalBearerToken(token) {
    return decodeLocalBearerToken(token) !== null
}

/**
 * @summary Compares two canonical local bearer tokens in constant time.
 *
 * Both values are decoded and length-checked before `timingSafeEqual` is invoked. Malformed or
 * length-mismatched values therefore fail closed without calling the equal-length primitive.
 * @param {*} presentedToken Request bearer token
 * @param {*} configuredToken Process-lifetime server token
 * @returns {Boolean}
 */
export function matchesLocalBearerToken(presentedToken, configuredToken) {
    const
        presentedBytes  = decodeLocalBearerToken(presentedToken),
        configuredBytes = decodeLocalBearerToken(configuredToken);

    return Boolean(presentedBytes && configuredBytes && timingSafeEqual(presentedBytes, configuredBytes))
}

/**
 * @summary Generates one disposable 32-byte bearer token as canonical unpadded base64url.
 * @returns {String}
 */
export function generateLocalBearerToken() {
    return randomBytes(LOCAL_BEARER_BYTE_LENGTH).toString('base64url')
}

/**
 * @summary Creates the in-memory server/client launch contract for local-bearer mode.
 *
 * The returned surfaces can be passed directly to a child server process and an MCP client. The
 * helper performs no logging, file/database writes, environment mutation, or durable config
 * update; process exit remains the credential-revocation boundary.
 * @param {String} [bearerToken] Optional caller-owned token for a coordinated one-shot launch.
 * @returns {{serverEnv: Object, clientHeaders: Object}}
 */
export function createLocalBearerLaunchContract(bearerToken = generateLocalBearerToken()) {
    if (!isLocalBearerToken(bearerToken)) {
        throw new TypeError('Local-bearer launch contracts require a canonical 32-byte unpadded-base64url token.')
    }

    return Object.freeze({
        serverEnv: Object.freeze({
            NEO_AUTH_MODE              : 'local-bearer',
            NEO_AUTH_LOCAL_BEARER_TOKEN: bearerToken,
            NEO_MCP_LISTEN_HOST        : '127.0.0.1'
        }),
        clientHeaders: Object.freeze({
            Authorization: `Bearer ${bearerToken}`
        })
    })
}
