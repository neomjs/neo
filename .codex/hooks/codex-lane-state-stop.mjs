#!/usr/bin/env node
/**
 * @module .codex/hooks/codex-lane-state-stop
 * @summary Codex `Stop` hook for no-hold lane-state enforcement.
 *
 * Codex runs this hook at the turn-end `Stop` event. The adapter resolves the final assistant text,
 * reuses the shared lane-state parser/validator seam, and emits the Claude-compatible
 * `{"decision":"block","reason":...}` directive when enforcement is enabled and no live operator
 * dialogue is present. Hook-internal failures still fail open and audit so a buggy hook never traps
 * every turn-end.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import {pathToFileURL} from 'node:url';

import {parseLaneState}            from '../../ai/scripts/lifecycle/parseLaneState.mjs';
import {decideStopHookAction,
        isOperatorInLoop,
        parseOutcomeToVerdict}     from '../../ai/scripts/lifecycle/stopHookDecision.mjs';
import {validateLaneStateTerminal} from '../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

export const CODEX_STOP_BLOCK_INJECTION_SUPPORTED = true;

const LOG_DIR = process.env.NEO_AI_DAEMON_DIR || path.join(os.homedir(), '.neo-ai-data', 'codex-lane-state-hook');

/**
 * @summary Reads all of stdin, which Codex passes to command hooks as the event payload.
 * @returns {Promise<String>}
 * @protected
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data',  chunk => data += chunk);
        process.stdin.on('end',   ()    => resolve(data));
        process.stdin.on('error', reject);
    });
}

/**
 * @summary Best-effort append to the Codex Stop audit log; logging failures must never gate a turn.
 * @param {String} line
 * @param {Object} [options]
 * @param {String} [options.logDir]
 * @protected
 */
export function auditLog(line, {logDir = LOG_DIR} = {}) {
    const logFile = path.join(logDir, 'codex-lane-state-stop-hook.log');

    try {
        fs.mkdirSync(logDir, {recursive: true});
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
    } catch (e) {
        // best-effort; a log-write failure must never block a Codex turn-end
    }
}

/**
 * @summary Extracts plain text from Codex/Claude/OpenAI-shaped content containers.
 * @param {*} content
 * @returns {String}
 * @protected
 */
function extractTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(block => {
            if (typeof block === 'string') return block;
            if (typeof block?.text === 'string') return block.text;
            if (typeof block?.content === 'string') return block.content;
            return '';
        }).filter(Boolean).join('\n');
    }
    if (content && typeof content === 'object') {
        if (typeof content.text === 'string') return content.text;
        if (typeof content.content === 'string') return content.content;
    }
    return '';
}

/**
 * @summary Extracts assistant text from a generic message-like object.
 * @param {*} message
 * @returns {String}
 * @protected
 */
function extractTextFromMessage(message) {
    if (typeof message === 'string') return message;
    if (!message || typeof message !== 'object') return '';

    return extractTextFromContent(
        message.content ??
        message.message?.content ??
        message.text ??
        message.message?.text ??
        message.output_text ??
        message.output
    );
}

/**
 * @summary Returns whether a message-like object represents assistant output.
 * @param {Object} message
 * @returns {Boolean}
 * @protected
 */
function isAssistantMessage(message) {
    if (!message || typeof message !== 'object') return false;

    return message.role === 'assistant' ||
        message.type === 'assistant' ||
        message.message?.role === 'assistant' ||
        message.item?.role === 'assistant';
}

/**
 * @summary Returns whether a message-like object represents user/operator input.
 * @param {Object} message
 * @returns {Boolean}
 * @protected
 */
function isUserMessage(message) {
    if (!message || typeof message !== 'object') return false;

    return message.role === 'user' ||
        message.type === 'user' ||
        message.message?.role === 'user' ||
        message.item?.role === 'user';
}

/**
 * @summary Extracts the last assistant text from an array of message-like records.
 * @param {Object[]} messages
 * @returns {String}
 * @protected
 */
export function extractLastAssistantTextFromMessages(messages = []) {
    if (!Array.isArray(messages)) return '';

    for (let i = messages.length - 1; i >= 0; i--) {
        const record  = messages[i],
              message = record?.message || record?.item || record;

        if (!isAssistantMessage(record) && !isAssistantMessage(message)) continue;

        const text = extractTextFromMessage(message);
        if (text) return text;
    }

    return '';
}

/**
 * @summary Extracts the last user text from an array of message-like records.
 * @param {Object[]} messages
 * @returns {String}
 * @protected
 */
export function extractLastUserTextFromMessages(messages = []) {
    if (!Array.isArray(messages)) return '';

    for (let i = messages.length - 1; i >= 0; i--) {
        const record  = messages[i],
              message = record?.message || record?.item || record;

        if (!isUserMessage(record) && !isUserMessage(message)) continue;

        const text = extractTextFromMessage(message);
        if (text) return text;
    }

    return '';
}

/**
 * @summary Extracts the last assistant text from JSONL transcript records, tolerating malformed lines.
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastAssistantTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const text = extractLastAssistantTextFromMessages([record]);
        if (text) return text;
    }

    return '';
}

/**
 * @summary Extracts the last user text from JSONL transcript records, tolerating malformed lines.
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastUserTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const text = extractLastUserTextFromMessages([record]);
        if (text) return text;
    }

    return '';
}

/**
 * @summary Resolves the best available final assistant text from known and representative Codex shapes.
 * @param {Object} [input={}]
 * @returns {{text: String, source: String}}
 */
export function extractFinalAssistantText(input = {}) {
    const last = input.last_assistant_message ?? input.lastAssistantMessage;
    if (last) {
        const text = extractTextFromMessage(last);
        if (text.trim()) return {text, source: 'last_assistant_message'};
    }

    const messages = input.messages ?? input.conversation ?? input.transcript;
    if (Array.isArray(messages)) {
        const text = extractLastAssistantTextFromMessages(messages);
        if (text.trim()) return {text, source: 'messages'};
    }

    const transcriptPath = input.transcript_path ?? input.transcriptPath;
    if (transcriptPath) {
        return {
            text  : extractLastAssistantTextFromJsonl(fs.readFileSync(transcriptPath, 'utf8')),
            source: 'transcript_path'
        };
    }

    return {text: '', source: 'none'};
}

/**
 * @summary Resolves the best available text that prompted this Codex turn. This is the external
 * operator-vs-wake signal; missing text fails closed to autonomous in `isOperatorInLoop`.
 * @param {Object} [input={}]
 * @returns {{text: String, source: String}}
 */
export function extractPromptingText(input = {}) {
    const messages = input.messages ?? input.conversation ?? input.transcript;
    if (Array.isArray(messages)) {
        const text = extractLastUserTextFromMessages(messages);
        if (text.trim()) return {text, source: 'messages'};
    }

    const transcriptPath = input.transcript_path ?? input.transcriptPath;
    if (transcriptPath) {
        return {
            text  : extractLastUserTextFromJsonl(fs.readFileSync(transcriptPath, 'utf8')),
            source: 'transcript_path'
        };
    }

    return {text: '', source: 'none'};
}

/**
 * @summary Builds the no-hold reminder text without claiming Codex can inject it yet.
 * @param {String} verdictReason
 * @returns {String}
 */
export function buildNoHoldReminder(verdictReason) {
    return `No-hold reminder: ${verdictReason}. There is no hold state: continue concrete work on the active lane, perform an assigned review that advances a named lane, or pick a fresh claimable lane. Passive waiting is not a terminal.`;
}

/**
 * @summary Maps a terminal verdict to the Codex Stop action. The no-hold decision mirrors Claude:
 * a live operator dialogue is the only allow; every autonomous turn-end blocks when enforcement is
 * enabled.
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.blockInjectionSupported=CODEX_STOP_BLOCK_INJECTION_SUPPORTED]
 * @param {Boolean} [options.operatorInLoop=false]
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideCodexHookAction(verdict, {
    enforcing               = false,
    blockInjectionSupported = CODEX_STOP_BLOCK_INJECTION_SUPPORTED,
    operatorInLoop          = false
} = {}) {
    const decision = decideStopHookAction(verdict, {
        enforcing,
        operatorInLoop,
        blockInjectionSupported,
        blockUnsupportedReason: 'Codex Stop block/inject contract is not proven, so this hook remains fail-open.'
    });

    if (decision.action === 'allow') return decision;
    if (decision.action === 'block') return {action: 'block', reason: buildNoHoldReminder(decision.reason)};

    return {action: 'would-block', reason: buildNoHoldReminder(decision.reason)};
}

/**
 * @summary Returns a redacted, shape-only payload summary for live Codex Stop contract capture.
 * @param {Object} payload
 * @returns {Object}
 */
export function summarizePayloadShape(payload = {}) {
    if (!payload || typeof payload !== 'object') return {type: typeof payload};

    return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
        if (Array.isArray(value)) return [key, `array(${value.length})`];
        if (value && typeof value === 'object') return [key, 'object'];
        return [key, typeof value];
    }));
}

/**
 * @summary Classifies a Codex Stop payload against the lane-state parser and validator seam.
 * @param {Object} input
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String, source: String, promptSource: String, verdict: Object}}
 */
export function classifyCodexStopPayload(input = {}, {enforcing = false} = {}) {
    const stopHookActive                            = !!(input.stop_hook_active || input.stopHookActive),
          {text, source}                            = extractFinalAssistantText(input),
          {text: promptingText, source: promptSource} = extractPromptingText(input),
          operatorInLoop                            = isOperatorInLoop({stopHookActive, promptingText});

    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(text);
    } catch (e) {
        parseError = e;
    }

    const verdict = parseOutcomeToVerdict({descriptor, parseError}, validateLaneStateTerminal);

    return {
        ...decideCodexHookAction(verdict, {enforcing, operatorInLoop}),
        source,
        promptSource,
        verdict
    };
}

/**
 * @summary Codex Stop hook entrypoint; emits block decisions when enforcing and otherwise exits successfully.
 * @protected
 */
async function main() {
    let input;
    try {
        input = JSON.parse(await readStdin());
    } catch (e) {
        auditLog(`PAYLOAD-PARSE-ERROR: could not parse Codex Stop input (${e.message}); allowing stop.`);
        process.exit(0);
    }

    if (process.env.NEO_CODEX_LANE_STATE_CAPTURE === '1') {
        auditLog(`PAYLOAD-SHAPE: ${JSON.stringify(summarizePayloadShape(input))}`);
    }

    let result;
    try {
        result = classifyCodexStopPayload(input, {
            enforcing: process.env.NEO_CODEX_LANE_STATE_ENFORCE === '1'
        });
    } catch (e) {
        auditLog(`HOOK-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    const session = input.session_id || input.sessionId || '?';

    if (result.action === 'block') {
        auditLog(`BLOCK (session=${session}, source=${result.source}): ${result.reason}`);
        process.stdout.write(JSON.stringify({decision: 'block', reason: result.reason}), () => process.exit(0));
        return;
    }

    const prefix = result.action === 'allow' ? 'ALLOW' : 'WOULD-BLOCK';

    auditLog(`${prefix} (session=${session}, source=${result.source}): ${result.reason}`);
    process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
