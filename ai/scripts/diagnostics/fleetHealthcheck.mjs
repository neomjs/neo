/**
 * @plane in-plane
 */
import 'dotenv/config';

import {Command}       from 'commander';
import {readFileSync}  from 'node:fs';
import {pathToFileURL} from 'node:url';

export const DEFAULT_FLEET_HEALTHCHECK_URL = 'http://127.0.0.1:8083/fleet/probe';
export const DEFAULT_FLEET_HEALTHCHECK_TIMEOUT_MS = 8_000;

/**
 * @module ai/scripts/diagnostics/fleetHealthcheck
 * @summary Proves the composed Fleet service is authenticated, identity-bearing, and fixed to the
 * expected Fleet-owned durable root. Unlike the MCP health helper, this calls Fleet's exact HTTP
 * probe and opens no MCP session. The bearer is read only from a secret file and is never logged,
 * placed in argv, or returned in the receipt.
 */

/**
 * @summary Resolve the healthcheck bearer from one secret file without exposing file contents in
 * any error path.
 * @param {String} filePath Secret-file path.
 * @returns {String} Non-empty bearer credential.
 */
export function readFleetHealthcheckBearer(filePath) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        throw new Error('Fleet healthcheck requires NEO_MCP_HEALTHCHECK_TOKEN_FILE or --bearer-token-file')
    }

    let token;

    try {
        token = readFileSync(filePath.trim(), 'utf8').trim()
    } catch {
        throw new Error('Cannot read the configured Fleet healthcheck bearer-token file')
    }

    if (!token) {
        throw new Error('The configured Fleet healthcheck bearer-token file contains no credential')
    }

    return token
}

/**
 * @summary Parse Fleet healthcheck CLI arguments and declarative environment defaults.
 * @param {String[]} [argv=[]] User arguments without node/script coordinates.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Object} Parsed probe options, including the file-resolved bearer.
 */
export function parseFleetHealthcheckArgs(argv=[], env=process.env) {
    const program = new Command();

    program
        .name('fleetHealthcheck')
        .description('Call the authenticated Fleet readiness probe.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--url <url>', 'Exact Fleet probe URL.', env.NEO_FLEET_HEALTHCHECK_URL || DEFAULT_FLEET_HEALTHCHECK_URL)
        .option('--bearer-token-file <path>', 'File containing the provider bearer.', env.NEO_MCP_HEALTHCHECK_TOKEN_FILE || null)
        .option('--expected-data-dir <path>', 'Fleet-owned durable root the service must report.', env.NEO_FLEET_DATA_DIR || null)
        .option('--timeout-ms <ms>', 'Maximum request time.', env.NEO_FLEET_HEALTHCHECK_TIMEOUT_MS || String(DEFAULT_FLEET_HEALTHCHECK_TIMEOUT_MS));

    program.parse(argv, {from: 'user'});

    const options = program.opts();

    if (typeof options.expectedDataDir !== 'string' || options.expectedDataDir.trim().length === 0) {
        throw new Error('Fleet healthcheck requires NEO_FLEET_DATA_DIR or --expected-data-dir')
    }

    const timeoutMs = Number(options.timeoutMs);

    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
        throw new Error('Fleet healthcheck timeout must be an integer from 1 to 2147483647')
    }

    return {
        url            : options.url,
        bearerToken    : readFleetHealthcheckBearer(options.bearerTokenFile),
        bearerTokenFile: options.bearerTokenFile,
        expectedDataDir: options.expectedDataDir,
        timeoutMs
    }
}

/**
 * @summary Execute and validate one authenticated Fleet readiness request.
 * @param {Object} options
 * @param {String} options.url Exact `/fleet/probe` URL.
 * @param {String} options.bearerToken Provider bearer, retained only in the request header.
 * @param {String} options.expectedDataDir Required Fleet-owned durable root.
 * @param {Number} [options.timeoutMs=8000] Bounded request time.
 * @param {Function} [options.fetchImpl=fetch] Injectable fetch implementation.
 * @returns {Promise<Readonly<Object>>} Secret-free readiness receipt.
 */
export async function probeFleetHealth({
    url,
    bearerToken,
    expectedDataDir,
    timeoutMs=DEFAULT_FLEET_HEALTHCHECK_TIMEOUT_MS,
    fetchImpl=fetch
}) {
    let response;

    try {
        response = await fetchImpl(url, {
            headers: {Authorization: `Bearer ${bearerToken}`},
            signal : AbortSignal.timeout(timeoutMs)
        })
    } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            throw new Error(`Fleet healthcheck timed out after ${timeoutMs}ms`)
        }

        throw new Error('Fleet healthcheck request failed')
    }

    if (!response.ok) {
        throw new Error(`Fleet healthcheck was refused (HTTP ${response.status})`)
    }

    let payload;

    try {
        payload = await response.json()
    } catch {
        throw new Error('Fleet healthcheck returned invalid JSON')
    }

    const
        identity            = payload?.result?.identity,
        hasText             = field => typeof identity?.[field] === 'string' && identity[field].trim().length > 0,
        isPatIdentity       = ['github-pat', 'gitlab-pat'].includes(identity?.source),
        hasPatProviderTuple = ['authProvider', 'providerBaseUrl', 'providerUserId'].every(hasText),
        isValidatedIdentity = hasText('userId')
            && ((isPatIdentity && hasPatProviderTuple) || identity?.source === 'oidc');

    if (payload?.ok !== true || !isValidatedIdentity) {
        throw new Error('Fleet healthcheck response is not identity-bearing')
    }

    if (payload.result.fleetDataDir !== expectedDataDir) {
        throw new Error('Fleet healthcheck reported the wrong durable root')
    }

    return Object.freeze({
        ok             : true,
        userId         : identity.userId,
        source         : identity.source,
        authProvider   : identity.authProvider ?? null,
        providerBaseUrl: identity.providerBaseUrl ?? null,
        providerUserId : identity.providerUserId ?? null,
        fleetDataDir   : payload.result.fleetDataDir
    })
}

/**
 * @summary CLI runner.
 * @param {String[]} [argv=process.argv.slice(2)] User arguments.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Promise<Object>} Secret-free readiness receipt.
 */
export async function runFleetHealthcheck(argv=process.argv.slice(2), env=process.env) {
    const receipt = await probeFleetHealth(parseFleetHealthcheckArgs(argv, env));

    console.log(`[fleet-healthcheck] ready: identity=${receipt.userId}, dataDir=${receipt.fleetDataDir}`);

    return receipt
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
    runFleetHealthcheck().catch(error => {
        console.error(`[fleet-healthcheck] failed: ${error?.message ?? 'unknown failure'}`);
        process.exitCode = 1
    })
}
