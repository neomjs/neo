import {setup} from '../../../../setup.mjs';

const appName = 'ResolveOpenLaneCountsTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {resolveOpenLaneCounts} from '../../../../../../ai/services/fleet/resolveOpenLaneCounts.mjs';

/**
 * Build a hermetic in-memory issues-corpus filesystem seam. Keys are chunk-relative paths (the
 * shape `fs.readdirSync(dir, {recursive: true})` returns); values are the file contents. The
 * enricher counts against THIS fixture, never the live synced corpus (whose counts drift), so the
 * counting + fail-to-null contract is pinned deterministically.
 * @param {Object} filesByRelativePath
 * @param {Object} [flags={}]
 * @returns {Object} an `{existsSync, readdirSync, readFileSync}` seam
 */
function makeFsFixture(filesByRelativePath, {existsSync = true, readdirThrows = false} = {}) {
    return {
        existsSync: () => existsSync,
        readdirSync() {
            if (readdirThrows) {
                throw new Error('readdir failed')
            }
            return Object.keys(filesByRelativePath)
        },
        readFileSync(absOrRelPath) {
            // the enricher joins issuesDir + the relative path; match on the trailing relative key
            const key = Object.keys(filesByRelativePath).find(relKey => String(absOrRelPath).endsWith(relKey));

            if (key === undefined) {
                throw new Error(`ENOENT: ${absOrRelPath}`)
            }
            return filesByRelativePath[key]
        }
    }
}

/**
 * Render a minimal issue markdown file with just the frontmatter fields the enricher reads.
 * @param {Object} [fields={}]
 * @returns {String}
 */
function issueMarkdown({state = 'OPEN', assignees = []} = {}) {
    const assigneeBlock = assignees.length
        ? 'assignees:\n' + assignees.map(login => `  - ${login}`).join('\n')
        : 'assignees: []';

    return `---\nstate: ${state}\ntitle: 'a lane'\n${assigneeBlock}\n---\n\nissue body\n`
}

const ISSUES_DIR = '/fixture/resources/content/issues';

test.describe('ai/services/fleet/resolveOpenLaneCounts — the openLaneCount producer seam', () => {
    test('counts OPEN assigned issues per resident across chunks, keyed by the corpus login', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada', 'neo-gpt']}),
            'chunk-1/issue-2.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-2/issue-3.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']})
        });

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        // ada is co-assigned once + solo across two chunks -> 3; gpt shares just the first -> 1
        expect(counts.get('neo-opus-ada')).toBe(3);
        expect(counts.get('neo-gpt')).toBe(1)
    });

    test('CLOSED issues and unassigned OPEN issues contribute no count', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'CLOSED', assignees: ['neo-opus-ada']}),
            'chunk-1/issue-2.md': issueMarkdown({state: 'OPEN',   assignees: []})
        });

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(counts.has('neo-opus-ada')).toBe(false);
        expect(counts.size).toBe(0)
    });

    test('a resident with no open lanes is ABSENT from the map — the assembler stamps null, never 0', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-gpt']})
        });

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        // absent → `counts.get(login) ?? null` at the stamp site yields the honest null, not 0
        expect(counts.get('neo-opus-ada')).toBeUndefined()
    });

    test('only .md entries are scanned — a non-markdown sibling is ignored', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md' : issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-1/_index.json': '{"not":"an issue"}'
        });

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(counts.get('neo-opus-ada')).toBe(1);
        expect(counts.size).toBe(1)
    });

    test('a missing corpus yields an empty map, never a throw (fail-to-null)', () => {
        const fsImpl = makeFsFixture({}, {existsSync: false});

        const counts = resolveOpenLaneCounts({issuesDir: '/does/not/exist', fsImpl});

        expect(counts.size).toBe(0)
    });

    test('a readdir failure yields an empty map, never a throw', () => {
        const fsImpl = makeFsFixture(
            {'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']})},
            {readdirThrows: true}
        );

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(counts.size).toBe(0)
    });

    test('one unparseable file is skipped without zeroing the rest of the index', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-good.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // an unterminated double-quote makes yaml.load throw — the enricher must skip just this file
            'chunk-1/issue-bad.md' : '---\nstate: OPEN\ntitle: "unterminated\nassignees:\n  - neo-gpt\n---\n\nbody\n'
        });

        const counts = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(counts.get('neo-opus-ada')).toBe(1);
        expect(counts.has('neo-gpt')).toBe(false)
    });
});
