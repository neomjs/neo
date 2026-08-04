import {pathToFileURL} from 'node:url';
import {
    readHookPayload,
    recordTurnPresenceFromHook
} from '../../ai/mcp/server/memory-core/helpers/TurnPresenceHookWriter.mjs';
import {normalizeAgentIdentityNodeId} from '../../ai/graph/normalizeAgentIdentityNodeId.mjs';

const EVENT_MAP = Object.freeze({
    Interrupt: Object.freeze({
        action       : 'terminal',
        source       : 'kimi-interrupt',
        terminalState: 'aborted'
    }),
    PostToolUse: Object.freeze({
        action: 'progress',
        source: 'kimi-post-tool-use'
    }),
    Stop: Object.freeze({
        action       : 'terminal',
        source       : 'kimi-stop',
        terminalState: 'completed'
    }),
    StopFailure: Object.freeze({
        action       : 'terminal',
        source       : 'kimi-stop-failure',
        terminalState: 'aborted'
    }),
    UserPromptSubmit: Object.freeze({
        action: 'start',
        source: 'kimi-user-prompt-submit'
    })
});

/**
 * @summary Parses Kimi Code hook stdin without letting malformed JSON break the session.
 * @param {String} raw Raw hook stdin.
 * @returns {*|null} Parsed payload, or null when stdin is empty or malformed.
 */
export function parseKimiHookPayload(raw) {
    if (!raw) return null;

    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * @summary Resolves one documented Kimi per-turn hook event to the shared turn-presence contract.
 * @param {*} hookPayload Parsed Kimi hook payload.
 * @returns {Object|null} Shared writer action metadata, or null for deliberately unwired events.
 */
export function resolveKimiTurnPresenceEvent(hookPayload) {
    const eventName = typeof hookPayload?.hook_event_name === 'string'
        ? hookPayload.hook_event_name
        : null;
    const mapping = EVENT_MAP[eventName];

    return mapping ? {...mapping, eventName} : null
}

/**
 * @summary Reads the plane leaves from `AiConfig`, the one config read in this process.
 *
 * Imported lazily so the module stays loadable — and its pure helpers unit-testable — without booting
 * the Neo state Provider. The hook process is an entrypoint, so reading the config singleton here is
 * the sanctioned shape; the writer it feeds is not one, and deliberately resolves nothing itself.
 * @returns {Promise<Object>} `{baseUrl, credential}`
 */
export async function readPlaneConfig() {
    await import('../../src/Neo.mjs');
    await import('../../src/core/_export.mjs');

    const {default: AiConfig} = await import('../../ai/config.mjs'),
          planeBase           = String(AiConfig.fleet.planeBase ?? '').trim().replace(/\/+$/, '');

    return {
        baseUrl   : planeBase ? `${planeBase}/mc/mcp` : '',
        credential: AiConfig.fleet.planeBearer ?? ''
    };
}

/**
 * @summary Records Kimi Code turn presence into the store the deployment serves.
 *
 * **This is the entrypoint, and the only place config is resolved.** It injects the plane leaves into
 * a writer that resolves nothing — replacing a path the writer used to derive from its own module
 * location, which sent every beacon to a private checkout no reader queries.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment inherited by the hook command.
 * @param {*} [options.hookPayload] Parsed Kimi hook payload.
 * @param {String|Date|Number} [options.now] Clock override for tests.
 * @param {Object} [options.plane] Injected `{baseUrl, credential}`; read from `AiConfig` when absent.
 * @param {Function} [options.record] Transport seam.
 * @returns {Promise<Object|undefined>}
 */
export async function recordKimiTurnPresence({
    env = process.env,
    hookPayload,
    now,
    plane,
    record
} = {}) {
    const event = resolveKimiTurnPresenceEvent(hookPayload);

    if (!event) {
        return {
            eventName: typeof hookPayload?.hook_event_name === 'string'
                ? hookPayload.hook_event_name
                : null,
            reason: 'unsupported-hook-event',
            status: 'noop'
        }
    }

    // Fail-visible, bounded: an unprovisioned seat must be DETECTABLE, never session-breaking.
    // One line only on UserPromptSubmit — PostToolUse fires per tool call, and one fresh process
    // per event means a per-process line is not a real throttle there.
    if (event.eventName === 'UserPromptSubmit' && !normalizeAgentIdentityNodeId(env.NEO_AGENT_IDENTITY)) {
        process.stderr.write(
            'kimi turnPresenceHook: NEO_AGENT_IDENTITY unresolved — provision the seat env ' +
            '(node --env-file-if-exists=<checkout>/.env … turnPresenceHook.mjs); presence write skipped (fail-open)\n'
        )
    }

    const {action, eventName, source, terminalState} = event;
    const toolSuffix                                 = eventName === 'PostToolUse' && typeof hookPayload.tool_name === 'string'
        ? ` ${hookPayload.tool_name}`
        : '';

    return recordTurnPresenceFromHook({
        action,
        env,
        hookPayload,
        note : `kimi ${eventName}${toolSuffix}`,
        now,
        plane: plane ?? await readPlaneConfig(),
        source,
        terminalState,
        ...(record ? {record} : {})
    })
}

/**
 * @summary Runs the stdin adapter while preserving Kimi Code's fail-open hook boundary.
 * @returns {Promise<void>}
 */
async function main() {
    const hookPayload = parseKimiHookPayload(await readHookPayload());

    // Fail-open at the session boundary, but never silent: `unsupported-hook-event` is a deliberate
    // no-op and stays quiet, while anything else says why it did not record. A presence write that
    // reports nothing and stores nowhere is the exact failure this path is being repaired for.
    const result = await recordKimiTurnPresence({hookPayload})
        .catch(error => ({status: 'failed', reason: `turn-presence threw: ${error?.message || error}`}));

    if (result?.status && !['recorded', 'noop'].includes(result.status)) {
        process.stderr.write(`kimi turnPresenceHook: not recorded — ${result.reason || result.status}\n`)
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main().catch(() => {})
}
