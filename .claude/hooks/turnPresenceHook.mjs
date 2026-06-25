import {fileURLToPath, pathToFileURL} from 'node:url';
import {
    readHookPayload,
    recordTurnPresenceFromHook
} from '../../ai/mcp/server/memory-core/helpers/TurnPresenceHookWriter.mjs';

function parseHookPayload(raw) {
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function normalizeHookEventName(hookPayload) {
    return typeof hookPayload?.hook_event_name === 'string' ? hookPayload.hook_event_name : null;
}

function resolveAction({actionArg, hookPayload} = {}) {
    if (actionArg) return actionArg;

    const eventName = normalizeHookEventName(hookPayload);
    return eventName === 'PostToolUse' ? 'progress' : 'start';
}

function resolveSource({action, hookPayload} = {}) {
    const eventName = normalizeHookEventName(hookPayload);
    if (eventName === 'UserPromptSubmit') return 'claude-user-prompt-submit';
    if (eventName === 'PostToolUse')      return 'claude-post-tool-use';
    return `claude-${action}`;
}

function resolveNote({action, hookPayload} = {}) {
    const eventName = normalizeHookEventName(hookPayload);
    if (eventName === 'PostToolUse' && typeof hookPayload?.tool_name === 'string') {
        return `claude PostToolUse ${hookPayload.tool_name}`;
    }
    if (eventName) {
        return `claude ${eventName}`;
    }
    return `claude ${action}`;
}

/**
 * @summary Records fail-soft Claude Code turn-presence from hook input.
 * @param {Object} options
 * @param {'start'|'progress'|'terminal'} [options.actionArg] Optional action override.
 * @param {Object} [options.env=process.env] Environment source.
 * @param {*} [options.hookPayload] Parsed Claude Code hook payload.
 * @param {String|Date|Number} [options.now=new Date()] Clock override for tests.
 * @param {String} [options.rootDir] Repository root.
 * @returns {Promise<Object>|undefined}
 */
export async function recordClaudeTurnPresence({
    actionArg,
    env = process.env,
    hookPayload,
    now = new Date(),
    rootDir = fileURLToPath(new URL('../../', import.meta.url))
} = {}) {
    const action = resolveAction({actionArg, hookPayload});

    return recordTurnPresenceFromHook({
        action,
        env,
        hookPayload,
        note  : resolveNote({action, hookPayload}),
        now,
        rootDir,
        source: resolveSource({action, hookPayload})
    });
}

async function main() {
    const hookPayload = parseHookPayload(await readHookPayload());

    await recordClaudeTurnPresence({
        actionArg: process.argv[2],
        hookPayload
    }).catch(() => {});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
