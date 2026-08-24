import {setup} from '../../../../setup.mjs';

const appName = 'IssueIngestorTest';

setup({
    neoConfig: { unitTestMode: true },
    appConfig: { name: appName, isMounted: () => true, vnodeInitialising: false }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

const RAW_EXTERNAL_URL = 'https://arkforge.tech/payload';
const QUARANTINED_URL  = '[QUARANTINED_URL: arkforge.tech]';

test.describe('Neo.ai.daemons.services.IssueIngestor', () => {
    let IssueIngestor;
    let StorageRouter;
    let _originalExistsSync;
    let _originalReaddir;
    let _originalReaddirSync;
    let _originalReadFile;
    let _originalReadFileSync;
    let _originalGetGraphCollection;
    let GraphService;
    let _originalGraphDb;
    let _originalUpsertNode;
    let _originalLinkNodes;
    let graphNodes;
    let graphEdges;

    // We will use a mock index.json and mock markdown files
    const mockIndexMap = [
        { type: 'issues', id: 2001, path: 'issues/issue-2001.md' },
        { type: 'issues', id: 2002, path: 'archive/issues/v1.0.0/issue-2002.md' },
        { type: 'discussions', id: 3001, path: 'discussions/discussion-3001.md' },
        { type: 'discussions', id: 3002, path: 'discussions/discussion-3002.md' },
        { type: 'pulls', id: 4001, path: 'pulls/pr-4001.md' },
        { type: 'pulls', id: 4002, path: 'pulls/pr-4002.md' }
    ];

    const mockFiles = {
        'resources/content/issues/issue-2001.md': [
            '---',
            'id: 2001',
            'title: Active Issue',
            'state: OPEN',
            'contentTrust:',
            '  projected: true',
            '  quarantined: 1',
            '---',
            '# Active Issue',
            '',
            `External source was defanged as ${QUARANTINED_URL}.`
        ].join('\n'),
        'resources/content/archive/issues/v1.0.0/issue-2002.md': '---\nstate: CLOSED\n---\n# Archive Issue',
        'resources/content/discussions/discussion-3001.md'     : [
            '---',
            'number: 3001',
            'title: Open Discussion',
            'category: Ideas',
            "createdAt: '2026-05-20T10:00:00Z'",
            "updatedAt: '2026-05-20T11:00:00Z'",
            'closed: false',
            'routingDispositionSchemaVersion: discussion-routing-disposition.v1',
            'routingDisposition: active',
            'routingDispositionReason: explicit-active-marker',
            'routingDispositionEvidence:',
            '  - marker:OQ_RESOLUTION_PENDING',
            '---',
            '# Open Discussion Body'
        ].join('\n'),
        'resources/content/discussions/discussion-3002.md': [
            '---',
            'number: 3002',
            'title: Closed Discussion',
            'category: Q&A',
            "createdAt: '2026-05-19T10:00:00Z'",
            "updatedAt: '2026-05-20T11:00:00Z'",
            'closed: true',
            "closedAt: '2026-05-20T12:00:00Z'",
            'routingDispositionSchemaVersion: discussion-routing-disposition.v1',
            'routingDisposition: terminal',
            'routingDispositionReason: github-closed',
            'routingDispositionEvidence:',
            '  - github:closed',
            '---',
            '# Closed Discussion Body'
        ].join('\n'),
        'resources/content/pulls/pr-4001.md': [
            '---',
            'number: 4001',
            'title: Resolve graph ticket',
            'state: MERGED',
            "createdAt: '2026-06-06T10:00:00Z'",
            "updatedAt: '2026-06-06T11:00:00Z'",
            '---',
            'Resolves #2001',
            '',
            '## Summary',
            'Hardens the PR resolution graph path.'
        ].join('\n'),
        'resources/content/pulls/pr-4002.md': [
            '---',
            'number: 4002',
            'title: Review actionability proof',
            'state: MERGED',
            "createdAt: '2026-06-23T10:00:00Z'",
            "updatedAt: '2026-06-23T15:22:40Z'",
            '---',
            '### `@neo-opus-grace` (CHANGES_REQUESTED) reviewed on 2026-06-23T09:33:00Z',
            '',
            '### Required Actions',
            '- [ ] Hold for the L0 decision before this actuator can be considered routable.',
            '- [ ] Extract shared runtime access instead of welding the privilege into B1.',
            '',
            '* **`[RETROSPECTIVE]`**: Required Actions are useful only when reduced to a concrete durable signal, not as raw review topology.',
            '',
            '### `@neo-opus-grace` (APPROVED) reviewed on 2026-06-23T15:22:40Z',
            '',
            'The L0 dependency landed, so the prior blocker is neutralized for this PR cycle.',
            '',
            '### Rubber stamp fixture',
            '',
            'LGTM.'
        ].join('\n'),
        'resources/content/_index.json': JSON.stringify(mockIndexMap)
    };

    test.beforeAll(async () => {
        IssueIngestor = (await import('../../../../../../ai/services/ingestion/IssueIngestor.mjs')).default;
        const services = await import('../../../../../../ai/services.mjs');
        GraphService   = services.Memory_GraphService;
        StorageRouter  = services.Memory_StorageRouter;

        _originalGraphDb = GraphService.db;
        _originalGetGraphCollection = StorageRouter.getGraphCollection;
        GraphService.db = {
            nodes           : { get: () => null },
            edges           : { items: [] },
            getAdjacentNodes: () => {},
            addNode         : node => graphNodes.push(node),
            updateNode      : () => {}
        };

        _originalExistsSync = fs.existsSync;
        _originalReaddir = fs.promises.readdir;
        _originalReaddirSync = fs.readdirSync;
        _originalReadFile = fs.promises.readFile;
        _originalReadFileSync = fs.readFileSync;
        _originalUpsertNode = GraphService.upsertNode;
        _originalLinkNodes = GraphService.linkNodes;
        GraphService.upsertNode = nodeData => {
            graphNodes.push({
                id        : nodeData.id,
                label     : nodeData.type || 'NODE',
                properties: {
                    name       : nodeData.name,
                    description: nodeData.description,
                    state      : nodeData.state,
                    updatedAt  : nodeData.updatedAt,
                    ...(nodeData.properties || {})
                }
            });
        };
        GraphService.linkNodes = (source, target, relationship, weight = 1.0, properties = {}) => {
            graphEdges.push({source, target, relationship, weight, properties});
        };

        fs.existsSync = (p) => {
            if (typeof p === 'string' && p.includes('resources/content')) {
                const normPath = p.replace(/\\/g, '/');
                for (const key of Object.keys(mockFiles)) {
                    if (normPath.endsWith(key)) return true;
                }
                if (p.endsWith('.md')) return true;
                if (!p.endsWith('.json')) return true; // Pretend directories exist
                return false;
            }
            return _originalExistsSync(p);
        };

        fs.promises.readdir = async (dirPath, options) => {
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/issues')) {
                return ['v1.0.0/issue-2002.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/discussions')) {
                return [];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/discussions')) {
                return ['discussion-3001.md', 'discussion-3002.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/issues')) {
                return ['issue-2001.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/discussions') || dirPath.includes('resources/content/pulls')) {
                return [];
            }
            return _originalReaddir.call(fs.promises, dirPath, options);
        };

        fs.readdirSync = (dirPath, options) => {
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/pulls')) {
                return [];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/pulls')) {
                return ['pr-4001.md', 'pr-4002.md'];
            }
            return _originalReaddirSync.call(fs, dirPath, options);
        };

        fs.promises.readFile = async (filePath, encoding) => {
            if (typeof filePath === 'string') {
                const normPath = filePath.replace(/\\/g, '/');
                for (const key of Object.keys(mockFiles)) {
                    if (normPath.endsWith(key)) {
                        return mockFiles[key];
                    }
                }
                console.log('Not mocked:', normPath);
            }
            return _originalReadFile.call(fs.promises, filePath, encoding);
        };

        fs.readFileSync = (filePath, encoding) => {
            if (typeof filePath === 'string') {
                const normPath = filePath.replace(/\\/g, '/');
                for (const key of Object.keys(mockFiles)) {
                    if (normPath.endsWith(key)) {
                        return mockFiles[key];
                    }
                }
            }
            return _originalReadFileSync.call(fs, filePath, encoding);
        };
    });

    test.beforeEach(() => {
        graphNodes = [];
        graphEdges = [];
    });

    test.afterAll(() => {
        fs.existsSync = _originalExistsSync;
        fs.promises.readdir = _originalReaddir;
        fs.readdirSync = _originalReaddirSync;
        fs.promises.readFile = _originalReadFile;
        fs.readFileSync = _originalReadFileSync;
        if (StorageRouter) {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
        if (GraphService) {
            GraphService.db = _originalGraphDb;
            GraphService.upsertNode = _originalUpsertNode;
            GraphService.linkNodes = _originalLinkNodes;
        }
    });

    test('ingestIssueStates() maps issues correctly through _index.json', async () => {
        StorageRouter.getGraphCollection = async () => ({
            upsert: async () => {},
            get   : async () => ({ ids: [], metadatas: [], documents: [] }),
            add   : async () => {}
        });

        try {
            // Mock out global StorageRouter if it exists, but the ingestor doesn't throw if null
            // we will just see what comes out as returned open issues
            const result = await IssueIngestor.ingestIssueStates();

            // Verify that open issue was identified
            expect(result.length).toBe(1);
            expect(result[0].issueId).toBe('issue-2001');
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
    });

    test('ingestIssueStates() emits sanitized persisted issue content without raw external URLs (#13703)', async () => {
        const upserts = [];

        StorageRouter.getGraphCollection = async () => ({
            upsert: async payload => upserts.push(payload),
            get   : async () => ({ ids: [], metadatas: [], documents: [] }),
            add   : async () => {}
        });

        try {
            const result       = await IssueIngestor.ingestIssueStates();
            const activeIssue  = result.find(issue => issue.issueId === 'issue-2001');
            const activeUpsert = upserts.find(payload => payload.ids[0] === 'issue-2001');

            expect(activeIssue.body).toContain(QUARANTINED_URL);
            expect(activeIssue.body).not.toContain(RAW_EXTERNAL_URL);
            expect(activeUpsert.documents[0]).toContain(QUARANTINED_URL);
            expect(activeUpsert.documents[0]).not.toContain(RAW_EXTERNAL_URL);
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
    });

    test('ingestDiscussionStates() maps closed frontmatter into graph and vector lifecycle metadata', async () => {
        const upserts = [];

        StorageRouter.getGraphCollection = async () => ({
            upsert: async payload => upserts.push(payload),
            get   : async () => ({ ids: [], metadatas: [], documents: [] })
        });

        try {
            await IssueIngestor.ingestDiscussionStates();
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }

        const openNode   = graphNodes.find(node => node.id === 'discussion-3001');
        const closedNode = graphNodes.find(node => node.id === 'discussion-3002');

        expect(openNode.properties).toMatchObject({
            state                          : 'OPEN',
            closed                         : false,
            closedAt                       : null,
            category                       : 'Ideas',
            routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
            routingDisposition             : 'active',
            routingDispositionReason       : 'explicit-active-marker',
            routingDispositionEvidence     : ['marker:OQ_RESOLUTION_PENDING']
        });
        expect(closedNode.properties).toMatchObject({
            state             : 'CLOSED',
            closed            : true,
            closedAt          : '2026-05-20T12:00:00Z',
            category          : 'Q&A',
            routingDisposition: 'terminal'
        });

        const closedUpsert = upserts.find(payload => payload.ids[0] === 'discussion-3002');
        expect(closedUpsert.metadatas[0]).toMatchObject({
            type                      : 'DISCUSSION',
            state                     : 'CLOSED',
            closed                    : true,
            closedAt                  : '2026-05-20T12:00:00Z',
            category                  : 'Q&A',
            routingDisposition        : 'terminal',
            routingDispositionReason  : 'github-closed',
            routingDispositionEvidence: '["github:closed"]'
        });
    });

    test('ingestDiscussionStates() skips malformed frontmatter without suppressing valid siblings', async () => {
        const priorReaddir  = fs.promises.readdir;
        const priorReadFile = fs.promises.readFile;
        const upserts       = [];

        StorageRouter.getGraphCollection = async () => ({
            upsert: async payload => upserts.push(payload),
            get   : async () => ({ ids: [], metadatas: [], documents: [] })
        });
        fs.promises.readdir = async (dirPath, options) => {
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/discussions')) {
                return [];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/discussions')) {
                return ['discussion-malformed.md', 'discussion-3001.md'];
            }
            return priorReaddir.call(fs.promises, dirPath, options);
        };
        fs.promises.readFile = async (filePath, encoding) => {
            if (typeof filePath === 'string' && filePath.endsWith('discussion-malformed.md')) {
                return '---\ntitle: [unterminated\n---\n# malformed';
            }
            return priorReadFile.call(fs.promises, filePath, encoding);
        };

        try {
            await IssueIngestor.ingestDiscussionStates();
        } finally {
            fs.promises.readdir = priorReaddir;
            fs.promises.readFile = priorReadFile;
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }

        expect(graphNodes.map(node => node.id)).toEqual(['discussion-3001']);
        expect(upserts).toHaveLength(1);
        expect(upserts[0].ids).toEqual(['discussion-3001']);
    });

    test('ingestDiscussionStates() fails loud when graph persistence rejects lifecycle state', async () => {
        const priorUpsertNode = GraphService.upsertNode;

        StorageRouter.getGraphCollection = async () => ({
            upsert: async () => {},
            get   : async () => ({ ids: [], metadatas: [], documents: [] })
        });
        GraphService.upsertNode = () => {
            throw new Error('graph persistence failed');
        };

        try {
            await expect(IssueIngestor.ingestDiscussionStates()).rejects.toThrow('graph persistence failed');
        } finally {
            GraphService.upsertNode = priorUpsertNode;
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
    });

    test('ingestDiscussionStates() fails loud when vector persistence rejects lifecycle state', async () => {
        StorageRouter.getGraphCollection = async () => ({
            upsert: async () => {
                throw new Error('vector persistence failed');
            },
            get: async () => ({ ids: [], metadatas: [], documents: [] })
        });

        try {
            await expect(IssueIngestor.ingestDiscussionStates()).rejects.toThrow('vector persistence failed');
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
    });

    test('ingestDiscussionStates() selects the newly active source over a stale archive duplicate', async () => {
        const priorReaddir  = fs.promises.readdir;
        const priorReadFile = fs.promises.readFile;
        const upserts       = [];
        const staleArchive  = [
            '---',
            'number: 3001',
            'title: Stale Archived Discussion',
            'category: Ideas',
            "createdAt: '2026-05-20T10:00:00Z'",
            "updatedAt: '2026-05-20T10:30:00Z'",
            'closed: true',
            "closedAt: '2026-05-20T10:30:00Z'",
            'routingDispositionSchemaVersion: discussion-routing-disposition.v1',
            'routingDisposition: terminal',
            'routingDispositionReason: github-closed',
            'routingDispositionEvidence:',
            '  - github:closed',
            '---',
            '# Stale Archived Discussion Body'
        ].join('\n');

        StorageRouter.getGraphCollection = async () => ({
            upsert: async payload => upserts.push(payload),
            get   : async () => ({ ids: [], metadatas: [], documents: [] })
        });
        fs.promises.readdir = async (dirPath, options) => {
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/discussions')) {
                return ['v13.1.0/discussion-3001.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/discussions')) {
                return ['discussion-3001.md'];
            }
            return priorReaddir.call(fs.promises, dirPath, options);
        };
        fs.promises.readFile = async (filePath, encoding) => {
            const normalized = typeof filePath === 'string' ? filePath.replace(/\\/g, '/') : '';
            if (normalized.endsWith('resources/content/archive/discussions/v13.1.0/discussion-3001.md')) {
                return staleArchive;
            }
            return priorReadFile.call(fs.promises, filePath, encoding);
        };

        try {
            await IssueIngestor.ingestDiscussionStates();
        } finally {
            fs.promises.readdir = priorReaddir;
            fs.promises.readFile = priorReadFile;
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }

        const discussionNodes = graphNodes.filter(node => node.id === 'discussion-3001');
        expect(discussionNodes).toHaveLength(1);
        expect(discussionNodes[0].properties).toMatchObject({
            state             : 'OPEN',
            closed            : false,
            routingDisposition: 'active'
        });
        expect(upserts).toHaveLength(1);
        expect(upserts[0].metadatas[0]).toMatchObject({
            state : 'OPEN',
            closed: false
        });
    });

    test('normalizes Discussion routing projection as one atomic current-or-legacy tuple', () => {
        const normalize = IssueIngestor.constructor.normalizeDiscussionRoutingProjection;
        const current   = normalize({
            routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
            routingDisposition             : 'terminal',
            routingDispositionReason       : 'graduated-to-ticket',
            routingDispositionEvidence     : ['marker:GRADUATED_TO_TICKET']
        });

        expect(current).toEqual({
            schemaVersion: 'discussion-routing-disposition.v1',
            disposition  : 'terminal',
            reason       : 'graduated-to-ticket',
            evidence     : ['marker:GRADUATED_TO_TICKET']
        });

        for (const malformed of [
            {},
            {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'invalid',
                routingDispositionReason       : 'graduated-to-ticket',
                routingDispositionEvidence     : ['marker:GRADUATED_TO_TICKET']
            },
            {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'terminal',
                routingDispositionReason       : 'graduated-to-ticket',
                routingDispositionEvidence     : '["marker:GRADUATED_TO_TICKET"]'
            },
            {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'terminal',
                routingDispositionReason       : '',
                routingDispositionEvidence     : []
            },
            {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'active',
                routingDispositionReason       : 'github-closed',
                routingDispositionEvidence     : ['marker:GRADUATED_TO_TICKET']
            }
        ]) {
            expect(normalize(malformed)).toEqual({
                schemaVersion: 'discussion-routing-disposition.legacy',
                disposition  : 'undetermined',
                reason       : 'legacy-or-invalid-projection',
                evidence     : []
            })
        }
    });

    test('ingestPullRequestFeedback() creates PR nodes and RESOLVES edges from PR markdown (#12644)', async () => {
        await IssueIngestor.ingestPullRequestFeedback();

        expect(graphNodes.find(node => node.id === 'pr-4001')).toMatchObject({
            id   : 'pr-4001',
            label: 'PULL_REQUEST'
        });

        expect(graphEdges.find(edge =>
            edge.source === 'pr-4001' &&
            edge.target === 'issue-2001' &&
            edge.relationship === 'RESOLVES'
        )).toMatchObject({
            weight    : 1.0,
            properties: {
                justification: 'PR #4001 explicitly resolves Issue #2001.'
            }
        });
    });

    test('ingestPullRequestFeedback() keeps review actions non-routing unless mapped to sanctioned tags (#13967)', async () => {
        await IssueIngestor.ingestPullRequestFeedback();

        const prNode            = graphNodes.find(node => node.id === 'pr-4002');
        const retrospectiveNode = graphNodes.find(node =>
            node.label === 'RETROSPECTIVE' &&
            node.properties.sourcePr === 'pr-4002'
        );

        expect(prNode).toMatchObject({
            id   : 'pr-4002',
            label: 'PULL_REQUEST'
        });
        expect(retrospectiveNode).toMatchObject({
            label     : 'RETROSPECTIVE',
            properties: {
                description: 'Required Actions are useful only when reduced to a concrete durable signal, not as raw review topology.',
                sourcePr   : 'pr-4002'
            }
        });

        expect(graphEdges.filter(edge => edge.source === 'pr-4002')).toEqual([{
            source      : 'pr-4002',
            target      : retrospectiveNode.id,
            relationship: 'EVALUATED_BY',
            weight      : 1.0,
            properties  : {
                justification: 'Gap evaluated during PR #4002 review.'
            }
        }]);
        expect(graphEdges.filter(edge => edge.target === 'pr-4002')).toEqual([{
            source      : retrospectiveNode.id,
            target      : 'pr-4002',
            relationship: 'DISCOVERED_IN',
            weight      : 1.0,
            properties  : {
                justification: 'Extracted from PR #4002 feedback.'
            }
        }]);
        expect(graphNodes.some(node => ['PR_REVIEW', 'REQUIRED_ACTION', 'APPROVAL', 'BLOCKER'].includes(node.label))).toBe(false);
        expect(graphEdges.some(edge => ['BLOCKS', 'APPROVES', 'REQUESTS_CHANGES', 'NEUTRALIZES'].includes(edge.relationship))).toBe(false);
    });

    test('strict projection input reads all three facets from one exact-revision content root (#17627)', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-ingestor-projection-root-'));

        fs.mkdirSync(path.join(root, 'issues'), {recursive: true});
        fs.mkdirSync(path.join(root, 'discussions'), {recursive: true});
        fs.mkdirSync(path.join(root, 'pulls'), {recursive: true});
        fs.writeFileSync(path.join(root, 'issues/issue-9101.md'), [
            '---',
            'id: 9101',
            'title: Projected issue',
            'state: OPEN',
            '---',
            '# Projected issue'
        ].join('\n'));
        fs.writeFileSync(path.join(root, 'discussions/discussion-9102.md'), [
            '---',
            'number: 9102',
            'title: Projected discussion',
            'closed: false',
            '---',
            '# Projected discussion'
        ].join('\n'));
        fs.writeFileSync(path.join(root, 'pulls/pr-9103.md'), [
            '---',
            'number: 9103',
            'title: Projected PR',
            'state: MERGED',
            '---',
            '# Projected PR'
        ].join('\n'));

        StorageRouter.getGraphCollection = async () => ({
            get   : async () => ({ids: [], metadatas: []}),
            upsert: async () => {}
        });

        try {
            const issues = await IssueIngestor.ingestIssueStates({contentRoot: root, strict: true});
            await IssueIngestor.ingestDiscussionStates({contentRoot: root, strict: true});
            await IssueIngestor.ingestPullRequestFeedback({contentRoot: root, strict: true});

            expect(issues.map(item => item.issueId)).toEqual(['issue-9101']);
            expect(graphNodes.map(node => node.id)).toEqual(expect.arrayContaining([
                'issue-9101',
                'discussion-9102',
                'pr-9103'
            ]))
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    test('strict projection input rejects an otherwise-swallowed facet parse failure (#17627)', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-ingestor-projection-invalid-'));

        fs.mkdirSync(path.join(root, 'issues'), {recursive: true});
        fs.writeFileSync(path.join(root, 'issues/issue-broken.md'), '---\ntitle: [unterminated\nstate: OPEN\n---\n# broken');
        StorageRouter.getGraphCollection = async () => ({
            get   : async () => ({ids: [], metadatas: []}),
            upsert: async () => {}
        });

        try {
            await expect(IssueIngestor.ingestIssueStates({contentRoot: root, strict: true}))
                .rejects.toThrow()
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
            fs.rmSync(root, {recursive: true, force: true})
        }
    });
});

/**
 * Community-multiplier internal-author resolution. Replaces the prior hardcoded
 * `meta.author !== 'tobiu'` check with a set derived from the canonical identity registry
 * (`ai/graph/identityRoots.mjs`). The empty-registry case must degrade safely (multiplier OFF),
 * not invert into boosting every ticket.
 */
test.describe('Neo.ai.daemons.services.IssueIngestor — community-multiplier internal-author set', () => {
    let IssueIngestorClass;

    test.beforeAll(async () => {
        // The default export is the singleton instance; the static set + decision live on its class.
        IssueIngestorClass = (await import('../../../../../../ai/services/ingestion/IssueIngestor.mjs')).default.constructor;
    });

    test('internalAuthorLogins is derived from the identity registry as bare logins (no @, no nulls)', () => {
        const logins = IssueIngestorClass.internalAuthorLogins;

        expect(logins).toBeInstanceOf(Set);
        expect(logins.size).toBeGreaterThan(0);
        // Owner + a known agent maintainer, normalized to bare form (matches GitHub issue authors).
        expect(logins.has('tobiu')).toBe(true);
        expect(logins.has('neo-opus-ada')).toBe(true);
        // The leading-@ registry form and null/empty entries must NOT leak through.
        expect(logins.has('@tobiu')).toBe(false);
        expect(logins.has('')).toBe(false);
        expect([...logins].every(Boolean)).toBe(true);
    });

    test('isCommunityAuthor: a registered maintainer is NOT a community author (no boost)', () => {
        expect(IssueIngestorClass.isCommunityAuthor('tobiu')).toBe(false);
        expect(IssueIngestorClass.isCommunityAuthor('neo-opus-ada')).toBe(false);
    });

    test('isCommunityAuthor: an external author IS a community author (boost eligible)', () => {
        expect(IssueIngestorClass.isCommunityAuthor('some-external-contributor')).toBe(true);
    });

    test('isCommunityAuthor: a missing author is never a community author', () => {
        expect(IssueIngestorClass.isCommunityAuthor('')).toBe(false);
        expect(IssueIngestorClass.isCommunityAuthor(undefined)).toBe(false);
        expect(IssueIngestorClass.isCommunityAuthor(null)).toBe(false);
    });

    test('isCommunityAuthor: an empty internal-author registry disables the multiplier (safe degrade, not boost-all)', () => {
        // Negative-mutation guard: with an empty set, even an "external" author must NOT be boosted —
        // the `size > 0` clause is what prevents the inverted every-ticket-boosted failure mode.
        expect(IssueIngestorClass.isCommunityAuthor('some-external-contributor', new Set())).toBe(false);
        expect(IssueIngestorClass.isCommunityAuthor('tobiu', new Set())).toBe(false);
    });
});
