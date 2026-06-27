#!/usr/bin/env node
/**
 * @module .claude/hooks/rgReplaceGuardHook
 * @summary Claude Code `PreToolUse` guard for the high-frequency `rg -r` footgun: in ripgrep, `-r`
 * means `--replace`, not recursion. The hook is intentionally narrow: it only inspects Bash tool
 * commands, only flags `rg` invocations, and allows explicit replacement shapes with a replacement
 * plus a search pattern.
 *
 * The hook fails open on malformed payloads. A broken guard must never block ordinary tool use; at worst,
 * it misses one warning and the user can re-run the command.
 */
import {pathToFileURL} from 'node:url';

export const RG_REPLACE_GUARD_MESSAGE = '`rg -r` is `--replace`, not recursion. ripgrep recurses by default; did you mean a plain recursive search?';

const SHELL_SEPARATORS = new Set([';', '|', '||', '&&']);

/**
 * @summary Tokenizes enough shell syntax to identify command words and simple separators without executing
 * or fully parsing Bash. Quoted strings stay single tokens; this is sufficient for `rg --replace "x" "y"`.
 * @param {String} command
 * @returns {String[]}
 */
export function tokenizeShellCommand(command = '') {
    const tokens  = [];
    let   current = '';
    let   quote   = null;
    let   escape  = false;

    function pushCurrent() {
        if (current.length > 0) {
            tokens.push(current);
            current = '';
        }
    }

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (escape) {
            current += char;
            escape = false;
            continue
        }

        if (char === '\\') {
            escape = true;
            continue
        }

        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            continue
        }

        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            continue
        }

        if (/\s/.test(char)) {
            pushCurrent();
            continue
        }

        if (char === '&' && command[i + 1] === '&') {
            pushCurrent();
            tokens.push('&&');
            i++;
            continue
        }

        if (char === '|' && command[i + 1] === '|') {
            pushCurrent();
            tokens.push('||');
            i++;
            continue
        }

        if (char === ';' || char === '|') {
            pushCurrent();
            tokens.push(char);
            continue
        }

        current += char;
    }

    pushCurrent();

    return tokens
}

function isRgCommand(token) {
    return /(?:^|\/)rg(?:\.exe)?$/.test(token);
}

function isShellSeparator(token) {
    return SHELL_SEPARATORS.has(token);
}

function commandOperands(tokens, startIndex, endIndex) {
    const operands = [];

    for (let i = startIndex; i < endIndex; i++) {
        const token = tokens[i];

        if (!token || isShellSeparator(token)) {
            break
        }

        if (!token.startsWith('-')) {
            operands.push(token);
        }
    }

    return operands
}

function looksLikePathOperand(token) {
    return typeof token === 'string' && (
        token === '.' ||
        token === '..' ||
        token.startsWith('./') ||
        token.startsWith('../') ||
        token.startsWith('/') ||
        token.startsWith('~/') ||
        token.includes('/')
    )
}

function replacementOperandProblem(tokens, replacementIndex, endIndex) {
    if (replacementIndex >= endIndex || tokens[replacementIndex]?.startsWith('-')) {
        return 'missing-replacement';
    }

    const operands = commandOperands(tokens, replacementIndex, endIndex);

    if (operands.length < 2) {
        return 'missing-pattern';
    }

    // The common footgun is `rg -r "pattern" path/`: the path becomes ripgrep's search pattern while
    // the intended pattern becomes replacement text. Genuine replacement with a path needs three operands:
    // replacement, pattern, then the path.
    if (operands.length === 2 && looksLikePathOperand(operands[1])) {
        return 'missing-pattern';
    }

    return null
}

function segmentEnd(tokens, startIndex) {
    for (let i = startIndex; i < tokens.length; i++) {
        if (isShellSeparator(tokens[i])) {
            return i
        }
    }

    return tokens.length
}

function replaceFlagProblem(tokens, flagIndex, endIndex) {
    const flag = tokens[flagIndex];

    if (flag === '--replace') {
        return replacementOperandProblem(tokens, flagIndex + 1, endIndex);
    }

    if (flag.startsWith('--replace=')) {
        const replacement = flag.slice('--replace='.length);

        if (!replacement) {
            return 'missing-replacement';
        }

        const operands = commandOperands(tokens, flagIndex + 1, endIndex);

        if (operands.length < 1) {
            return 'missing-pattern';
        }

        if (operands.length === 1 && looksLikePathOperand(operands[0])) {
            return 'missing-pattern';
        }

        return null;
    }

    if (flag === '-r') {
        return replacementOperandProblem(tokens, flagIndex + 1, endIndex);
    }

    // `rg -rn foo` is the observed failure: ripgrep treats `n` as replacement text, not recursion.
    // Require separated `-r replacement pattern` or long `--replace replacement pattern` for genuine use.
    if (/^-.*r/.test(flag)) {
        return 'clustered-short-replace';
    }

    return null
}

/**
 * @summary Detects whether a Bash command contains an `rg` invocation whose replace flag shape is likely the
 * recursion mistake.
 * @param {String} command
 * @returns {{flag: String, reason: String}|null}
 */
export function findRgReplaceFootgun(command = '') {
    const tokens = tokenizeShellCommand(command);

    for (let i = 0; i < tokens.length; i++) {
        if (!isRgCommand(tokens[i])) {
            continue
        }

        const end = segmentEnd(tokens, i + 1);

        for (let j = i + 1; j < end; j++) {
            const reason = replaceFlagProblem(tokens, j, end);

            if (reason) {
                return {flag: tokens[j], reason}
            }
        }

        i = end;
    }

    return null
}

function parseHookPayload(raw) {
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function resolveBashCommand(hookPayload) {
    if (hookPayload?.tool_name && hookPayload.tool_name !== 'Bash') {
        return null
    }

    return typeof hookPayload?.tool_input?.command === 'string'
        ? hookPayload.tool_input.command
        : (typeof hookPayload?.command === 'string' ? hookPayload.command : null)
}

/**
 * @summary Returns the Claude hook block directive for suspicious `rg -r` shapes, or `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideRgReplaceGuard(hookPayload) {
    const command = resolveBashCommand(hookPayload);

    if (!command) {
        return null
    }

    const finding = findRgReplaceFootgun(command);

    return finding ? {decision: 'block', reason: RG_REPLACE_GUARD_MESSAGE} : null
}

async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data',  chunk => data += chunk);
        process.stdin.on('end',   ()    => resolve(data));
        process.stdin.on('error', reject);
    });
}

async function main() {
    const decision = decideRgReplaceGuard(parseHookPayload(await readStdin()));

    if (decision) {
        process.stdout.write(`${JSON.stringify(decision)}\n`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main().catch(() => {});
}
