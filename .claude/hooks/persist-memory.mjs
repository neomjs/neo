#!/usr/bin/env node
/**
 * @summary Claude Code `Stop`-hook that auto-persists the just-completed turn into the Neo Memory Core,
 * removing the manually-forgotten `add_memory` call mandated by AGENTS.md §memory_core_protocol.
 *
 * The empirical failure this closes: session `f018be49-...` ran ~25 turns with ZERO manual
 * saves under cognitive load, breaking every downstream `query_raw_memories(sessionId)` self-detection.
 * The correct layer for "always do X at end of turn" is the harness, not agent discipline.
 *
 * Flow: Claude Code pipes `{session_id, transcript_path, ...}` on stdin when a turn ends → this script
 * tails the transcript JSONL, extracts the last turn (see {@link parseLastTurn}), and writes it via the
 * direct-SDK `ai/services.mjs` (`Memory_Service.addMemory`) — no MCP subprocess, no HTTP endpoint.
 *
 * **Fail-soft by contract:** EVERY error path logs to stderr and `exit(0)`. A memory-save failure (chroma
 * down, malformed transcript, services cold-start error) must NEVER block the user's next turn. Wired
 * `async: true` in settings so the ~500ms-1s `services.mjs` cold-start is off the interactive path.
 *
 * Transcript-field → `add_memory` mapping = **Option B** (resolved at ticket-intake): prefer
 * extended-thinking blocks for `thought`, fall back to pre-response narration. Full rationale +
 * wiring instructions: `.claude/hooks/README.md`.
 *
 * @see .claude/hooks/README.md
 */

import fs                            from 'fs';
import path                          from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Claude Code threads tool outputs back into the transcript as `user`-role entries whose content is
 * entirely `tool_result` blocks. Those are continuations, NOT prompts — so a "real" user prompt is a
 * `user` entry carrying string content or at least one non-empty `text` block.
 * @param {Object} entry A parsed transcript entry (`type === 'user'`).
 * @returns {Boolean}
 */
export function isRealUserPrompt(entry) {
    const content = entry?.message?.content;
    if (typeof content === 'string') return content.trim().length > 0;
    if (Array.isArray(content))      return content.some(block => block.type === 'text' && (block.text || '').trim().length > 0);
    return false
}

/**
 * Extracts the human-readable prompt text from a user entry (string content, or the joined `text`
 * blocks of an array content — attachments / tool_result blocks are ignored).
 * @param {Object} entry A parsed transcript `user` entry.
 * @returns {String}
 */
export function userPromptText(entry) {
    const content = entry?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content))      return content.filter(block => block.type === 'text').map(block => block.text || '').join('\n');
    return ''
}

/**
 * Parses raw transcript JSONL into the just-completed turn, mapped onto the `add_memory` triad.
 *
 * Robust to the REAL Claude Code transcript shape (empirically 8 entry types — `user`, `assistant`,
 * plus `queue-operation` / `last-prompt` / `ai-title` / `pr-link` / `attachment` / `system` bookkeeping
 * that routinely TRAILS the final assistant text). It therefore does NOT trust "tail entry === turn":
 * it filters to `user`/`assistant` non-sidechain entries, reverse-scans for the real turn-start prompt,
 * then folds the turn's assistant blocks into `{prompt, thought, response, toolsUsed, amountToolCalls}`.
 *
 * @param {String} jsonl Raw transcript file contents (newline-delimited JSON).
 * @returns {{prompt:String, thought:String, response:String, toolsUsed:String[], amountToolCalls:Number, model:(String|null)}|null}
 * `null` when no persistable turn exists (no real user prompt in the transcript).
 */
export function parseLastTurn(jsonl) {
    const entries = String(jsonl).split('\n')
        .filter(Boolean)
        .map(line => { try { return JSON.parse(line) } catch { return null } })
        // Only conversational entries carry turn content; sub-agent sidechains belong to nested loops.
        .filter(entry => entry && (entry.type === 'user' || entry.type === 'assistant') && !entry.isSidechain);

    // Turn-start = the LAST `user` entry that is a real prompt (not a tool_result continuation).
    let startIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === 'user' && isRealUserPrompt(entries[i])) { startIdx = i; break }
    }
    if (startIdx === -1) return null;

    const prompt = userPromptText(entries[startIdx]).trim();
    if (!prompt) return null;

    const thinking = [], textBlocks = [], toolNames = [];
    let amountToolCalls = 0, model = null;

    // Fold every assistant entry from the prompt to end-of-file (a single turn spans many entries:
    // assistant text/thinking → tool_use → tool_result → assistant continues → … → final text).
    for (let i = startIdx + 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.type !== 'assistant') continue;
        model = entry.message?.model || model;
        const content = Array.isArray(entry.message?.content) ? entry.message.content : [];
        for (const block of content) {
            if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
                thinking.push(block.thinking)
            } else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                textBlocks.push(block.text)
            } else if (block.type === 'tool_use') {
                amountToolCalls++;
                block.name && toolNames.push(block.name)
            }
        }
    }

    // response = the final user-facing text block (the answer, after all reasoning + tool work).
    const response  = (textBlocks.length ? textBlocks[textBlocks.length - 1] : '').trim();
    // Option B: thought = extended-thinking blocks; else the assistant's narration EXCLUDING the
    // response (so a no-thinking single-text turn never duplicates response into thought).
    const narration = textBlocks.slice(0, -1);
    let   thought   = (thinking.length ? thinking : narration).join('\n\n').trim();

    // `thought` and `response` are schema-required (AddMemoryRequest); an unusual turn shape must never
    // fail the save on a missing field — substitute an explicit placeholder instead.
    if (!thought) thought = '(No discrete reasoning blocks were recorded for this turn.)';

    return {
        prompt,
        thought,
        response       : response || '(No final text response was recorded for this turn.)',
        toolsUsed      : [...new Set(toolNames)],
        amountToolCalls,
        model
    }
}

/**
 * Hook entrypoint: read stdin → parse the turn → persist via the direct Memory Core SDK. Never throws;
 * always exits 0.
 * @returns {Promise<void>}
 */
export async function main() {
    let hookInput;
    try {
        hookInput = JSON.parse(await readStdin())
    } catch (error) {
        console.error('[persist-memory] Could not parse hook stdin JSON:', error.message);
        return process.exit(0)
    }

    const transcriptPath = hookInput.transcript_path;
    const sessionId      = hookInput.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        console.error(`[persist-memory] transcript_path missing or not found: ${transcriptPath}`);
        return process.exit(0)
    }

    let turn;
    try {
        turn = parseLastTurn(fs.readFileSync(transcriptPath, 'utf8'))
    } catch (error) {
        console.error('[persist-memory] Failed to read/parse transcript:', error.message);
        return process.exit(0)
    }

    if (!turn) {
        console.error('[persist-memory] No persistable turn found (no user prompt) — skipping.');
        return process.exit(0)
    }

    try {
        // Lazy import so a parse failure above never pays the heavy services.mjs cold-start. The import
        // itself eagerly boots the Memory Core singletons (Neo.create auto-triggers initAsync).
        const {Memory_Service, Memory_LifecycleService} = await import(
            pathToFileURL(path.resolve(__dirname, '../../ai/services.mjs')).href
        );

        // ALWAYS await ready(); NEVER call initAsync() externally — core.Base documents that an external
        // initAsync() double-executes and causes fatal duplication bugs (src/core/Base.mjs).
        await Memory_LifecycleService.ready();

        await Memory_Service.addMemory({
            prompt         : turn.prompt,
            thought        : turn.thought,
            response       : turn.response,
            sessionId,
            model          : turn.model || undefined,
            toolsUsed      : turn.toolsUsed,
            amountToolCalls: turn.amountToolCalls
        });

        console.error(`[persist-memory] ✅ Persisted turn for session ${sessionId} — ${turn.amountToolCalls} tool call(s), ${turn.toolsUsed.length} distinct tool(s).`)
    } catch (error) {
        console.error('[persist-memory] addMemory failed (non-blocking):', error.message)
    }

    process.exit(0)
}

/**
 * Drains process stdin to a string. Resolves '' if stdin is closed with no data.
 * @returns {Promise<String>}
 */
function readStdin() {
    return new Promise(resolve => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', () => resolve(data))
    })
}

// Run main() only when executed directly (`node persist-memory.mjs`), NOT when imported by the unit
// test — importing must expose the pure parser without booting the Memory Core services.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
