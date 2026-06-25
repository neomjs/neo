import {readFileSync}                 from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
    extractWakeSubmitNonce,
    readHookPayload,
    recordTurnPresenceFromHook
} from '../../ai/mcp/server/memory-core/helpers/TurnPresenceHookWriter.mjs';

/**
 * @summary Extracts a wake-submit nonce from a Codex hook payload or raw prompt text.
 * @param {*} value Hook payload value.
 * @param {Number} [depth=0] Recursion guard for nested payloads.
 * @returns {String|null}
 */
export {extractWakeSubmitNonce, readHookPayload};

/**
 * @summary Emits a fail-soft Codex turn-start beacon without importing Neo singletons.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.rootDir] Repository root.
 * @param {*} [options.hookPayload] Codex hook payload used to extract a wake-submit nonce.
 * @returns {Promise<void>|undefined}
 */
export async function recordTurnStarted({
    env = process.env,
    rootDir = fileURLToPath(new URL('../../', import.meta.url)),
    hookPayload
} = {}) {
    return recordTurnPresenceFromHook({
        env,
        hookPayload,
        note  : 'codex UserPromptSubmit',
        rootDir,
        source: 'codex-user-prompt-submit'
    });
}

/**
 * @summary Reads the repo-local Codex context payload injected at prompt submit.
 * @returns {String}
 */
export function readCodexContext() {
    const contextUrl = new URL('../CODEX.md', import.meta.url);
    return readFileSync(contextUrl, 'utf8').trim();
}

async function main() {
    let hookPayload = '';
    try {
        const rawPayload = await readHookPayload();
        if (rawPayload) {
            try {
                hookPayload = JSON.parse(rawPayload);
            } catch {
                hookPayload = rawPayload;
            }
        }
    } catch {
        // Fail-soft hook: absence of parseable stdin only drops nonce correlation, not context loading.
    }

    await recordTurnStarted({hookPayload}).catch(() => {});

    const context = readCodexContext();

    if (context) {
        process.stdout.write(`${context}\n`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
