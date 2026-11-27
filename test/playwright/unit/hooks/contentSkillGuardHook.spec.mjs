import {test, expect}                                     from '@playwright/test';
import {spawnSync}                                        from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os                                                 from 'node:os';
import path                                               from 'node:path';
import {fileURLToPath}                                    from 'node:url';

import {
    CONTENT_ROUTES,
    classifyLine,
    contentSkillGuardMessage,
    decideContentSkillGuard,
    hasReadSinceCompaction,
    routeFor
} from '../../../../.claude/hooks/contentSkillGuardHook.mjs';

const hookPath     = fileURLToPath(new URL('../../../../.claude/hooks/contentSkillGuardHook.mjs', import.meta.url)),
      templatePath = fileURLToPath(new URL('../../../../.claude/settings.template.json', import.meta.url)),
      notesPayload = '.agents/skills/release-notes/references/release-notes-workflow.md',
      blogPayload  = '.agents/skills/blog-post/references/blog-authoring-guide.md',
      notesFile    = '/work/neo/.github/RELEASE_NOTES/v14.1.0.md',
      blogFile     = '/work/neo/learn/blog/a-new-post.md',
      dir          = mkdtempSync(path.join(os.tmpdir(), 'content-skill-guard-'));

/** @summary A main-thread (or sidechain) `Read` tool call as Claude Code writes it to the transcript. */
const read = (file, isSidechain = false) => JSON.stringify({
    type: 'assistant', isSidechain, message: {content: [{type: 'tool_use', id: 'toolu_1', name: 'Read', input: {file_path: file}}]}
});

const compact = () => JSON.stringify({type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted'}),
      chatter = () => JSON.stringify({type: 'user', message: {content: 'Grüße 🌿 — a line with multi-byte characters, long enough to cross chunks'}});

let fixtureCount = 0;

/** @summary Writes `lines` as a transcript and returns its path. */
function transcript(...lines) {
    const file = path.join(dir, `t${fixtureCount++}.jsonl`);
    writeFileSync(file, lines.join('\n') + '\n');
    return file
}

test.afterAll(() => rmSync(dir, {recursive: true, force: true}));

test.describe('contentSkillGuardHook — Claude PreToolUse Write/Edit guard', () => {
    test('routes release notes and blog posts to their payloads, in any checkout, and nothing else', () => {
        expect(routeFor(notesFile).payload).toBe(notesPayload);
        expect(routeFor(blogFile).payload).toBe(blogPayload);
        expect(routeFor('.github/RELEASE_NOTES/v14.1.0.md').payload).toBe(notesPayload);
        expect(routeFor('C:\\work\\neo-wt-1\\learn\\blog\\post.md').payload).toBe(blogPayload);

        for (const other of ['/work/neo/learn/guides/Routing.md', '/work/neo/learn/blogs/x.md', '/work/neo/RELEASE_NOTES/v1.md', '', undefined]) {
            expect(routeFor(other)).toBeNull()
        }
        expect(CONTENT_ROUTES).toHaveLength(2)
    });

    test('a read after the last compaction boundary is the witness; one before it is not', () => {
        const scan = file => hasReadSinceCompaction(file, notesPayload);

        expect(scan(transcript())).toBe(false);
        expect(scan(transcript(chatter(), read(`/work/neo/${notesPayload}`), chatter()))).toBe(true);
        // Through the node_modules link, the published skills package
        expect(scan(transcript(read(`/work/neo/node_modules/neo-agent-skills/${notesPayload}`)))).toBe(true);
        expect(scan(transcript(read(`/work/neo/${notesPayload}`), chatter(), compact(), chatter()))).toBe(false);
        expect(scan(transcript(compact(), read(`/work/neo/${notesPayload}`)))).toBe(true);
        // A helper's read, the other skill's payload, and a mention without a Read call do not count
        expect(scan(transcript(read(`/work/neo/${notesPayload}`, true)))).toBe(false);
        expect(scan(transcript(read(`/work/neo/${blogPayload}`)))).toBe(false);
        expect(scan(transcript(JSON.stringify({type: 'user', message: {content: `see ${notesPayload} for "Read"`}})))).toBe(false)
    });

    test('the backward scan gives the same verdicts when every line crosses a chunk and splits a multi-byte character', () => {
        const cases = [
            [transcript(chatter(), read(`/work/neo/${notesPayload}`), chatter(), chatter()),          true],
            [transcript(read(`/work/neo/${notesPayload}`), chatter(), compact(), chatter(), chatter()), false],
            [transcript(chatter(), compact(), chatter(), read(`/work/neo/${notesPayload}`), chatter()), true]
        ];

        for (const chunkBytes of [1, 5, 13, 64, 1 << 20]) {
            for (const [file, expected] of cases) {
                expect(hasReadSinceCompaction(file, notesPayload, {chunkBytes})).toBe(expected)
            }
        }
    });

    test('classifyLine parses only marker lines and ignores malformed ones', () => {
        const suffix = notesPayload.slice(notesPayload.indexOf('skills/'));

        expect(classifyLine(compact(), suffix)).toBe(false);
        expect(classifyLine(read(`/x/${notesPayload}`), suffix)).toBe(true);
        expect(classifyLine('{"compact_boundary" broken', suffix)).toBeUndefined();
        expect(classifyLine(`{"name":"Read" ${suffix} broken`, suffix)).toBeUndefined();
        expect(classifyLine('', suffix)).toBeUndefined()
    });

    test('blocks a Write or Edit of a governed file until the payload is read, naming the payload', () => {
        const unread = transcript(chatter()),
              done   = transcript(read(`/work/neo/${blogPayload}`));

        expect(decideContentSkillGuard({tool_name: 'Write', tool_input: {file_path: notesFile}, transcript_path: unread}))
            .toEqual({decision: 'block', reason: contentSkillGuardMessage(routeFor(notesFile))});
        expect(decideContentSkillGuard({tool_name: 'Edit', tool_input: {file_path: blogFile}, transcript_path: unread}).reason)
            .toContain(blogPayload);
        expect(decideContentSkillGuard({tool_name: 'Edit', tool_input: {file_path: blogFile}, transcript_path: done})).toBeNull()
    });

    test('everything else passes untouched, and a broken input fails open', () => {
        const never  = () => { throw new Error('the transcript must not be read') },
              unread = transcript(chatter());

        expect(decideContentSkillGuard({tool_name: 'Edit', tool_input: {file_path: '/work/neo/src/Neo.mjs'}, transcript_path: unread}, {hasRead: never})).toBeNull();
        expect(decideContentSkillGuard({tool_name: 'Bash', tool_input: {command: `cat ${notesFile}`}, transcript_path: unread}, {hasRead: never})).toBeNull();

        for (const payload of [null, undefined, {}, {tool_name: 'Edit'}, {tool_name: 'Edit', tool_input: {file_path: notesFile}}]) {
            expect(decideContentSkillGuard(payload)).toBeNull()
        }
        expect(decideContentSkillGuard({tool_name: 'Edit', tool_input: {file_path: notesFile}, transcript_path: path.join(dir, 'missing.jsonl')})).toBeNull()
    });

    test('the command reads the payload from stdin, prints the block, and stays silent on garbage', () => {
        const run     = input => spawnSync('node', [hookPath], {input, encoding: 'utf8'}),
              blocked = run(JSON.stringify({tool_name: 'Write', tool_input: {file_path: notesFile}, transcript_path: transcript(chatter())}));

        expect(blocked.status).toBe(0);
        expect(JSON.parse(blocked.stdout)).toEqual({decision: 'block', reason: contentSkillGuardMessage(routeFor(notesFile))});

        for (const input of ['', 'not json', JSON.stringify({tool_name: 'Edit', tool_input: {file_path: blogFile}, transcript_path: transcript(read(`/w/${blogPayload}`))})]) {
            const quiet = run(input);
            expect(quiet.status).toBe(0);
            expect(quiet.stdout).toBe('')
        }
    });

    // The template is the tracked registration: each seat's `.claude/settings.json` is hydrated from it
    test('the settings template registers the hook on Write and Edit, and git tracks the hook', () => {
        const settings = JSON.parse(readFileSync(templatePath, 'utf8')),
              entry    = settings.hooks.PreToolUse.find(item => item.matcher === '^(Write|Edit)$'),
              ignored  = spawnSync('git', ['check-ignore', '--no-index', '.claude/hooks/contentSkillGuardHook.mjs'], {encoding: 'utf8'});

        expect(entry.hooks.some(hook => hook.command.includes('.claude/hooks/contentSkillGuardHook.mjs'))).toBe(true);
        expect(new RegExp(entry.matcher).test('Write') && new RegExp(entry.matcher).test('Edit')).toBe(true);
        expect(new RegExp(entry.matcher).test('NotebookEdit')).toBe(false);
        // `.claude/hooks/*` is ignored for the generated seat hooks; an Engine guard is excepted by name
        expect(ignored.status).toBe(1)
    })
});
