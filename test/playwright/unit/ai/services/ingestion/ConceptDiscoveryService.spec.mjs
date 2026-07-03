import {setup} from '../../../../setup.mjs';

const appName = 'ConceptDiscoveryServiceTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';

test.describe('Neo.ai.daemons.services.ConceptDiscoveryService', () => {
    let ConceptDiscoveryService;
    let ConceptService;
    let OpenAiCompatible;
    let logger;

    let tmpConceptsDir;
    let tmpIssuesDir;
    let tmpPullsDir;

    let originalIssuesDir;
    let originalPullsDir;
    let originalPrScanLimit;
    let originalGenerate;

    let llmResponses = [];
    let llmCallCount = 0;

    let originalWarn;
    let warnMessages = [];

    test.beforeAll(async () => {
        ConceptDiscoveryService = (await import('../../../../../../ai/services/ingestion/ConceptDiscoveryService.mjs')).default;
        ConceptService          = (await import('../../../../../../ai/services/ConceptService.mjs')).default;
        OpenAiCompatible        = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        logger                  = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
    });

    test.beforeEach(() => {
        ConceptService.nodes.clear();
        ConceptService.edgesBySource.clear();
        ConceptService.edgesByTarget.clear();
        ConceptService.aliasIndex.clear();
        ConceptService.loaded = false;

        tmpConceptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-discovery-concepts-'));
        tmpIssuesDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-discovery-issues-'));
        tmpPullsDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-discovery-pulls-'));

        ConceptService.defaultConceptsDir = tmpConceptsDir;

        originalIssuesDir   = ConceptDiscoveryService.issuesDir;
        originalPullsDir    = ConceptDiscoveryService.pullsDir;
        originalPrScanLimit = ConceptDiscoveryService.prScanLimit;

        ConceptDiscoveryService.issuesDir = tmpIssuesDir;
        ConceptDiscoveryService.pullsDir  = tmpPullsDir;

        // Stub LLM provider — each call returns the next queued response
        llmResponses = [];
        llmCallCount = 0;
        originalGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async function(prompt) {
            const idx = Math.min(llmCallCount, llmResponses.length - 1);
            llmCallCount++;
            const response = llmResponses[idx];
            return {content: typeof response === 'string' ? response : JSON.stringify(response)};
        };

        warnMessages = [];
        originalWarn = logger.warn;
        logger.warn  = (...args) => {
            warnMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        };
    });

    test.afterEach(() => {
        if (originalIssuesDir === undefined)   delete ConceptDiscoveryService.issuesDir; else ConceptDiscoveryService.issuesDir = originalIssuesDir;
        if (originalPullsDir === undefined)    delete ConceptDiscoveryService.pullsDir;  else ConceptDiscoveryService.pullsDir  = originalPullsDir;
        if (originalPrScanLimit !== undefined) ConceptDiscoveryService.prScanLimit = originalPrScanLimit;

        if (originalGenerate) OpenAiCompatible.prototype.generate = originalGenerate;
        if (originalWarn)     logger.warn = originalWarn;

        if (tmpConceptsDir && fs.existsSync(tmpConceptsDir)) { try { fs.rmSync(tmpConceptsDir, {recursive: true}); } catch (e) {} }
        if (tmpIssuesDir   && fs.existsSync(tmpIssuesDir))   { try { fs.rmSync(tmpIssuesDir,   {recursive: true}); } catch (e) {} }
        if (tmpPullsDir    && fs.existsSync(tmpPullsDir))    { try { fs.rmSync(tmpPullsDir,    {recursive: true}); } catch (e) {} }

        // Symmetric singleton cleanup per `feedback_symmetric_spec_cleanup.md`
        ConceptService.nodes.clear();
        ConceptService.edgesBySource.clear();
        ConceptService.edgesByTarget.clear();
        ConceptService.aliasIndex.clear();
        ConceptService.loaded = false;
    });

    /**
     * Writes a bare nodes.jsonl + edges.jsonl into the temp concepts dir so
     * `ConceptService.loadGraph()` has something to parse without false dedupe matches.
     */
    function writeEmptyConceptGraph() {
        fs.writeFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), '', 'utf8');
        fs.writeFileSync(path.join(tmpConceptsDir, 'edges.jsonl'), '', 'utf8');
    }

    /**
     * Seeds the concept graph with the given node records so dedupe tests have real state.
     * @param {Object[]} nodes
     */
    function writeSeedConceptGraph(nodes) {
        fs.writeFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), nodes.map(n => JSON.stringify(n)).join('\n') + '\n', 'utf8');
        fs.writeFileSync(path.join(tmpConceptsDir, 'edges.jsonl'), '', 'utf8');
    }

    /**
     * Writes a fake issue markdown file into the temp issues dir. Always includes YAML
     * frontmatter + a body long enough to exceed MIN_SOURCE_LENGTH.
     */
    function writeIssueFile(filename, {labels = [], id = null, bodyExtra = ''} = {}) {
        const fm = `---\nid: ${id || 'auto'}\ntitle: Test\nlabels:\n${labels.map(l => `  - ${l}`).join('\n') || '  - enhancement'}\n---\n`;
        const body = fm + 'This is a test issue body. '.repeat(20) + bodyExtra;
        fs.writeFileSync(path.join(tmpIssuesDir, filename), body, 'utf8');
    }

    /**
     * Writes a fake PR markdown file with body + comments section.
     */
    function writePullFile(filename, {bodyExtra = ''} = {}) {
        const fm   = `---\nnumber: ${filename.match(/(\d+)/)[1]}\ntitle: Test PR\n---\n`;
        const body = fm + '## Summary\n\n' + 'Some description text. '.repeat(15) + bodyExtra + '\n\n## Comments\n\n### @agent - 2026-04-19T10:00:00Z\n\nReview comment with architectural discussion. '.repeat(10);
        fs.writeFileSync(path.join(tmpPullsDir, filename), body, 'utf8');
    }

    test('mineFromEpics should only process epic-labeled issues and emit LLM candidates', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        writeIssueFile('issue-100.md', {labels: ['enhancement'], id: 100});
        writeIssueFile('issue-200.md', {labels: ['epic', 'ai'],  id: 200});
        writeIssueFile('issue-300.md', {labels: ['bug'],         id: 300});

        llmResponses = [{
            candidates: [{
                id         : 'native-edge-graph',
                name       : 'Native Edge Graph',
                description: 'The SQLite-backed topology that stores concept + issue + PR nodes with typed edges.',
                reasoning  : 'Passes the Teaching Test — meta-architectural, not a single-class concept.',
                aliases    : ['edge graph', 'concept graph']
            }]
        }];

        const candidates = await ConceptDiscoveryService.mineFromEpics();

        // Only the single epic-labeled issue should trigger an LLM call
        expect(llmCallCount).toBe(1);
        expect(candidates.length).toBe(1);
        expect(candidates[0].name).toBe('Native Edge Graph');
        expect(candidates[0].validated).toBe(false);
        expect(candidates[0].verifiedAt).toBeNull();
        expect(candidates[0].tier).toBe(3);
        expect(candidates[0].source).toBe('epic-200');
    });

    test('mineFromPullRequests should cap at prScanLimit and process most-recent PRs first', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        // Three PRs — cap at 2 so only the two most-recent (highest numbers) get processed
        writePullFile('pr-100.md');
        writePullFile('pr-200.md');
        writePullFile('pr-300.md');

        ConceptDiscoveryService.prScanLimit = 2;

        llmResponses = [
            {candidates: [{id: 'substrate-choice-discipline', name: 'Substrate Choice Discipline', description: 'x', reasoning: 'y', aliases: []}]},
            {candidates: []}
        ];

        const candidates = await ConceptDiscoveryService.mineFromPullRequests();

        expect(llmCallCount).toBe(2);
        expect(candidates.length).toBe(1);
        expect(candidates[0].source).toMatch(/^pull-pr-(300|200)$/); // one of the top-2 most recent
    });

    test('extractConceptsFromSource should dedupe against existing ConceptService entries', async () => {
        writeSeedConceptGraph([
            {id: 'multi-threading', name: 'Multi-Threading', tier: 1, description: '', uniqueToNeo: true, tags: [], aliases: ['worker threading']}
        ]);
        ConceptService.loadGraph();

        llmResponses = [{
            candidates: [
                {id: 'multi-threading',       name: 'Multi-Threading',         description: 'dup', reasoning: 'y', aliases: []},
                {id: 'worker-threading-slug', name: 'worker threading',        description: 'alias dup', reasoning: 'y', aliases: []},
                {id: 'novel-concept',         name: 'Novel Concept',           description: 'new', reasoning: 'y', aliases: []}
            ]
        }];

        const body     = 'Enough content to exceed MIN_SOURCE_LENGTH. '.repeat(20);
        const accepted = await ConceptDiscoveryService.extractConceptsFromSource('test-source', body);

        // Two dupes filtered (id match + alias match), only one survives
        expect(accepted.length).toBe(1);
        expect(accepted[0].name).toBe('Novel Concept');
    });

    test('extractConceptsFromSource should dedupe punctuation/case variants by normalized concept name (#13840)', async () => {
        writeSeedConceptGraph([
            {id: 'vba', name: 'VBA', tier: 2, description: '', uniqueToNeo: false, tags: [], aliases: ['Verify Before Assert']}
        ]);
        ConceptService.loadGraph();

        llmResponses = [{
            candidates: [
                {id: 'v-b-a',             name: 'V-B-A',           description: 'dup', reasoning: 'y', aliases: []},
                {id: 'review_response',   name: 'Review_Response', description: 'new', reasoning: 'y', aliases: []},
                {id: 'review-response-2', name: 'Review-Response', description: 'dup-by-normalized-name', reasoning: 'y', aliases: []}
            ]
        }];

        const body     = 'Enough content to exceed MIN_SOURCE_LENGTH. '.repeat(20);
        const accepted = await ConceptDiscoveryService.extractConceptsFromSource('variant-source', body);
        const unique   = ConceptDiscoveryService.dedupeCandidatesByNormalizedName(accepted);

        expect(unique.length).toBe(1);
        expect(unique[0].name).toBe('Review_Response');
    });

    test('extractConceptsFromSource should tolerate malformed LLM output without throwing', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        llmResponses = ['not valid json at all, certainly no candidates field'];

        const body     = 'Adequate source content. '.repeat(20);
        const accepted = await ConceptDiscoveryService.extractConceptsFromSource('broken-llm-source', body);

        expect(accepted).toEqual([]);
    });

    test('extractConceptsFromSource should skip short sources below MIN_SOURCE_LENGTH', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        const tooShort = 'Tiny body.';
        const accepted = await ConceptDiscoveryService.extractConceptsFromSource('tiny-source', tooShort);

        // No LLM call should have been made
        expect(llmCallCount).toBe(0);
        expect(accepted).toEqual([]);
    });

    test('aiConfig.data.conceptDiscovery.minSourceLength override changes extraction behavior (#10086 pattern)', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.data.conceptDiscovery ??= {};
        const original = aiConfig.data.conceptDiscovery?.minSourceLength;
        const bodyText = 'Moderate length source. '.repeat(15); // ~360 chars — above default 200, below an override of 10000

        llmResponses = [{candidates: [{id: 'x', name: 'X', description: 'y', reasoning: 'z', aliases: []}]}];

        try {
            // Raise threshold above body length — extraction must short-circuit without invoking LLM
            aiConfig.data.conceptDiscovery.minSourceLength = 10000;
            const skipped = await ConceptDiscoveryService.extractConceptsFromSource('raised-threshold', bodyText);
            expect(skipped).toEqual([]);
            expect(llmCallCount).toBe(0);

            // Restore the normal threshold — same body now triggers the LLM
            aiConfig.data.conceptDiscovery.minSourceLength = 200;
            const accepted = await ConceptDiscoveryService.extractConceptsFromSource('normal-threshold', bodyText);
            expect(llmCallCount).toBe(1);
            expect(accepted.length).toBe(1);
        } finally {
            aiConfig.data.conceptDiscovery.minSourceLength = original;
        }
    });

    test('runDiscoveryCycle should merge epic+PR candidates, dedupe by id, and append to nodes.jsonl', async () => {
        writeEmptyConceptGraph();

        writeIssueFile('issue-500.md', {labels: ['epic'], id: 500});
        writePullFile('pr-700.md');

        llmResponses = [
            // Epic call
            {candidates: [{id: 'shared-concept', name: 'Shared Concept', description: 'from-epic', reasoning: 'y', aliases: []}]},
            // PR call — returns SAME id to test dedupe-by-id + a new one
            {candidates: [
                {id: 'shared-concept',  name: 'Shared Concept',        description: 'from-pr',    reasoning: 'y', aliases: []},
                {id: 'pr-only-concept', name: 'PR Only Concept',        description: 'pr-only',    reasoning: 'y', aliases: []}
            ]}
        ];

        const result = await ConceptDiscoveryService.runDiscoveryCycle();

        expect(result.candidatesAdded).toBe(2);
        const ids = result.candidates.map(c => c.id);
        expect(ids).toContain('shared-concept');
        expect(ids).toContain('pr-only-concept');

        // Verify the append actually hit the JSONL
        const nodesContent = fs.readFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), 'utf8');
        expect(nodesContent).toContain('"shared-concept"');
        expect(nodesContent).toContain('"pr-only-concept"');
        expect(nodesContent).toContain('"validated":false');
        expect(nodesContent).toContain('"verifiedAt":null');

        // Epic-source wins on id collision (first-seen): description should be 'from-epic', not 'from-pr'
        const sharedLine = nodesContent.split('\n').find(l => l.includes('"shared-concept"'));
        expect(sharedLine).toContain('from-epic');
        expect(sharedLine).not.toContain('from-pr');
    });

    test('runMessageConceptHarvest uses frequency pre-filter and appends process/MX candidates (#13840)', async () => {
        writeEmptyConceptGraph();

        const messages = [
            {
                id            : 'MESSAGE:one',
                subject       : '[lane-claim] measure-cheap-first follow-up',
                taggedConcepts: ['coordination-saturation-cycle'],
                properties    : {subject: '[lane-claim] measure-cheap-first follow-up', taggedConcepts: ['coordination-saturation-cycle']}
            },
            {
                id            : 'MESSAGE:two',
                subject       : '[lane-claim] coordination saturation',
                taggedConcepts: ['coordination-saturation-cycle'],
                properties    : {subject: '[lane-claim] coordination saturation', taggedConcepts: ['coordination-saturation-cycle']}
            },
            {
                id            : 'MESSAGE:three',
                subject       : '[single-use] should not spend budget',
                taggedConcepts: [],
                properties    : {subject: '[single-use] should not spend budget', taggedConcepts: []}
            }
        ];

        llmResponses = [{
            candidates: [{
                id         : 'coordination-saturation-cycle',
                name       : 'Coordination Saturation Cycle',
                description: 'A recurring swarm process loop surfaced from A2A messages.',
                reasoning  : 'Maintainers need it to operate the swarm productively.',
                aliases    : ['coordination saturation']
            }]
        }];

        const result = await ConceptDiscoveryService.runMessageConceptHarvest({messages, markHarvested: false});

        expect(llmCallCount).toBe(1);
        expect(result.messagesProcessed).toBe(3);
        expect(result.termsConsidered).toBe(2); // [lane-claim] + curated coordination tag; singleton filtered out
        expect(result.candidatesAdded).toBe(1);
        expect(result.candidates[0]).toMatchObject({
            ontologyLayer  : 'process-mx',
            codeGapEligible: false,
            validated      : false
        });
        expect(result.candidates[0].tags).toEqual(expect.arrayContaining(['process-mx', 'message-concept-harvest']));

        const nodesContent = fs.readFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), 'utf8');
        const row          = JSON.parse(nodesContent.split('\n').find(l => l.includes('"coordination-saturation-cycle"')));
        expect(row.ontologyLayer).toBe('process-mx');
        expect(row.codeGapEligible).toBe(false);
    });

    test('markMessagesConceptHarvested stamps MESSAGE nodes through a narrow upsert seam (#13840)', () => {
        const upserts = [];
        const marked  = ConceptDiscoveryService.markMessagesConceptHarvested([
            {
                id        : 'MESSAGE:mark-me',
                subject   : 'mark subject',
                properties: {subject: 'mark subject', sentAt: '2026-06-24T00:00:00.000Z'}
            }
        ], {
            timestamp : '2026-06-24T20:00:00.000Z',
            upsertNode: spec => upserts.push(spec)
        });

        expect(marked).toBe(1);
        expect(upserts).toEqual([{
            id        : 'MESSAGE:mark-me',
            type      : 'MESSAGE',
            name      : 'mark subject',
            properties: {
                subject           : 'mark subject',
                sentAt            : '2026-06-24T00:00:00.000Z',
                conceptHarvested  : true,
                conceptHarvestedAt: '2026-06-24T20:00:00.000Z'
            }
        }]);
    });

    test('runMessageConceptHarvest does not stamp messages when candidate append fails (#13840)', async () => {
        writeEmptyConceptGraph();

        const originalAppendCandidates = ConceptDiscoveryService.appendCandidates;
        const originalMarkMessages     = ConceptDiscoveryService.markMessagesConceptHarvested;
        let   marked                   = false;

        ConceptDiscoveryService.appendCandidates = async () => {
            throw new Error('append-failed');
        };
        ConceptDiscoveryService.markMessagesConceptHarvested = () => {
            marked = true;
            return 1;
        };

        llmResponses = [{
            candidates: [{
                id         : 'message-born-concept',
                name       : 'Message Born Concept',
                description: 'A process concept born in repeated A2A messages.',
                reasoning  : 'Maintainers need it to operate the swarm productively.',
                aliases    : []
            }]
        }];

        try {
            await expect(ConceptDiscoveryService.runMessageConceptHarvest({
                messages: [
                    {
                        id            : 'MESSAGE:one',
                        subject       : '[message-born-concept] one',
                        taggedConcepts: [],
                        properties    : {subject: '[message-born-concept] one'}
                    },
                    {
                        id            : 'MESSAGE:two',
                        subject       : '[message-born-concept] two',
                        taggedConcepts: [],
                        properties    : {subject: '[message-born-concept] two'}
                    }
                ]
            })).rejects.toThrow('append-failed');

            expect(marked).toBe(false);
        } finally {
            ConceptDiscoveryService.appendCandidates             = originalAppendCandidates;
            ConceptDiscoveryService.markMessagesConceptHarvested = originalMarkMessages;
        }
    });

    test('runMessageConceptHarvest does not stamp messages when provider output is unusable (#13840)', async () => {
        writeEmptyConceptGraph();

        const originalMarkMessages = ConceptDiscoveryService.markMessagesConceptHarvested;
        let   marked               = false;

        ConceptDiscoveryService.markMessagesConceptHarvested = () => {
            marked = true;
            return 1;
        };

        llmResponses = ['not-json'];

        try {
            await expect(ConceptDiscoveryService.runMessageConceptHarvest({
                messages: [
                    {
                        id            : 'MESSAGE:one',
                        subject       : '[unusable-provider-output] one',
                        taggedConcepts: [],
                        properties    : {subject: '[unusable-provider-output] one'}
                    },
                    {
                        id            : 'MESSAGE:two',
                        subject       : '[unusable-provider-output] two',
                        taggedConcepts: [],
                        properties    : {subject: '[unusable-provider-output] two'}
                    }
                ]
            })).rejects.toThrow('No usable candidates parsed');

            expect(marked).toBe(false);
        } finally {
            ConceptDiscoveryService.markMessagesConceptHarvested = originalMarkMessages;
        }
    });

    test('runDiscoveryCycle captures envelope extraction_metadata, denormalizes onto each candidate, and persists it (#10106)', async () => {
        writeEmptyConceptGraph();
        writeIssueFile('issue-900.md', {labels: ['epic'], id: 900});

        llmResponses = [{
            candidates: [
                {id: 'persisted-a', name: 'Persisted A', description: 'a', reasoning: 'y', aliases: []},
                {id: 'persisted-b', name: 'Persisted B', description: 'b', reasoning: 'y', aliases: []}
            ],
            extraction_metadata: {
                missing_fields      : ['reasoning'],
                ambiguous_references: ['the module — three modules exist'],
                confidence_score    : 0.7
            }
        }];

        const result = await ConceptDiscoveryService.runDiscoveryCycle();
        expect(result.candidatesAdded).toBe(2);

        // Envelope metadata describes the extraction pass → denormalized onto EACH candidate it produced
        for (const c of result.candidates) {
            expect(c.extraction_metadata).toEqual({
                missing_fields      : ['reasoning'],
                ambiguous_references: ['the module — three modules exist'],
                confidence_score    : 0.7
            });
        }

        // ...and persisted to nodes.jsonl as the additive optional field
        const nodesContent = fs.readFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), 'utf8');
        const row          = JSON.parse(nodesContent.split('\n').find(l => l.includes('"persisted-a"')));
        expect(row.extraction_metadata.confidence_score).toBe(0.7);
        expect(row.extraction_metadata.missing_fields).toEqual(['reasoning']);
    });

    test('extractConceptsFromSource omits extraction_metadata for legacy responses and coerces malformed blocks (#10106)', async () => {
        writeEmptyConceptGraph();
        ConceptService.loadGraph();

        llmResponses = [
            // Legacy: no extraction_metadata envelope at all
            {candidates: [{id: 'legacy-c', name: 'Legacy C', description: 'x', reasoning: 'y', aliases: []}]},
            // Malformed: non-array fields + out-of-range score → coerced to safe defaults
            {
                candidates         : [{id: 'malformed-c', name: 'Malformed C', description: 'x', reasoning: 'y', aliases: []}],
                extraction_metadata: {missing_fields: 'not-an-array', ambiguous_references: null, confidence_score: 5}
            }
        ];

        const body = 'Enough content to exceed MIN_SOURCE_LENGTH. '.repeat(20);

        const legacy = await ConceptDiscoveryService.extractConceptsFromSource('legacy-source', body);
        expect(legacy.length).toBe(1);
        expect(legacy[0].extraction_metadata).toBeUndefined(); // additive — legacy rows carry no field

        const malformed = await ConceptDiscoveryService.extractConceptsFromSource('malformed-source', body);
        expect(malformed[0].extraction_metadata).toEqual({
            missing_fields      : [],   // 'not-an-array' → []
            ambiguous_references: [],   // null → []
            confidence_score    : null  // 5 (outside [0,1]) → null
        });
    });

    test('appendCandidates refuses a write to a production-like concepts dir from a test context (#13683 guard)', async () => {
        // The guard keys on the test-runner signal (UNIT_TEST_MODE, set by the test-unit config)
        // against a production-like (non-disposable) concepts dir. Point defaultConceptsDir at a
        // production path and confirm the write is refused before it can pollute the live ontology.
        ConceptService.defaultConceptsDir = '/var/neo-ai-data/concepts';

        await expect(
            ConceptDiscoveryService.appendCandidates([{id: 'should-not-write', name: 'X'}])
        ).rejects.toThrow(/STORE_WRITE_GUARD/);

        // The guard threw before the append — nothing was written at the production path.
        expect(fs.existsSync('/var/neo-ai-data/concepts/nodes.jsonl')).toBe(false);
    });

    test('appendCandidates writes normally to a disposable (tmp) concepts dir — no false positive', async () => {
        // The beforeEach default is an os.tmpdir() path (disposable) — the guard must be a no-op so
        // the legitimate REM-pipeline append (and every other test here) is unaffected.
        ConceptService.defaultConceptsDir = tmpConceptsDir;

        await ConceptDiscoveryService.appendCandidates([{id: 'disposable-ok', name: 'Disposable OK'}]);

        const nodesContent = fs.readFileSync(path.join(tmpConceptsDir, 'nodes.jsonl'), 'utf8');
        expect(nodesContent).toContain('"disposable-ok"');
    });
});
