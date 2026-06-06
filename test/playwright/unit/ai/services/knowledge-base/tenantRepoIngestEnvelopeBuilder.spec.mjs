import {test, expect} from '@playwright/test';

import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {execFile}     from 'child_process';
import {promisify}    from 'util';

import {cloneIfMissing, fetch, resolveHead}
                       from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';
import TenantRepoIngestEnvelopeBuilder, {
    buildIngestEnvelope
} from '../../../../../../ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Contract tests for the tenant GitMirror to KB ingest envelope adapter (#11789).
 *
 * The builder emits the live `KnowledgeBaseIngestionService.ingestSourceFiles()`
 * payload shape: `files`, `deleted`, `manifestSnapshot`, `baseRevision`, and
 * `headRevision`. Tests use local Git repositories only; no tenant credentials or
 * external network access are required.
 *
 * @see https://github.com/neomjs/neo/issues/11789
 * @see ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs
 * @see ai/services/knowledge-base/KnowledgeBaseIngestionService.mjs
 */

test.describe('TenantRepoIngestEnvelopeBuilder (#11789)', () => {
    let root;

    test.beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-ingest-envelope-test-'));
    });

    test.afterEach(async () => {
        await fs.remove(root);
    });

    async function git(args, cwd) {
        const {stdout} = await execFileAsync('git', args, {cwd});
        return stdout.trim();
    }

    async function createSourceRepo() {
        const source = path.join(root, 'source');

        await fs.ensureDir(source);
        await git(['init', '--initial-branch=main'], source);
        await fs.ensureDir(path.join(source, 'docs'));
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v1\n');
        await fs.writeFile(path.join(source, 'docs', 'guide.md'), '# Guide\n');
        await fs.writeFile(path.join(source, 'remove-me.txt'), 'remove me\n');
        await git(['add', '.'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], source);

        return source;
    }

    async function commitSecondRevision(source) {
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v2\n');
        await fs.writeFile(path.join(source, 'beta.txt'), 'beta\n');
        await fs.remove(path.join(source, 'remove-me.txt'));
        await git(['add', '-A'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second'], source);
    }

    async function createMirror(source) {
        const options = {
            cloneUrl  : source,
            mirrorRoot: path.join(root, 'mirrors'),
            repoSlug  : 'local/source',
            tenantId  : 'tenant-a'
        };

        await cloneIfMissing(options);

        return options;
    }

    test('builds a manifest-carrying full envelope when no baseline exists', async () => {
        const source  = await createSourceRepo();
        const options = await createMirror(source);
        const newHead = await resolveHead({...options, ref: 'main'});
        const envelope = await buildIngestEnvelope({
            ...options,
            newHead,
            rootKind: 'bare-repo'
        });

        expect(envelope).toMatchObject({
            tenantId    : 'tenant-a',
            repoSlug    : 'local/source',
            headRevision: newHead,
            manifestSnapshot: {
                repoSlug      : 'local/source',
                pathsAfterPush: ['alpha.txt', 'docs/guide.md', 'remove-me.txt']
            }
        });
        expect(envelope.baseRevision).toBeUndefined();
        expect(envelope.deleted).toBeUndefined();
        expect(envelope.files.map(file => file.sourcePath)).toEqual(['alpha.txt', 'docs/guide.md', 'remove-me.txt']);
        expect(envelope.files.find(file => file.sourcePath === 'docs/guide.md')).toMatchObject({
            repoSlug: 'local/source',
            rootKind: 'bare-repo',
            content: '# Guide\n'
        });
    });

    test('builds a bounded delta envelope for linear history advances', async () => {
        const source  = await createSourceRepo();
        const options = await createMirror(source);
        const baseRevision = await resolveHead({...options, ref: 'main'});

        await commitSecondRevision(source);
        await fetch(options);

        const headRevision = await resolveHead({...options, ref: 'main'});
        const envelope     = await TenantRepoIngestEnvelopeBuilder.buildIngestEnvelope({
            ...options,
            lastIngestedRev: baseRevision,
            newHead        : headRevision,
            parserId       : 'raw-text',
            parserVersion  : 'test-parser-v1'
        });

        expect(envelope).toMatchObject({
            tenantId    : 'tenant-a',
            repoSlug    : 'local/source',
            baseRevision,
            headRevision,
            deleted: [{sourcePath: 'remove-me.txt', repoSlug: 'local/source'}]
        });
        expect(envelope.manifestSnapshot).toBeUndefined();
        expect(envelope.files.map(file => [file.sourcePath, file.content])).toEqual([
            ['alpha.txt', 'alpha v2\n'],
            ['beta.txt', 'beta\n']
        ]);
        expect(envelope.files[0]).toMatchObject({
            parserId     : 'raw-text',
            parserVersion: 'test-parser-v1'
        });
    });

    test('falls back to a full manifest snapshot when history is non-linear', async () => {
        const source  = await createSourceRepo();
        const options = await createMirror(source);
        const baseRevision = await resolveHead({...options, ref: 'main'});

        await commitSecondRevision(source);
        await fetch(options);

        const headRevision = await resolveHead({...options, ref: 'main'});
        const envelope     = await buildIngestEnvelope({
            ...options,
            lastIngestedRev: headRevision,
            newHead        : baseRevision
        });

        expect(envelope.baseRevision).toBeUndefined();
        expect(envelope.deleted).toBeUndefined();
        expect(envelope.manifestSnapshot).toEqual({
            repoSlug      : 'local/source',
            pathsAfterPush: ['alpha.txt', 'docs/guide.md', 'remove-me.txt']
        });
        expect(envelope.files.map(file => file.sourcePath)).toEqual(['alpha.txt', 'docs/guide.md', 'remove-me.txt']);
    });

    test('throws stable errors for missing mirrors and missing head refs', async () => {
        const source  = await createSourceRepo();
        const options = await createMirror(source);

        await expect(buildIngestEnvelope({
            ...options,
            tenantId: '../bad',
            newHead : 'main'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_MIRROR_PATH_INVALID'});
        await expect(buildIngestEnvelope({
            ...options,
            repoSlug: 'local/missing',
            newHead : 'main'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_MIRROR_MISSING'});
        await expect(buildIngestEnvelope({
            ...options,
            newHead: 'missing-ref'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_REF_NOT_FOUND'});
    });
});
