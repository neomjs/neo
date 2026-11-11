#!/usr/bin/env node
/**
 * @module .claude/hooks/helperCallGuardHook
 * @summary Keeps automatic helper calls within the read-only agent type and explicit model tiers.
 *
 * Eligible calls leave permission classification intact; other helper calls ask the operator.
 * The hook holds no concurrency state and never grants permission. Invalid input or a guard
 * failure blocks the call with exit code 2; the handler's onFailure policy covers launch failures.
 */
import {readFileSync}  from 'node:fs';
import {pathToFileURL} from 'node:url';

export const HELPER_CALL_GUARD_MESSAGE =
    'Automatic helpers require subagent_type "Explore" and an explicit model "haiku" or "sonnet". ' +
    'Other helper calls require operator confirmation; one helper at a time remains the loaded policy.';

/**
 * @summary Leaves eligible helper calls undecided and asks before every other helper call.
 * @param {Object} hookPayload Parsed Claude Code hook input.
 * @returns {Object|null} A PreToolUse ask decision, or no decision for eligible/unrelated tools.
 * @throws {TypeError} When the input does not identify a tool.
 */
export function decideHelperCallGuard(hookPayload) {
    if (!hookPayload || typeof hookPayload !== 'object' || Array.isArray(hookPayload) ||
        typeof hookPayload.tool_name !== 'string' || !hookPayload.tool_name) {
        throw new TypeError('Helper call guard requires an object with a tool_name.');
    }

    if (hookPayload.tool_name !== 'Agent' && hookPayload.tool_name !== 'Task') {
        return null
    }

    const input = hookPayload.tool_input;

    if (input?.subagent_type === 'Explore' && (input.model === 'haiku' || input.model === 'sonnet')) {
        return null
    }

    return {
        hookSpecificOutput: {
            hookEventName           : 'PreToolUse',
            permissionDecision      : 'ask',
            permissionDecisionReason: HELPER_CALL_GUARD_MESSAGE
        }
    }
}

/**
 * @summary Adapts stdin to the decision contract, blocking when input cannot be read or validated.
 */
function main() {
    try {
        const decision = decideHelperCallGuard(JSON.parse(readFileSync(0, 'utf8')));

        if (decision) {
            process.stdout.write(`${JSON.stringify(decision)}\n`);
        }
    } catch {
        process.stderr.write('Helper call guard could not validate its input; tool call blocked.\n');
        process.exitCode = 2;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
