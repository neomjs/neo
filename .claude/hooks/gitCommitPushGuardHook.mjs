#!/usr/bin/env node
/**
 * @module .claude/hooks/gitCommitPushGuardHook
 * @summary Claude Code `PreToolUse` guard for two `git push` shapes the auto-mode classifier refuses, while the plain
 * form of the same step passes:
 * - One Bash call may not run both `git commit` and `git push`, so a seat commits in one call and pushes in the next.
 * - A push may not name a colon refspec (`<src>:<dst>`). The settings deny `Bash(git push* *:*)`, but that glob misses
 *   `git -C <dir> push` and `cd <dir> && git push`, whose refusal says nothing a seat can act on. A branch pushed by
 *   name reaches the same-named remote branch, whatever the branch tracks.
 *
 * The command texts come from the redirection guard's scan, so quoted text, comments and heredoc bodies never count
 * and a command substitution counts as the command it runs. A `git` word counts in command position only, past its
 * global options (`-C <dir>`, `-c <name=value>` …) to the subcommand. Like its siblings, it guards plain shell
 * syntax, not `eval` or aliases, and fails open on a malformed payload.
 */
import {pathToFileURL}                       from 'node:url';
import {atCommandPosition, scan, SEPARATORS} from './redirectionGuardHook.mjs';
import {tokenizeShellCommand}                from './rgReplaceGuardHook.mjs';

export const GIT_COMMIT_PUSH_GUARD_MESSAGE = 'This call runs both `git commit` and `git push`. Run them as two plain ' +
    'tool calls, commit first: the auto-mode classifier can refuse a call that chains them. A refused push to your ' +
    'own branch is split into plain steps and retried, never taken to the operator.';

export const GIT_PUSH_REFSPEC_GUARD_MESSAGE = 'This push names a colon refspec (`<src>:<dst>`), which the settings ' +
    'deny (`git push* *:*`); behind `git -C` or `cd` the auto-mode classifier refuses it instead. Push the branch by ' +
    'name, `git push -u origin <branch>`: it reaches the same-named remote branch even when the branch tracks ' +
    '`origin/dev`. For a commit without a branch, run `git branch <name> <sha>` first and push `<name>`.';

// The global options whose value is the next word
const VALUE_OPTIONS = new Set(['-C', '-c', '--config-env', '--git-dir', '--namespace', '--super-prefix', '--work-tree']);
// The long options of `git push`, as `git push -h` lists them; git also accepts an unambiguous abbreviation of each
const PUSH_LONG_OPTIONS = [
    'all', 'atomic', 'branches', 'delete', 'dry-run', 'exec', 'follow-tags', 'force', 'force-if-includes',
    'force-with-lease', 'ipv4', 'ipv6', 'mirror', 'no-verify', 'porcelain', 'progress', 'prune', 'push-option', 'quiet',
    'receive-pack', 'recurse-submodules', 'repo', 'set-upstream', 'signed', 'tags', 'thin', 'verbose', 'verify'
];
// The ones whose value may be the next word; `--force-with-lease` and `--signed` read theirs after `=` only
const PUSH_VALUE_OPTIONS = new Set(['exec', 'push-option', 'receive-pack', 'recurse-submodules', 'repo']);

/**
 * @summary Lists the git invocations `command` runs, in order: each `git` in command position, past its global
 * options, with the words that follow its subcommand up to the end of that simple command.
 * @param {String} command
 * @returns {{subcommand: String, args: String[]}[]}
 */
export function gitInvocations(command = '') {
    const invocations = [];

    for (const code of scan(command).codes) {
        const tokens = tokenizeShellCommand(code, {newlines: true});

        tokens.forEach((token, i) => {
            if (token.replace(/^.*\(/, '').split('/').pop() !== 'git' || !atCommandPosition(tokens, i)) return;

            let j = i + 1, end;

            while (tokens[j]?.startsWith('-')) j += VALUE_OPTIONS.has(tokens[j]) ? 2 : 1;

            if (!/^[\w-]+$/.test(tokens[j] ?? '')) return;

            for (end = j + 1; end < tokens.length && !SEPARATORS.has(tokens[end]);) end++;

            invocations.push({subcommand: tokens[j], args: tokens.slice(j + 1, end)})
        })
    }

    return invocations
}

/**
 * @summary Lists the git subcommands `command` runs, in order: each `git` in command position, past its global options.
 * @param {String} command
 * @returns {String[]}
 */
export function gitSubcommands(command = '') {
    return gitInvocations(command).map(({subcommand}) => subcommand)
}

/**
 * @summary Tells whether a `git push` option word takes the next word as its value, the way git parses it: a
 * short-option group that ends in `o` (`-o`, `-uo`), or a long option without `=` that names or unambiguously
 * abbreviates one of `PUSH_VALUE_OPTIONS`.
 * @param {String} word An option word, starting with `-`
 * @returns {Boolean}
 */
function takesNextWord(word) {
    if (!word.startsWith('--')) return word.indexOf('o') === word.length - 1;
    if (word.includes('='))     return false;

    const name    = word.slice(2),
          matches = PUSH_LONG_OPTIONS.filter(option => option.startsWith(name));

    return PUSH_VALUE_OPTIONS.has(PUSH_LONG_OPTIONS.includes(name) ? name : matches.length === 1 ? matches[0] : '')
}

/**
 * @summary Lists the refspecs a `git push` names, reading its words the way git does: options and their values are
 * skipped, `--` ends the options, and the first positional is the repository even when `--repo` names one, so every
 * later positional is a refspec. A colon in a URL, in an option value or in a redirection never counts.
 * @param {String[]} args The words after `push`.
 * @returns {String[]}
 */
export function pushRefspecs(args = []) {
    const positionals = [];
    let   options     = true;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (/^\d*(>>?|<)$/.test(arg)) {
            i++ // a bare redirection operator: its target is the next word
        } else if (/^\d*(>>?|<)/.test(arg)) {
            // a redirection with its target attached, such as `2>&1`
        } else if (options && arg === '--') {
            options = false
        } else if (options && arg.length > 1 && arg.startsWith('-')) {
            takesNextWord(arg) && i++
        } else {
            positionals.push(arg)
        }
    }

    return positionals.slice(1)
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
 * that pushes a colon refspec; `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideGitCommitPushGuard(hookPayload) {
    if (hookPayload?.tool_name && hookPayload.tool_name !== 'Bash') return null;

    const command = hookPayload?.tool_input?.command;

    if (typeof command !== 'string') return null;

    const invocations = gitInvocations(command),
          subcommands = invocations.map(({subcommand}) => subcommand);

    if (subcommands.includes('commit') && subcommands.includes('push')) {
        return {decision: 'block', reason: GIT_COMMIT_PUSH_GUARD_MESSAGE}
    }

    return invocations.some(({args, subcommand}) => subcommand === 'push' && pushRefspecs(args).some(refspec => refspec.includes(':')))
        ? {decision: 'block', reason: GIT_PUSH_REFSPEC_GUARD_MESSAGE}
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
