#!/usr/bin/env node
/**
 * @module .claude/hooks/redirectionGuardHook
 * @summary Claude Code `PreToolUse` guard for `CLAUDE.md` `§file_editing_tool_selection`: a Bash command may not
 * write a file by redirection or by an in-place stream edit, because every file write goes through Write or Edit,
 * where the harness tracks and diffs it.
 *
 * The scan respects quotes, comments, heredoc bodies and `[[ ]]` / `(( ))` comparisons, so an operator inside
 * quoted program text or a heredoc never counts, while a command substitution (`$( )` or backticks, quoted or not)
 * is scanned as the command it runs. Descriptor duplication (`2>&1`, `>&2`) and device targets (`/dev/null`,
 * `/dev/fd/N`) stay allowed. It is a mistake-prevention guard for plain shell syntax, not a sandbox: `eval`,
 * aliases, functions and programs that write files themselves stay out of its reach. Like its siblings, the hook
 * fails open on a malformed payload.
 */
import {pathToFileURL}        from 'node:url';
import {tokenizeShellCommand} from './rgReplaceGuardHook.mjs';

export const REDIRECTION_GUARD_MESSAGE = 'This command writes a file outside the Write/Edit tool contract ' +
    '(CLAUDE.md §file_editing_tool_selection). Pipe the output instead (`cmd 2>&1 | tail -40`), ' +
    'or write the file with Write and change it with Edit.';

const DEVICE_TARGET = /^\/dev\/(?:null|stdin|stdout|stderr|tty|fd\/\d+)$/;
const INTRODUCERS   = new Set(['!', '{', 'do', 'elif', 'else', 'if', 'then', 'until', 'while']);
const SEPARATORS    = new Set([';', '&', '|', '||', '&&', '\n']);
const WRAPPERS      = new Set(['command', 'env', 'exec', 'nice', 'nohup', 'sudo', 'time', 'xargs']);
const WORD_START    = /[\s;|&(]/;

/**
 * @summary Reads the shell word at `start`, leading blanks skipped and quotes removed.
 * @param {String} command
 * @param {Number} start
 * @returns {{word: String, end: Number}}
 */
function readWord(command, start) {
    let i     = start,
        quote = null,
        word  = '';

    while (command[i] === ' ' || command[i] === '\t') i++;

    for (; i < command.length; i++) {
        const char = command[i];

        if (quote) {
            char === quote ? quote = null : word += char
        } else if (char === '\'' || char === '"') {
            quote = char
        } else if (/[\s;|&<>()]/.test(char)) {
            break
        } else {
            word += char
        }
    }

    return {word, end: i}
}

/**
 * @summary Skips the heredoc bodies that begin at `start`, in order, and returns the index after the last delimiter line.
 * @param {String} command
 * @param {Number} start
 * @param {{delimiter: String, strip: Boolean}[]} heredocs
 * @returns {Number}
 */
function skipHeredocBodies(command, start, heredocs) {
    let i = start;

    for (const {delimiter, strip} of heredocs) {
        while (i < command.length) {
            const newline = command.indexOf('\n', i),
                  lineEnd = newline === -1 ? command.length : newline,
                  line    = command.slice(i, lineEnd);

            i = lineEnd + 1;

            if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) break
        }
    }

    return Math.min(i, command.length)
}

/**
 * @summary Classifies the redirection whose `>` sits at `index`: a file target is a write; a descriptor, a device or
 * a process substitution is not.
 * @param {String} command
 * @param {Number} index
 * @returns {{operator: String, target: String}|null}
 */
function redirectionAt(command, index) {
    let end = index + 1;

    if (command[end] === '>' || command[end] === '|') end++;
    if (command[end] === '(') return null;

    const dup    = command[end] === '&',
          {word} = readWord(command, dup ? end + 1 : end);

    if (!word || DEVICE_TARGET.test(word) || (dup && /^(\d+|-)$/.test(word))) return null;

    return {operator: command.slice(index, dup ? end + 1 : end), target: word}
}

/**
 * @summary Returns the index of the `)` closing a command substitution whose body starts at `start`.
 * @param {String} command
 * @param {Number} start
 * @returns {Number}
 */
function closingParen(command, start) {
    let depth = 1,
        quote = null;

    for (let i = start; i < command.length; i++) {
        const char = command[i];

        if (char === '\\' && quote !== '\'') i++;
        else if (quote) char === quote && (quote = null);
        else if (char === '\'' || char === '"') quote = char;
        else if (char === '(') depth++;
        else if (char === ')' && --depth === 0) return i
    }

    return command.length
}

/**
 * @summary Returns the index of the backtick closing a substitution whose body starts at `start`.
 * @param {String} command
 * @param {Number} start
 * @returns {Number}
 */
function closingBacktick(command, start) {
    for (let i = start; i < command.length; i++) {
        if (command[i] === '\\') i++;
        else if (command[i] === '`') return i
    }

    return command.length
}

/**
 * @summary Scans `command` once. Returns the first redirection that writes a file, and the command texts (this one
 * and each command substitution's) with comments and heredoc bodies dropped, for the command-word check.
 * @param {String} command
 * @returns {{codes: String[], write: {operator: String, target: String}|null}}
 */
function scan(command) {
    let code     = '',
        heredocs = [],
        inner    = [],
        quote    = null,
        write    = null;

    // A substitution runs its own command, quoted or not, so it is scanned as one
    const substitute = (start, end) => {
        const sub = scan(command.slice(start, end));

        write ||= sub.write;
        inner.push(...sub.codes)
    };

    for (let i = 0; i < command.length; i++) {
        const char = command[i],
              pair = command.slice(i, i + 2),
              open = i === 0 || WORD_START.test(command[i - 1]);

        if (quote === '\'') {
            if (char === quote) quote = null;
            code += char;
            continue
        }

        if (char === '\\') {code += char + (command[++i] ?? ''); continue}

        // Arithmetic, quoted or not: a comparison is not a redirection
        if (command.startsWith('$((', i)) {
            const close = command.indexOf('))', i + 3),
                  end   = close === -1 ? command.length : close + 2;

            code += command.slice(i, end);
            i     = end - 1;
            continue
        }

        if (pair === '$(' || char === '`') {
            const tick = char === '`',
                  end  = tick ? closingBacktick(command, i + 1) : closingParen(command, i + 2);

            substitute(i + (tick ? 1 : 2), end);
            code += tick ? '``' : '$()';
            i     = end;
            continue
        }

        if (quote) {
            if (char === quote) quote = null;
            code += char;
            continue
        }

        if (char === '\'' || char === '"') {quote = char; code += char; continue}

        if (char === '#' && open) {
            while (i + 1 < command.length && command[i + 1] !== '\n') i++;
            continue
        }

        if (char === '\n' && heredocs.length) {
            i        = skipHeredocBodies(command, i + 1, heredocs) - 1;
            heredocs = [];
            code    += '\n';
            continue
        }

        // A comparison inside `[[ ]]` or `(( ))` is not a redirection
        if ((pair === '[[' || pair === '((') && open) {
            const close = command.indexOf(pair === '[[' ? ']]' : '))', i + 2),
                  end   = close === -1 ? command.length : close + 2;

            code += command.slice(i, end);
            i     = end - 1;
            continue
        }

        if (command.startsWith('<<<', i)) {code += '<<<'; i += 2; continue}

        if (pair === '<<') {
            const strip       = command[i + 2] === '-',
                  {word, end} = readWord(command, i + (strip ? 3 : 2));

            word && heredocs.push({delimiter: word, strip});
            code += command.slice(i, end);
            i     = end - 1;
            continue
        }

        if (char === '>' && command[i - 1] !== '>' && !write) {
            write = redirectionAt(command, i)
        }

        code += char
    }

    return {codes: [code, ...inner], write}
}

/**
 * @summary Whether the token at `index` is in command position: first in its statement or after a control keyword
 * (`then`, `do`, `{` …), past wrappers, flags or variable assignments, or opening a subshell.
 * @param {String[]} tokens
 * @param {Number} index
 * @returns {Boolean}
 */
function atCommandPosition(tokens, index) {
    if (tokens[index].includes('(')) return true;

    let i = index - 1;

    while (i >= 0 && (WRAPPERS.has(tokens[i]) || tokens[i].startsWith('-') || /^[A-Za-z_]\w*=/.test(tokens[i]))) i--;

    return i < 0 || SEPARATORS.has(tokens[i]) || INTRODUCERS.has(tokens[i])
}

/**
 * @summary Finds an in-place stream edit: `sed -i` / `--in-place`, or `perl -i` in any switch cluster.
 * @param {String} code Command text without comments or heredoc bodies
 * @returns {{command: String, argument: String}|null}
 */
function findInPlaceEdit(code) {
    const tokens = tokenizeShellCommand(code, {newlines: true});

    for (let i = 0; i < tokens.length; i++) {
        const name = tokens[i].replace(/^.*\(/, '').split('/').pop();

        if ((name !== 'sed' && name !== 'perl') || !atCommandPosition(tokens, i)) continue;

        // Options end at `--`: a later `-i` is a file name
        for (let j = i + 1; j < tokens.length && !SEPARATORS.has(tokens[j]) && tokens[j] !== '--'; j++) {
            const token = tokens[j];

            if (name === 'sed' ? /^-[A-Za-z]*i/.test(token) || /^--in-place(=|$)/.test(token) : /^-[0-9alnpsw]*i/.test(token)) {
                return {command: name, argument: token}
            }
        }
    }

    return null
}

/**
 * @summary Finds the first way `command` writes a file outside Write and Edit: a redirection to a file target, or
 * an in-place `sed` / `perl` edit.
 * @param {String} command
 * @returns {Object|null} The redirection `{operator, target}` or the edit `{command, argument}`; `null` when none.
 */
export function findFileWrite(command = '') {
    const {codes, write} = scan(command);

    return write || codes.map(findInPlaceEdit).find(Boolean) || null
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
 * @summary Returns the Claude hook block directive for a Bash command that writes a file, or `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideRedirectionGuard(hookPayload) {
    if (hookPayload?.tool_name && hookPayload.tool_name !== 'Bash') return null;

    const command = hookPayload?.tool_input?.command;

    if (typeof command !== 'string') return null;

    return findFileWrite(command) ? {decision: 'block', reason: REDIRECTION_GUARD_MESSAGE} : null
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
        const decision = decideRedirectionGuard(parseHookPayload(await readStdin()));

        decision && process.stdout.write(`${JSON.stringify(decision)}\n`)
    } catch {}
}
