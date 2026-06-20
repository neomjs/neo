#!/usr/bin/env node
/**
 * @module .codex/hooks/codex-lane-state-stop
 * @summary Codex `Stop` hook for no-hold lane-state reminders, dry-run and fail-open.
 *
 * Codex documents `Stop` command hooks, but the current public hook contract does not document a
 * Claude-style `{"decision":"block"}` stop-blocking protocol. This hook therefore proves the
 * transport layer conservatively: it runs at Stop, resolves the final assistant text, reuses the
 * existing lane-state parser/validator seam, and audit-logs what it would block. It never writes a
 * blocking decision to stdout until a future ticket proves Codex block/inject semantics.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import {pathToFileURL} from 'node:url';

import {parseLaneState}            from '../../ai/scripts/lifecycle/parseLaneState.mjs';
import {validateLaneStateTerminal} from '../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

export const CODEX_STOP_BLOCK_INJECTION_SUPPORTED = false;

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
 * @summary Converts a parse result into the lane-state terminal verdict consumed by the hook.
 * @param {{descriptor: (Object|null), parseError: (Error|null)}} outcome
 * @param {Function} validate
 * @returns {{valid: Boolean, reason: String}}
 */
export function parseOutcomeToVerdict({descriptor, parseError}, validate = validateLaneStateTerminal) {
    if (parseError)          return {valid: false, reason: `malformed lane-state emission: ${parseError.message}`};
    if (descriptor === null) return {valid: false, reason: 'no lane-state block emitted at turn-terminal'};

    const result = validate(descriptor);

    return result.valid
        ? {valid: true,  reason: 'valid lane-state terminal'}
        : {valid: false, reason: (result.violations || []).join('; ') || 'invalid lane-state terminal'};
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
 * @summary Maps a terminal verdict to the Codex Stop action; invalid terminals are dry-run only.
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.blockInjectionSupported=CODEX_STOP_BLOCK_INJECTION_SUPPORTED]
 * @returns {{action: ('allow'|'would-block'), reason: String}}
 */
export function decideCodexHookAction(verdict, {
    enforcing               = false,
    blockInjectionSupported = CODEX_STOP_BLOCK_INJECTION_SUPPORTED
} = {}) {
    if (verdict.valid) return {action: 'allow', reason: verdict.reason};

    const reason = buildNoHoldReminder(verdict.reason);

    if (enforcing && !blockInjectionSupported) {
        return {
            action: 'would-block',
            reason: `${reason} Codex Stop block/inject contract is not proven, so this hook remains fail-open.`
        };
    }

    return {action: 'would-block', reason};
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
 * @returns {{action: ('allow'|'would-block'), reason: String, source: String, verdict: Object}}
 */
export function classifyCodexStopPayload(input = {}, {enforcing = false} = {}) {
    if (input.stop_hook_active || input.stopHookActive) {
        const verdict = {valid: true, reason: 'Codex Stop loop guard active'};
        return {action: 'allow', reason: verdict.reason, source: 'loop-guard', verdict};
    }

    const {text, source} = extractFinalAssistantText(input);

    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(text);
    } catch (e) {
        parseError = e;
    }

    const verdict = parseOutcomeToVerdict({descriptor, parseError});

    return {
        ...decideCodexHookAction(verdict, {enforcing}),
        source,
        verdict
    };
}

/**
 * @summary Codex Stop hook entrypoint; logs would-block decisions and always exits successfully.
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

    const session = input.session_id || input.sessionId || '?',
          prefix  = result.action === 'allow' ? 'WOULD-ALLOW' : 'WOULD-BLOCK';

    auditLog(`${prefix} (session=${session}, source=${result.source}): ${result.reason}`);
    process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
