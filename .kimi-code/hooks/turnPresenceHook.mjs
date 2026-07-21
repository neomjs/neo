import {fileURLToPath, pathToFileURL} from 'node:url';
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
 * @summary Records fail-soft Kimi Code turn presence through Memory Core's existing local writer.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment inherited by the hook command.
 * @param {*} [options.hookPayload] Parsed Kimi hook payload.
 * @param {String|Date|Number} [options.now=new Date()] Clock override for tests.
 * @param {String} [options.rootDir] Repository root.
 * @returns {Promise<Object|undefined>}
 */
export async function recordKimiTurnPresence({
    env = process.env,
    hookPayload,
    now = new Date(),
    rootDir = fileURLToPath(new URL('../../', import.meta.url))
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
        note: `kimi ${eventName}${toolSuffix}`,
        now,
        rootDir,
        source,
        terminalState
    })
}

/**
 * @summary Runs the stdin adapter while preserving Kimi Code's fail-open hook boundary.
 * @returns {Promise<void>}
 */
async function main() {
    const hookPayload = parseKimiHookPayload(await readHookPayload());

    await recordKimiTurnPresence({hookPayload})
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main().catch(() => {})
}
