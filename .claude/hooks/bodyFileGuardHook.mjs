#!/usr/bin/env node
/**
 * @module .claude/hooks/bodyFileGuardHook
 * @summary Claude Code `PreToolUse` guard for a body-destroying shape: a pipe into `gh pr edit` or `gh issue edit`
 * with `--body-file -`. When anything upstream fails, the edit still runs on empty stdin and GitHub stores an empty
 * body. The guard admits two checked shapes and refuses every other pipe into such an edit:
 * - `[ -n "$V" ] && printf '%s' "$V" | gh … edit --body-file -`, the check and the write in one and-or list;
 * - a top-level `[ -n "$V" ] || exit 1` statement, then later `printf '%s' "$V" | gh … edit --body-file -`, with no
 *   statement between that assigns `V`, reads into it or branches.
 * The check may also be `[ ${#V} -gt N ]`, and `[[ ]]` stands for `[ ]`. A check is recognised only as those exact
 * words as written, never as text found elsewhere in the command: its operand and the printed value must be the
 * double-quoted `"$V"`, since `[ -n '$V' ]` tests a literal and `[ -n $V ]` passes when V is empty. `printf '%s'` is
 * the only producer, since an empty format or `echo`'s option parsing can print nothing for a nonempty value.
 *
 * Like the rg guard, it fails open on malformed payloads: a broken guard must never block ordinary tool use.
 */
import {pathToFileURL}        from 'node:url';
import {tokenizeShellCommand} from './rgReplaceGuardHook.mjs';

export const BODY_FILE_GUARD_MESSAGE = '`gh … edit --body-file -` reads the new body from a pipe: if anything upstream fails, ' +
    'the edit still runs and GitHub stores an EMPTY body. Check the body and write it in one of two shapes: ' +
    '`[ -n "$V" ] && printf \'%s\' "$V" | gh … edit --body-file -`, or `[ -n "$V" ] || exit 1` as its own statement ' +
    'before `printf \'%s\' "$V" | gh … edit --body-file -` with nothing between that changes V. ' +
    'Or pass `--body-file <file>` for a file you have checked.';

const STATEMENT = new Set([';', '\n', '&']),
    // A statement holding any of these may branch, open or close a block, or change a variable without naming it as `V=`
    UNSURE      = new Set(['if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until', 'select', 'do', 'done',
        'function', '{', '}', '(', ')', '!', 'read', 'unset', 'eval', 'source', '.', 'mapfile', 'readarray', 'declare', 'local',
        'typeset', 'export', 'readonly']),
    QUOTED      = /^"\$\{?([A-Za-z_]\w*)\}?"$/,
    ASSIGNMENT  = /^[A-Za-z_]\w*=/,
    // A word as the shell reads it, without its quotes and escapes: what a command word or a keyword is
    text        = word => word.replace(/\\(.)/g, '$1').replace(/['"`]/g, '');

/**
 * @summary Splits tokens into statements `{items, end}`: and-or items `{op, pipeline}`, each pipeline a list of commands,
 * and the separator that ended the statement (`&` runs it in the background).
 */
function parse(tokens) {
    const statements = [];
    let   items      = [], pipeline = [], command = [], op = null;
    const endItem    = () => { pipeline.push(command); items.push({op, pipeline}); pipeline = []; command = [] };
    for (const token of [...tokens, ';']) {
        if (STATEMENT.has(token)) {
            if (command.length || pipeline.length || items.length) { endItem(); statements.push({items, end: token}) }
            items = []; op = null
        }
        else if (token === '&&' || token === '||') { endItem(); op = token }
        else if (token === '|') { pipeline.push(command); command = [] }
        else command.push(token)
    }
    return statements
}

/** @summary The index of a command's word after leading `NAME=value` assignments and an `env` prefix. */
function commandWord(command) {
    let i = 0;
    while (ASSIGNMENT.test(text(command[i] ?? ''))) i++;
    if (text(command[i] ?? '') === 'env') do i++; while (ASSIGNMENT.test(text(command[i] ?? '')));
    return i
}

/** @summary Whether a command is `gh pr|issue edit` reading its body from stdin, however its words are quoted. */
function editsBodyFromStdin(command) {
    const words = command.map(text), i = commandWord(command);
    if (!/(?:^|\/)gh$/.test(words[i] ?? '') || !['pr', 'issue'].includes(words[i + 1]) || words[i + 2] !== 'edit') return false;
    return words.slice(i + 3).some((word, k, rest) => word === '--body-file=-' || ((word === '--body-file' || word === '-F') && rest[k + 1] === '-'))
}

/** @summary The variable that `printf '%s' "$V"`, as written, prints exactly, or null for any other producer. */
function printedVariable(command) {
    return command.length === 3 && command[0] === 'printf' && ['%s', "'%s'", '"%s"'].includes(command[1]) ? QUOTED.exec(command[2])?.[1] ?? null : null
}

/**
 * @summary Whether a command, as written, succeeds only when `name` is nonempty: `[ -n "$V" ]` or `[ ${#V} -gt N ]`,
 * or `[[ ]]`. The operand of `-n` must be double-quoted; `${#V}` always expands to a number.
 */
function checks(command, name) {
    const close = {'[': ']', '[[': ']]'}[command[0]], inner = command.slice(1, -1);
    if (!close || command.at(-1) !== close) return false;
    return (inner.length === 2 && inner[0] === '-n' && QUOTED.exec(inner[1])?.[1] === name) ||
        (inner.length === 3 && [`\${#${name}}`, `"\${#${name}}"`].includes(inner[0]) && inner[1] === '-gt' && /^\d+$/.test(inner[2]))
}

/** @summary Whether a statement is exactly `[ check ] || exit N` with a nonzero N, run in the foreground. */
function exitCheck({items, end}, name) {
    const [test, exit] = items;
    return end !== '&' && items.length === 2 && test.pipeline.length === 1 && checks(test.pipeline[0], name) && exit.op === '||' &&
        exit.pipeline.length === 1 && exit.pipeline[0].length === 2 && exit.pipeline[0][0] === 'exit' && /^[1-9]\d*$/.test(exit.pipeline[0][1])
}

/**
 * @summary Whether a statement may branch, open or close a block, or change `name`. Between a check and its write such a
 * statement voids the check, so a block boundary never separates them and their nesting needs no count.
 */
function unsure({items}, name) {
    const words = items.flatMap(item => item.pipeline.flat()).map(text), assigns = new RegExp(`^${name}(\\+)?=|^${name}\\[`);
    return words.some((word, i) => UNSURE.has(word) || assigns.test(word) || (word === 'printf' && words[i + 1] === '-v'))
}

/** @summary Whether a piped edit at `statements[index]` is written by one of the two checked shapes. */
function checkedWrite(statements, index, pipeline) {
    const {items} = statements[index], name = pipeline.length === 2 ? printedVariable(pipeline[0]) : null;
    if (!name) return false;
    if (items.length === 2) {
        const [test, write] = items;
        return write.pipeline === pipeline && write.op === '&&' && test.pipeline.length === 1 && checks(test.pipeline[0], name)
    }
    if (items.length !== 1) return false;
    for (let k = index - 1; k >= 0; k--) {
        if (exitCheck(statements[k], name)) return true;
        if (unsure(statements[k], name)) return false
    }
    return false
}

/**
 * @summary Finds a `gh pr|issue edit` that reads `--body-file -` from a pipe its command does not check.
 * @param {String} command
 * @returns {{subcommand: String}|null}
 */
export function findUncheckedBodyPipe(command = '') {
    // Words as written: the checks read their quotes, everything else reads them as the shell does
    const statements = parse(tokenizeShellCommand(command, {newlines: true, raw: true}));
    for (const [index, {items}] of statements.entries()) for (const {pipeline} of items) for (const piped of pipeline.slice(1)) {
        if (editsBodyFromStdin(piped) && !checkedWrite(statements, index, pipeline)) return {subcommand: `${text(piped[commandWord(piped) + 1])} edit`}
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
