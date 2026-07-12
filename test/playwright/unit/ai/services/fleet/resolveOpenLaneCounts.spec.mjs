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
 * counting + completeness contract is pinned deterministically.
 * @param {Object} filesByRelativePath
 * @param {Object} [flags={}]
 * @returns {Object} an `{existsSync, readdirSync, readFileSync}` seam
 */
function makeFsFixture(filesByRelativePath, {existsSync = true, readdirThrows = false, unreadable = []} = {}) {
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

            if (key === undefined || unreadable.some(u => String(absOrRelPath).endsWith(u))) {
                throw new Error(`EACCES: ${absOrRelPath}`)
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
    test('a COMPLETE scan counts OPEN assigned issues per resident across chunks, keyed by the corpus login', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada', 'neo-gpt']}),
            'chunk-1/issue-2.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-2/issue-3.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']})
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(true); // every file parsed → the scan is trustworthy
        // ada is co-assigned once + solo across two chunks -> 3; gpt shares just the first -> 1
        expect(counts.get('neo-opus-ada')).toBe(3);
        expect(counts.get('neo-gpt')).toBe(1)
    });

    test('cleanly-parsed CLOSED + unassigned-OPEN issues contribute no count but do NOT taint completeness', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'CLOSED', assignees: ['neo-opus-ada']}),
            'chunk-1/issue-2.md': issueMarkdown({state: 'OPEN',   assignees: []})
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(true); // read successfully — just not open assigned lanes
        expect(counts.size).toBe(0)
    });

    test('a known resident with no open lanes is ABSENT from counts on a COMPLETE scan — the assembler reads that as a proven 0', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-gpt']})
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        // completeness is the discriminator: absent + complete → the stamp site derives 0 (not null)
        expect(complete).toBe(true);
        expect(counts.has('neo-opus-ada')).toBe(false)
    });

    test('only issue-*.md entries are scanned — a non-issue sibling is ignored and does not taint completeness', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md' : issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-1/_index.json': '{"not":"an issue"}',
            'chunk-1/README.md'  : 'no frontmatter here'
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(true);            // README.md is not an issue-*.md → never scanned, no taint
        expect(counts.get('neo-opus-ada')).toBe(1);
        expect(counts.size).toBe(1)
    });

    test('a missing corpus is INCOMPLETE (source unavailable → unknown, never a fabricated zero)', () => {
        const fsImpl = makeFsFixture({}, {existsSync: false});

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: '/does/not/exist', fsImpl});

        expect(complete).toBe(false);
        expect(counts.size).toBe(0)
    });

    test('a readdir failure is INCOMPLETE, never a throw', () => {
        const fsImpl = makeFsFixture(
            {'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']})},
            {readdirThrows: true}
        );

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);
        expect(counts.size).toBe(0)
    });

    test('RA2 regression: one malformed issue for a resident who ALSO has a good issue taints the whole scan — NEVER the good file\'s smaller count', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-good.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // unterminated double-quote → yaml.load throws; the parser can't reveal this file named ada too
            'chunk-1/issue-bad.md' : '---\nstate: OPEN\ntitle: "unterminated\nassignees:\n  - neo-opus-ada\n---\n\nbody\n'
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        // the scan is INCOMPLETE — the assembler stamps null for ada, NOT the good file's count of 1
        expect(complete).toBe(false);
    });

    test('an UNREADABLE issue file taints the whole scan (INCOMPLETE), never an under-count', () => {
        const fsImpl = makeFsFixture(
            {
                'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
                'chunk-1/issue-2.md': issueMarkdown({state: 'OPEN', assignees: ['neo-gpt']})
            },
            {unreadable: ['issue-2.md']}
        );

        const {complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);
    });

    test('an issue file with NO frontmatter fence taints completeness (corrupt issue, not a silent skip)', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-1/issue-2.md': 'a corrupt issue file with no frontmatter block at all'
        });

        const {complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false)
    });

    // --- valid-YAML-but-INVALID-SHAPE: parses cleanly (no throw), yet is an unusable record that may hide a
    //     resident. Distinct from the malformed-YAML throw above; both must taint completeness. ---

    test('valid YAML of an INVALID shape (a top-level sequence, not a mapping) taints completeness', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // parses cleanly as a top-level ARRAY — valid YAML, but it cannot carry state/assignees, so it is an
            // unusable record shape that may hide a resident. It must taint, not clean-skip.
            'chunk-1/issue-2.md': '---\n- state: OPEN\n- assignees: neo-gpt\n---\n\nbody\n'
        });

        const {complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);
    });

    test('valid YAML with a NON-ARRAY assignees scalar taints completeness — the hidden resident is null, never a false 0', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // parses cleanly as {state:'OPEN', assignees:'neo-gpt'} — assignees is PRESENT but a scalar, not an
            // array; the old clean-skip hid neo-gpt and would let an absent neo-gpt be stamped a false 0.
            'chunk-1/issue-2.md': '---\nstate: OPEN\ntitle: \'a lane\'\nassignees: neo-gpt\n---\n\nbody\n'
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);               // the invalid-shape record taints the scan
        expect(counts.has('neo-gpt')).toBe(false);  // neo-gpt was NOT silently counted; incomplete → the assembler stamps null, not 0
    });

    test('OPEN with an empty/null assignees field does NOT over-taint (genuinely unassigned, not an invalid shape)', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            'chunk-1/issue-2.md': '---\nstate: OPEN\ntitle: \'a lane\'\nassignees:\n---\n\nbody\n' // assignees: null
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(true);                 // a genuinely-unassigned OPEN issue is classifiable — no taint
        expect(counts.get('neo-opus-ada')).toBe(1);
    });

    // --- RA1 (Emmy Cycle-2, exact-head): three false-zero falsifiers that survived the top-level-array repair.
    //     Each parses cleanly, is not the canonical bare-null / [] unassigned form, and can HIDE a real OPEN
    //     assignment — so each must FAIL CLOSED (taint), never clean-skip. Corpus-grounded: 464/464 issues carry
    //     an assignees line and states are only OPEN/CLOSED, so tainting an unrecognized state or a missing key
    //     never over-fires on the real corpus, while the dominant bare `assignees:` (null) stays clean. ---

    test('RA1: an UNRECOGNIZED state (neither OPEN nor CLOSED) taints — it may be a mislabeled OPEN hiding an assignment', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // a state the classifier does not recognize; its assignee (neo-gpt) would otherwise be silently dropped
            'chunk-1/issue-2.md': '---\nstate: UNKNOWN\nassignees:\n  - neo-gpt\n---\n\nbody\n'
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);               // unrecognized state → cannot prove it is not a hidden open lane
        expect(counts.has('neo-gpt')).toBe(false);  // never counted; incomplete → the assembler stamps null, not a false 0
    });

    test('RA1: an OPEN assignees array holding a NON-STRING entry taints — an object entry hides the login it names', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // `[{login: neo-gpt}]` is a valid array, but the entry is an object, not a plain login — the old
            // typeof-string skip dropped it silently and would let an absent neo-gpt be stamped a false 0
            'chunk-1/issue-2.md': '---\nstate: OPEN\nassignees:\n  - login: neo-gpt\n---\n\nbody\n'
        });

        const {counts, complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);
        expect(counts.has('neo-gpt')).toBe(false);
    });

    test('RA1: an OPEN issue with a MISSING assignees key taints — the sync always emits the field, so its absence is an anomaly (null / [] stay clean)', () => {
        const fsImpl = makeFsFixture({
            'chunk-1/issue-1.md': issueMarkdown({state: 'OPEN', assignees: ['neo-opus-ada']}),
            // no assignees line at all → meta.assignees is undefined. Distinct from the canonical bare `assignees:`
            // (null) / `assignees: []` unassigned forms, which do NOT taint (see the over-taint test above).
            'chunk-1/issue-2.md': '---\nstate: OPEN\ntitle: \'a lane\'\n---\n\nbody\n'
        });

        const {complete} = resolveOpenLaneCounts({issuesDir: ISSUES_DIR, fsImpl});

        expect(complete).toBe(false);
    });
});
