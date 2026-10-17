#!/usr/bin/env node
/**
 * @module .claude/hooks/bodyFileGuardHook
 * @summary Claude Code `PreToolUse` guard for a body-destroying shape: a pipe into `gh pr edit` or `gh issue edit`
 * with `--body-file -`. When anything upstream fails, the edit still runs on empty stdin and GitHub stores an empty
 * body. The guard allows the one piped shape that cannot write nothing by accident: `printf`/`echo` of a variable whose
 * length or emptiness the same command checks.
 *
 * Like the rg guard, it fails open on malformed payloads: a broken guard must never block ordinary tool use.
 */
import {pathToFileURL}        from 'node:url';
import {tokenizeShellCommand} from './rgReplaceGuardHook.mjs';

export const BODY_FILE_GUARD_MESSAGE = '`gh … edit --body-file -` reads the new body from a pipe: if anything upstream fails, ' +
    'the edit still runs and GitHub stores an EMPTY body. Build and check the body first: ' +
    '`set -o pipefail; V=$(producer) || exit 1; [ ${#V} -gt N ] || exit 1; printf \'%s\' "$V" | gh … edit --body-file -`, ' +
    'or pass `--body-file <file>` for a file you have checked.';

const SEPARATORS = new Set([';', '|', '||', '&&']);

/** @summary Index of the first token after the separator that precedes `index`, or 0. */
function segmentStart(tokens, index) {
    for (let i = index - 1; i >= 0; i--) {
        if (SEPARATORS.has(tokens[i])) return i + 1
    }
    return 0
}

/** @summary Index of the separator that ends the segment starting at `index`, or the token count. */
function segmentEnd(tokens, index) {
    for (let i = index; i < tokens.length; i++) {
        if (SEPARATORS.has(tokens[i])) return i
    }
    return tokens.length
}

/** @summary Whether the segment's arguments read the body from stdin. */
function readsBodyFromStdin(tokens, start, end) {
    for (let i = start; i < end; i++) {
        if (tokens[i] === '--body-file=-') return true;
        if ((tokens[i] === '--body-file' || tokens[i] === '-F') && tokens[i + 1] === '-') return true
    }
    return false
}

/** @summary The variable a `printf '%s' "$V"` or `echo "$V"` producer prints, or null for any other producer. */
function printedVariable(tokens, start, end) {
    const words = tokens.slice(start, end), last = words.at(-1);
    if (!['printf', 'echo'].includes(words[0]) || words.length > 4) return null;
    return /^\$\{?([A-Za-z_]\w*)\}?$/.exec(last ?? '')?.[1] ?? null
}

/**
 * @summary Finds a `gh pr|issue edit` that reads `--body-file -` from a pipe whose producer is not a checked variable.
 * @param {String} command
 * @returns {{subcommand: String}|null}
 */
export function findUncheckedBodyPipe(command = '') {
    const tokens = tokenizeShellCommand(command);

    for (let i = 0; i < tokens.length; i++) {
        if (!/(?:^|\/)gh$/.test(tokens[i]) || !['pr', 'issue'].includes(tokens[i + 1]) || tokens[i + 2] !== 'edit') continue;
        const start = segmentStart(tokens, i), end = segmentEnd(tokens, i);
        if (start !== i || tokens[start - 1] !== '|' || !readsBodyFromStdin(tokens, i + 3, end)) continue;

        const variable = printedVariable(tokens, segmentStart(tokens, start - 1), start - 1),
            checked    = variable && new RegExp(String.raw`\$\{#${variable}\}|-[nz]\s+"?\$\{?${variable}\b`).test(command);
        if (!checked) return {subcommand: `${tokens[i + 1]} edit`}
    }

    return null
}

/** @summary Parses the hook payload, or null for a malformed one. */
function parseHookPayload(raw) {
    try { return raw ? JSON.parse(raw) : null } catch { return null }
}

/**
 * @summary Returns the Claude hook block directive for an unchecked body pipe, or `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideBodyFileGuard(hookPayload) {
    if (hookPayload?.tool_name && hookPayload.tool_name !== 'Bash') return null;
    const command = hookPayload?.tool_input?.command;
    return typeof command === 'string' && findUncheckedBodyPipe(command) ? {decision: 'block', reason: BODY_FILE_GUARD_MESSAGE} : null
}

/** @summary Reads the hook payload from stdin. */
async function readStdin() {
    let data = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) data += chunk;
    return data
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const decision = decideBodyFileGuard(parseHookPayload(await readStdin()));
        if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`)
    } catch {}
}
