import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os                                       from 'node:os';
import path                                     from 'node:path';
import {fileURLToPath, pathToFileURL}           from 'node:url';
import {
    extractWakeSubmitNonce,
    readHookPayload,
    recordTurnPresenceFromHook
} from '../../ai/mcp/server/memory-core/helpers/TurnPresenceHookWriter.mjs';

const LOG_DIR_NAME              = 'codex-lane-state-hook',
      PROMPT_CONTEXT_FILE_NAME  = 'codex-prompt-context.json',
      PROMPT_CONTEXT_TEXT_LIMIT = 4000,
      PROMPT_CONTEXT_SOURCE     = 'codex-user-prompt-submit';

/**
 * @summary Extracts a wake-submit nonce from a Codex hook payload or raw prompt text.
 * @param {*} value Hook payload value.
 * @param {Number} [depth=0] Recursion guard for nested payloads.
 * @returns {String|null}
 */
export {extractWakeSubmitNonce, readHookPayload};

/**
 * @summary Resolves the Codex prompt-context file shared by UserPromptSubmit and Stop hooks.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String}
 */
export function getCodexPromptContextPath({env = process.env} = {}) {
    const logDir = env.NEO_AI_DAEMON_DIR || path.join(os.homedir(), '.neo-ai-data', LOG_DIR_NAME);

    return path.join(logDir, PROMPT_CONTEXT_FILE_NAME);
}

/**
 * @summary Extracts content text from Codex/OpenAI-style message content containers.
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
 * @summary Extracts the operator prompt text from representative Codex UserPromptSubmit payloads.
 * @param {*} value Hook payload value.
 * @param {Number} [depth=0] Recursion guard for untrusted hook payloads.
 * @returns {String}
 */
export function extractPromptingTextFromHookPayload(value, depth = 0) {
    if (depth > 8 || value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
            const text = extractPromptingTextFromHookPayload(value[i], depth + 1);
            if (text.trim()) return text;
        }
        return '';
    }
    if (typeof value !== 'object') return '';

    const role = value.role || value.payload?.role || value.message?.role || value.item?.role;
    if (role === 'user') {
        const text = extractTextFromContent(
            value.content ??
            value.payload?.content ??
            value.message?.content ??
            value.item?.content ??
            value.text ??
            value.payload?.text
        );
        if (text.trim()) return text;
    }
    if (role && role !== 'user') return '';

    const priorityKeys = [
        'prompt', 'user_prompt', 'userPrompt', 'last_user_message', 'lastUserMessage',
        'messages', 'conversation', 'transcript', 'payload', 'message', 'item', 'content', 'text', 'input'
    ];

    for (const key of priorityKeys) {
        if (!(key in value)) continue;

        const text = extractPromptingTextFromHookPayload(value[key], depth + 1);
        if (text.trim()) return text;
    }

    return '';
}

/**
 * @summary Writes a bounded same-turn prompt provenance record for the Codex Stop hook fallback.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @param {*} [options.hookPayload] UserPromptSubmit hook payload.
 * @param {Date} [options.now] Creation time.
 * @returns {{status: String, path: String, source: String, textLength?: Number, reason?: String}}
 */
export function writePromptContextFromHookPayload({
    env = process.env,
    hookPayload,
    now = new Date()
} = {}) {
    const text              = extractPromptingTextFromHookPayload(hookPayload).trim(),
          promptContextPath = getCodexPromptContextPath({env});

    mkdirSync(path.dirname(promptContextPath), {recursive: true});

    if (!text) {
        writeFileSync(promptContextPath, JSON.stringify({
            createdAt    : now.toISOString(),
            promptingText: '',
            reason       : 'no-prompting-text',
            source       : PROMPT_CONTEXT_SOURCE
        }, null, 2), 'utf8');

        return {
            path  : promptContextPath,
            reason: 'no-prompting-text',
            source: PROMPT_CONTEXT_SOURCE,
            status: 'cleared'
        };
    }

    writeFileSync(promptContextPath, JSON.stringify({
        createdAt    : now.toISOString(),
        promptingText: text.slice(0, PROMPT_CONTEXT_TEXT_LIMIT),
        source       : PROMPT_CONTEXT_SOURCE
    }, null, 2), 'utf8');

    return {
        path      : promptContextPath,
        source    : PROMPT_CONTEXT_SOURCE,
        status    : 'written',
        textLength: Math.min(text.length, PROMPT_CONTEXT_TEXT_LIMIT)
    };
}

/**
 * @summary Reads the plane leaves from `AiConfig`, the one config read in this process.
 *
 * Imported lazily so the module stays loadable — and its pure helpers unit-testable — without booting
 * the Neo state Provider. The hook process is an entrypoint, so reading the config singleton here is
 * the sanctioned shape; the writer it feeds is not one, and deliberately resolves nothing itself.
 * @returns {Promise<Object>} `{baseUrl, credential}`
 */
export async function readPlaneConfig() {
    await import('../../src/Neo.mjs');
    await import('../../src/core/_export.mjs');

    const {default: AiConfig} = await import('../../ai/config.mjs'),
          planeBase           = String(AiConfig.fleet.planeBase ?? '').trim().replace(/\/+$/, '');

    return {
        baseUrl   : planeBase ? `${planeBase}/mc/mcp` : '',
        credential: AiConfig.fleet.planeBearer ?? ''
    };
}

/**
 * @summary Emits a Codex turn-start beacon into the store the deployment serves.
 *
 * **This is the entrypoint, and the only place config is resolved.** It injects the plane leaves into
 * a writer that resolves nothing — replacing a path the writer derived from its own module location,
 * which sent every beacon to a private checkout that no reader queries.
 *
 * The wake-submit nonce matters more on this seat than on the others: the wake daemon's Codex
 * delivery proof correlates a submit to the interval it produced by matching that exact value, so it
 * travels with the event rather than being recomputed anywhere downstream.
 *
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment source.
 * @param {*} [options.hookPayload] Codex hook payload used to extract a wake-submit nonce.
 * @param {Object} [options.plane] Injected `{baseUrl, credential}`; read from `AiConfig` when absent.
 * @param {Function} [options.record] Transport seam.
 * @returns {Promise<Object>} `{status}` — `recorded`, or `skipped` with a reason.
 */
export async function recordTurnStarted({
    env = process.env,
    hookPayload,
    plane,
    record
} = {}) {
    try {
        writePromptContextFromHookPayload({env, hookPayload});
    } catch {
        // Fail-soft hook: prompt provenance improves Stop parity but must not block context loading.
    }

    return recordTurnPresenceFromHook({
        env,
        hookPayload,
        note  : 'codex UserPromptSubmit',
        plane : plane ?? await readPlaneConfig(),
        source: 'codex-user-prompt-submit',
        ...(record ? {record} : {})
    });
}

/**
 * @summary Reads the repo-local Codex context payload injected at prompt submit.
 * @returns {String}
 */
export function readCodexContext() {
    const contextUrl = new URL('../CODEX.md', import.meta.url);
    return readFileSync(contextUrl, 'utf8').trim();
}

/**
 * @summary Reads the canonical fleet NOW block (repo-root `NOW.md`) for prompt-submit
 * injection. Fail-open by contract: an absent or unreadable file yields an empty string, so a
 * seat boots without NOW, never without CODEX. The URL seam exists for specs.
 * @param {Object} [options]
 * @param {URL}    [options.nowUrl] NOW file location — defaults to the repo-root canonical file.
 * @returns {String}
 */
export function readNowContext({nowUrl = new URL('../../NOW.md', import.meta.url)} = {}) {
    try {
        return readFileSync(nowUrl, 'utf8').trim();
    } catch {
        return ''; // fail-open: an absent NOW never blocks the context load
    }
}

async function main() {
    let hookPayload = '';
    try {
        const rawPayload = await readHookPayload();
        if (rawPayload) {
            try {
                hookPayload = JSON.parse(rawPayload);
            } catch {
                hookPayload = rawPayload;
            }
        }
    } catch {
        // Fail-soft hook: absence of parseable stdin only drops nonce correlation, not context loading.
    }

    await recordTurnStarted({hookPayload}).catch(() => {});

    const context    = readCodexContext(),
          nowContext = readNowContext(),
          sections   = [];

    if (context) {
        sections.push(context);
    }

    if (nowContext) {
        sections.push(`<!-- NOW.md (canonical) -->\n${nowContext}`);
    }

    if (sections.length > 0) {
        process.stdout.write(sections.join('\n\n') + '\n');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
