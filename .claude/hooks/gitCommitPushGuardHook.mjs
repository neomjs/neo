#!/usr/bin/env node
/**
 * @module .claude/hooks/gitCommitPushGuardHook
 * @summary Claude Code `PreToolUse` guard: one Bash call may not run both `git commit` and `git push`. The auto-mode
 * classifier can refuse such a chained call, while the same two steps as plain calls pass, so a seat commits in one
 * call and pushes in the next.
 *
 * The command texts come from the redirection guard's scan, so quoted text, comments and heredoc bodies never count
 * and a command substitution counts as the command it runs. A `git` word counts in command position only, past its
 * global options (`-C <dir>`, `-c <name=value>` …) to the subcommand. Like its siblings, it guards plain shell
 * syntax, not `eval` or aliases, and fails open on a malformed payload.
 */
import {pathToFileURL}           from 'node:url';
import {atCommandPosition, scan} from './redirectionGuardHook.mjs';
import {tokenizeShellCommand}    from './rgReplaceGuardHook.mjs';

export const GIT_COMMIT_PUSH_GUARD_MESSAGE = 'This call runs both `git commit` and `git push`. Run them as two plain ' +
    'tool calls, commit first: the auto-mode classifier can refuse a call that chains them. A refused push to your ' +
    'own branch is split into plain steps and retried, never taken to the operator.';

// The global options whose value is the next word
const VALUE_OPTIONS = new Set(['-C', '-c', '--config-env', '--git-dir', '--namespace', '--super-prefix', '--work-tree']);

/**
 * @summary Lists the git subcommands `command` runs, in order: each `git` in command position, past its global options.
 * @param {String} command
 * @returns {String[]}
 */
export function gitSubcommands(command = '') {
    const subcommands = [];

    for (const code of scan(command).codes) {
        const tokens = tokenizeShellCommand(code, {newlines: true});

        tokens.forEach((token, i) => {
            if (token.replace(/^.*\(/, '').split('/').pop() !== 'git' || !atCommandPosition(tokens, i)) return;

            let j = i + 1;

            while (tokens[j]?.startsWith('-')) j += VALUE_OPTIONS.has(tokens[j]) ? 2 : 1;

            /^[\w-]+$/.test(tokens[j] ?? '') && subcommands.push(tokens[j])
        })
    }

    return subcommands
}

/** @summary Parses the hook payload, or returns `null` when it is not JSON. @param {String} raw @returns {Object|null} */
function parseHookPayload(raw) {
    if (!raw) return null;

    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * @summary Returns the Claude hook block directive for a Bash command that runs both `git commit` and `git push`, or
 * `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideGitCommitPushGuard(hookPayload) {
    if (hookPayload?.tool_name && hookPayload.tool_name !== 'Bash') return null;

    const command = hookPayload?.tool_input?.command;

    if (typeof command !== 'string') return null;

    const subcommands = gitSubcommands(command);

    return subcommands.includes('commit') && subcommands.includes('push')
        ? {decision: 'block', reason: GIT_COMMIT_PUSH_GUARD_MESSAGE}
        : null
}

/** @summary Reads the whole hook payload from stdin. @returns {Promise<String>} */
async function readStdin() {
    let data = '';

    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) data += chunk;

    return data
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const decision = decideGitCommitPushGuard(parseHookPayload(await readStdin()));

        decision && process.stdout.write(`${JSON.stringify(decision)}\n`)
    } catch {}
}
