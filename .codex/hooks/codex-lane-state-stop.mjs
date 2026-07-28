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
import {classifyPromptingContext,
        decideDeferenceStopHookAction,
        decideStopHookAction,
        isSyntheticPromptingText,
        LANE_STATE_SCHEMA_HINT,
        parseOutcomeToVerdict,
        STOP_HOOK_TURN_OPTIONS_HINT} from '../../ai/scripts/lifecycle/stopHookDecision.mjs';
import {collectLaneStateToolEvidenceFromJsonl,
        collectLaneStateToolEvidenceFromMessages,
        validateLaneStateTerminal} from '../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';
import {appendHookProjection,
        readConfiguredHookProjection} from '../../ai/scripts/lifecycle/hookProjectionReader.mjs';

export const CODEX_STOP_BLOCK_INJECTION_SUPPORTED = true;
export const CODEX_PROMPT_CONTEXT_TTL_MS           = 10 * 60 * 1000;

const LOG_DIR                  = process.env.NEO_AI_DAEMON_DIR || path.join(os.homedir(), '.neo-ai-data', 'codex-lane-state-hook'),
      PROMPT_CONTEXT_FILE_NAME = 'codex-prompt-context.json';

/**
 * @summary Resolves the hook-local prompt-context fallback file path.
 * @param {Object} [options]
 * @param {String} [options.logDir]
 * @returns {String}
 */
export function getCodexPromptContextPath({logDir = LOG_DIR} = {}) {
    return path.join(logDir, PROMPT_CONTEXT_FILE_NAME);
}

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
        message.payload?.content ??
        message.text ??
        message.message?.text ??
        message.payload?.text ??
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
        message.item?.role === 'assistant' ||
        message.payload?.role === 'assistant';
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
        message.item?.role === 'user' ||
        message.payload?.role === 'user';
}

/**
 * @summary Returns likely message containers from Claude/Codex/OpenAI hook records.
 * @param {*} record
 * @returns {Array}
 * @protected
 */
function getMessageCandidates(record) {
    if (!record || typeof record !== 'object') return [record];

    const candidates = [],
          seen       = new Set(),
          add        = candidate => {
              if (!candidate || seen.has(candidate)) return;
              seen.add(candidate);
              candidates.push(candidate);
          };

    add(record);
    add(record.payload);
    add(record.payload?.message);
    add(record.payload?.item);
    add(record.message);
    add(record.item);
    add(record.message?.payload);
    add(record.item?.payload);

    return candidates;
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
        const record = messages[i];

        for (const message of getMessageCandidates(record)) {
            if (!isAssistantMessage(record) && !isAssistantMessage(message)) continue;

            const text = extractTextFromMessage(message);
            if (text) return text;
        }
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
        const record = messages[i];

        for (const message of getMessageCandidates(record)) {
            if (!isUserMessage(record) && !isUserMessage(message)) continue;

            const text = extractTextFromMessage(message);
            if (!text || isSyntheticPromptingText(text)) continue;

            return text;
        }
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
 * @summary Reads the short-lived prompt-class fallback written by the Codex UserPromptSubmit hook.
 * @param {Object} [options]
 * @param {String} [options.promptContextPath]
 * @param {Number} [options.now]
 * @param {Number} [options.ttlMs]
 * @returns {{text: String, source: String, ageMs: Number}|null}
 */
export function readPromptContext({
    now               = Date.now(),
    promptContextPath = getCodexPromptContextPath(),
    ttlMs             = CODEX_PROMPT_CONTEXT_TTL_MS
} = {}) {
    let record;

    try {
        record = JSON.parse(fs.readFileSync(promptContextPath, 'utf8'));
    } catch {
        return null;
    }

    const createdAt = Date.parse(record?.createdAt || '');
    if (!Number.isFinite(createdAt)) return null;

    const ageMs = now - createdAt;
    if (ageMs < 0 || ageMs > ttlMs) return null;

    const text = typeof record?.promptingText === 'string' ? record.promptingText : '';
    if (!text.trim()) return null;

    return {
        ageMs,
        source: record.source || 'prompt_context',
        text
    };
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
 * @param {Object} [options]
 * @param {String} [options.logDir]
 * @returns {{text: String, source: String}}
 */
export function extractPromptingText(input = {}, {logDir} = {}) {
    const direct = input.last_user_message ?? input.lastUserMessage ?? input.prompting_message ?? input.promptingMessage;
    if (direct) {
        const text = extractTextFromMessage(direct);
        if (text.trim() && !isSyntheticPromptingText(text)) return {text, source: 'last_user_message'};
    }

    const messages = input.messages ?? input.conversation ?? input.transcript;
    if (Array.isArray(messages)) {
        const text = extractLastUserTextFromMessages(messages);
        if (text.trim()) return {text, source: 'messages'};
    }

    const transcriptPath = input.transcript_path ?? input.transcriptPath;
    if (transcriptPath) {
        const text = extractLastUserTextFromJsonl(fs.readFileSync(transcriptPath, 'utf8'));
        if (text.trim()) return {text, source: 'transcript_path'};
    }

    const promptContext = readPromptContext({
        promptContextPath: getCodexPromptContextPath({logDir})
    });
    if (promptContext) return {text: promptContext.text, source: 'prompt_context'};

    return {text: '', source: 'none'};
}

/**
 * @summary Collects same-turn tool-call evidence from Codex Stop payload records.
 * @param {Object} [input={}]
 * @returns {String}
 */
export function collectCodexLaneStateEvidence(input = {}) {
    const chunks   = [],
          messages = input.messages ?? input.conversation ?? input.transcript;

    if (Array.isArray(messages)) {
        chunks.push(collectLaneStateToolEvidenceFromMessages(messages));
    }

    const transcriptPath = input.transcript_path ?? input.transcriptPath;
    if (transcriptPath) {
        try {
            chunks.push(collectLaneStateToolEvidenceFromJsonl(fs.readFileSync(transcriptPath, 'utf8')));
        } catch {
            // Missing evidence is handled by the validator as an unearned PR gate.
        }
    }

    return chunks.filter(Boolean).join('\n');
}

/**
 * @summary Builds the no-hold reminder text without claiming Codex can inject it yet.
 * @param {String} verdictReason
 * @returns {String}
 */
export function buildNoHoldReminder(verdictReason, {
    autonomousHandoff = false,
    handoffReason = '',
    handoffWindowMs = null,
    operatorInLoop = false,
    promptSource = ''
} = {}) {
    const promptDiagnostic = !operatorInLoop && promptSource === 'none'
              ? '\nOperator prompt was not visible to this hook (promptSource=none), so live operator dialogue could not be confirmed.'
              : '',
          handoffDiagnostic = autonomousHandoff
              ? `\nOperator prompt matched handoff-to-autonomous (${handoffReason || 'unknown'}${handoffWindowMs ? `, windowMs=${handoffWindowMs}` : ''}); treating this turn as autonomous no-hold.`
        : '';

    return `No-hold reminder: ${verdictReason}. There is no hold state: continue concrete work on the active lane, perform an assigned review that advances a named lane, or pick a fresh claimable lane. Passive waiting is not a terminal.
${promptDiagnostic}${handoffDiagnostic}

${STOP_HOOK_TURN_OPTIONS_HINT}

${LANE_STATE_SCHEMA_HINT}`;
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
 * @param {Boolean} [options.laneContinuationEnforced=true] The `stopHook.laneContinuation` policy leaf
 * — `false` allows every turn-end without demanding a lane-state terminal. Resolved from the same
 * config SSOT the Claude adapter reads, so the two harnesses cannot drift on policy.
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideCodexHookAction(verdict, {
    autonomousHandoff        = false,
    enforcing                = false,
    blockInjectionSupported  = CODEX_STOP_BLOCK_INJECTION_SUPPORTED,
    handoffReason            = '',
    handoffWindowMs          = null,
    operatorInLoop           = false,
    promptSource             = '',
    laneContinuationEnforced = true
} = {}) {
    const decision = decideStopHookAction(verdict, {
        enforcing,
        operatorInLoop,
        blockInjectionSupported,
        blockUnsupportedReason: 'Codex Stop block/inject contract is not proven, so this hook remains fail-open.',
        laneContinuationEnforced
    });

    if (decision.action === 'allow') return decision;
    if (decision.action === 'block') return {
        action: 'block',
        reason: buildNoHoldReminder(decision.reason, {
            autonomousHandoff,
            handoffReason,
            handoffWindowMs,
            operatorInLoop,
            promptSource
        })
    };

    return {
        action: 'would-block',
        reason: buildNoHoldReminder(decision.reason, {
            autonomousHandoff,
            handoffReason,
            handoffWindowMs,
            operatorInLoop,
            promptSource
        })
    };
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
 * @param {String} [options.logDir]
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String, source: String, promptSource: String, verdict: Object, phrase: (String|undefined)}}
 */
export function classifyCodexStopPayload(input = {}, {enforcing = false, logDir, policy} = {}) {
    // Two-axis turn-end policy, resolved through the same pure-defaults twin the Claude adapter uses
    // (ticket-ref-ok: ADR 0019 §5.5 names this exact module shape — a non-entrypoint must not import
    // Neo). INJECTABLE: the live
    // hook lets it default to the env-resolved policy, while callers that need to pin a policy pass
    // one explicitly rather than mutating `process.env` — a classifier that can only be exercised by
    // global env mutation is untestable in-process and invites cross-spec bleed.
    // `policy` is REQUIRED and deliberately has no fallback: a hardcoded default here would be a
    // shadow copy of the `stopHook.*` leaves — a hidden default that drifts silently. `main()`
    // resolves it from the config SSOT and always passes it; a missing policy is a wiring bug, and
    // `main()`'s try/catch turns the throw into the hook's fail-open allow rather than a trapped turn.
    if (!policy) {
        throw new Error('classifyCodexStopPayload: `policy` is required — resolve it from AiConfig.stopHook');
    }

    const {deferenceMirror, laneContinuation: laneContinuationEnforced} = policy;

    const stopHookActive                              = !!(input.stop_hook_active || input.stopHookActive),
          {text, source}                              = extractFinalAssistantText(input),
          {text: promptingText, source: promptSource} = extractPromptingText(input, {logDir}),
          // Evidence collection feeds ONLY the lane-state validator — skip the scan when the
          // continuation apparatus is off rather than computing a result nothing reads.
          evidenceText                                                        = laneContinuationEnforced ? collectCodexLaneStateEvidence(input) : '',
          promptContext                                                       = classifyPromptingContext({stopHookActive, promptingText}),
          {autonomousHandoff, handoffReason, handoffWindowMs, operatorInLoop} = promptContext;

    // Deference-register check: shared decision, adapter-owned payload/source metadata.
    const deferenceDecision = decideDeferenceStopHookAction(text, {
        operatorInLoop,
        enforcing,
        deferenceMirrorEnabled: deferenceMirror
    });
    if (deferenceDecision) {
        return {
            ...deferenceDecision,
            source,
            promptSource,
            autonomousHandoff,
            handoffReason,
            handoffWindowMs,
            operatorInLoop,
            verdict: null
        };
    }

    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(text);
    } catch (e) {
        parseError = e;
    }

    const verdict = parseOutcomeToVerdict(
        {descriptor, parseError},
        laneState => validateLaneStateTerminal(laneState, {evidenceText})
    );

    return {
        ...decideCodexHookAction(verdict, {
            autonomousHandoff,
            enforcing,
            handoffReason,
            handoffWindowMs,
            operatorInLoop,
            promptSource,
            laneContinuationEnforced
        }),
        autonomousHandoff,
        handoffReason,
        handoffWindowMs,
        operatorInLoop,
        source,
        promptSource,
        verdict
    };
}

/**
 * @summary Resolves the two-axis turn-end policy from the config SSOT.
 *
 * This hook is a thread-entrypoint, so it bootstraps the `Neo` namespace and reads
 * `AiConfig.stopHook.*` at the use site — no re-derivation, no defaults twin, no hand-rolled env
 * decode. The bootstrap is a GUARDED DYNAMIC import rather than a top-level one: a top-level import
 * throws before `main()`'s try/catch exists, so a broken overlay would trap every turn-end instead
 * of degrading to this hook's fail-open allow.
 * @returns {Promise<{deferenceMirror: Boolean, laneContinuation: Boolean, projection: Object}|null>}
 * `null` when the config tree could not be resolved.
 * @protected
 */
async function resolveStopHookPolicy() {
    try {
        await import('../../src/Neo.mjs');
        await import('../../src/core/_export.mjs');

        const {default: AiConfig} = await import('../../ai/config.mjs');

        const projection = AiConfig.stopHook.projection;

        return {
            deferenceMirror : AiConfig.stopHook.deferenceMirror,
            laneContinuation: AiConfig.stopHook.laneContinuation,
            projection      : {
                path              : projection.path,
                targetId          : projection.targetId,
                capability        : projection.capability,
                agentId           : projection.agentId,
                harnessType       : projection.harnessType,
                instanceKeyDigest : projection.instanceKeyDigest,
                workspaceKeyDigest: projection.workspaceKeyDigest,
                maxRows           : projection.maxRows,
                maxBytes          : projection.maxBytes
            }
        };
    } catch (e) {
        auditLog(`CONFIG-ERROR: could not resolve stopHook policy (${e.message}); allowing stop.`);
        return null;
    }
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

    const policy = await resolveStopHookPolicy();

    if (!policy) {
        process.exit(0);
    }

    let result;
    try {
        result = classifyCodexStopPayload(input, {
            enforcing: process.env.NEO_CODEX_LANE_STATE_ENFORCE === '1',
            policy
        });
    } catch (e) {
        auditLog(`HOOK-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    const session = input.session_id || input.sessionId || '?';

    if (result.action === 'block') {
        auditLog(`BLOCK (session=${session}, source=${result.source}, promptSource=${result.promptSource}, operatorInLoop=${result.operatorInLoop}, autonomousHandoff=${!!result.autonomousHandoff}, handoffReason=${result.handoffReason || 'none'}, handoffWindowMs=${result.handoffWindowMs ?? 'none'}): ${result.reason}`);

        let projectionRender = '';
        try {
            projectionRender = readConfiguredHookProjection({
                config: policy.projection,
                now   : Date.now()
            }).render
        } catch (e) {
            // Projection enrichment is informational. A reader bug must never alter Stop admission.
            auditLog(`PROJECTION-ERROR: ${e.message}; using bare Stop directive.`);
        }

        process.stdout.write(JSON.stringify({
            decision: 'block',
            reason  : appendHookProjection(result.reason, projectionRender)
        }), () => process.exit(0));
        return;
    }

    const prefix = result.action === 'allow' ? 'ALLOW' : 'WOULD-BLOCK';

    auditLog(`${prefix} (session=${session}, source=${result.source}, promptSource=${result.promptSource}, operatorInLoop=${result.operatorInLoop}, autonomousHandoff=${!!result.autonomousHandoff}, handoffReason=${result.handoffReason || 'none'}, handoffWindowMs=${result.handoffWindowMs ?? 'none'}): ${result.reason}`);
    process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
