#!/usr/bin/env node
/**
 * @module .claude/hooks/contentSkillGuardHook
 * @summary Claude Code `PreToolUse` guard for `Write` and `Edit` on release notes and blog posts: the edit waits until
 * the session has read the governing skill payload since its last compaction.
 *
 * A skill loads when the session classifies its own task, and a seat framed as "refresh the counts" on an existing
 * notes file never does. The file path needs no classification. The transcript is the witness: a main-thread `Read` of
 * the payload after the last `compact_boundary` entry. Transcripts reach hundreds of megabytes, so the scan runs
 * backward from the end and stops at the first boundary it meets. Like its siblings, the guard fails open on a
 * malformed payload or an unreadable transcript: a broken guard must never block ordinary editing.
 */
import fs              from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * Each governed folder with the skill payload a session reads before editing inside it.
 * @member {Object[]} CONTENT_ROUTES
 */
export const CONTENT_ROUTES = Object.freeze([
    Object.freeze({folder: /(^|\/)\.github\/RELEASE_NOTES\//, payload: '.agents/skills/release-notes/references/release-notes-workflow.md'}),
    Object.freeze({folder: /(^|\/)learn\/blog\//,             payload: '.agents/skills/blog-post/references/blog-authoring-guide.md'})
]);

/**
 * @summary The block reason for an edit under `route`.
 * @param {Object} route An entry of {@link CONTENT_ROUTES}.
 * @returns {String}
 */
export function contentSkillGuardMessage(route) {
    return `Read \`${route.payload}\` before this edit. Release notes and blog posts are edited only after the session ` +
        'has read their skill since its last compaction, so the edit meets the skill\'s bar, not just the file in front of it.'
}

/**
 * @summary Returns the route governing `filePath`, or `null`.
 * @param {String} [filePath='']
 * @returns {Object|null}
 */
export function routeFor(filePath = '') {
    const normalized = String(filePath).replaceAll('\\', '/');
    return CONTENT_ROUTES.find(route => route.folder.test(normalized)) || null
}

/**
 * @summary Classifies one transcript line: `true` for a main-thread `Read` of the payload, `false` for a compaction
 * boundary, `undefined` for anything else. The payload matches from `skills/` on, so a read through the
 * `node_modules` link counts. Only lines carrying a marker are parsed.
 * @param {String} line
 * @param {String} suffix The payload path from `skills/` on.
 * @returns {Boolean|undefined}
 */
export function classifyLine(line, suffix) {
    if (line.includes('"compact_boundary"')) {
        try {
            const entry = JSON.parse(line);
            if (entry.type === 'system' && entry.subtype === 'compact_boundary') return false
        } catch {}
    }
    if (line.includes(suffix) && line.includes('"Read"')) {
        try {
            const entry = JSON.parse(line);
            if (entry.type === 'assistant' && entry.isSidechain !== true && entry.message?.content?.some(part =>
                part?.type === 'tool_use' && part.name === 'Read' &&
                String(part.input?.file_path || '').replaceAll('\\', '/').endsWith(suffix))) return true
        } catch {}
    }
    return undefined
}

/**
 * @summary Whether the transcript holds a `Read` of `payload` after its last compaction boundary, scanning lines from
 * the end. Lines split at newline bytes, which never fall inside a multi-byte character.
 * @param {String} transcriptPath
 * @param {String} payload
 * @param {Object} [options]
 * @param {Number} [options.chunkBytes=1048576]
 * @returns {Boolean}
 */
export function hasReadSinceCompaction(transcriptPath, payload, {chunkBytes = 1 << 20} = {}) {
    const suffix = payload.slice(payload.indexOf('skills/')),
          fd     = fs.openSync(transcriptPath, 'r');

    try {
        let position = fs.fstatSync(fd).size,
            carry    = Buffer.alloc(0);

        while (position > 0) {
            const length = Math.min(chunkBytes, position);
            position -= length;

            const chunk = Buffer.alloc(length);
            fs.readSync(fd, chunk, 0, length, position);

            const text  = Buffer.concat([chunk, carry]),
                  first = position > 0 ? text.indexOf(0x0A) : -1;

            // Until a newline arrives, the whole chunk is the tail of a line that started earlier
            if (position > 0 && first === -1) {carry = text; continue}

            carry = position > 0 ? text.subarray(0, first) : Buffer.alloc(0);

            const lines = text.subarray(first + 1).toString('utf8').split('\n');

            for (let i = lines.length - 1; i >= 0; i--) {
                const verdict = classifyLine(lines[i], suffix);
                if (verdict !== undefined) return verdict
            }
        }

        return false
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * @summary Returns the Claude hook block directive for an edit whose governing skill the session has not read, or
 * `null` to allow.
 * @param {Object} hookPayload Parsed Claude Code hook payload.
 * @param {Object} [options]
 * @param {Function} [options.hasRead=hasReadSinceCompaction] The transcript scan; tests may inject one.
 * @returns {{decision: 'block', reason: String}|null}
 */
export function decideContentSkillGuard(hookPayload, {hasRead = hasReadSinceCompaction} = {}) {
    if (hookPayload?.tool_name !== 'Write' && hookPayload?.tool_name !== 'Edit') return null;

    const route = routeFor(hookPayload.tool_input?.file_path);
    if (!route || typeof hookPayload.transcript_path !== 'string') return null;

    try {
        return hasRead(hookPayload.transcript_path, route.payload) ? null : {decision: 'block', reason: contentSkillGuardMessage(route)}
    } catch {
        return null
    }
}

/** @summary Parses the hook payload, or null for a malformed one. */
function parseHookPayload(raw) {
    try { return raw ? JSON.parse(raw) : null } catch { return null }
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
        const decision = decideContentSkillGuard(parseHookPayload(await readStdin()));
        if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`)
    } catch {}
}
