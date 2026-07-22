import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'EmbeddingCompatTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import fs                       from 'node:fs';
import os                       from 'node:os';
import path                     from 'node:path';
import AiConfig                 from '../../../../../../ai/config.mjs';
import {buildEmbeddingContract} from '../../../../../../ai/scripts/maintenance/backup.mjs';
import {
    assertEmbeddingCompatibility,
    validateBundle
} from '../../../../../../ai/scripts/maintenance/restore.mjs';

const
    SILENT   = {log: () => {}, warn: () => {}, error: () => {}},
    TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-embedding-compat-')),
    DIM      = 4096;

function vector(value = 0.1) {
    return new Array(DIM).fill(value)
}

function buildBundle({subdirs = ['kb', 'mc', 'graph', 'concepts', 'trajectories', 'mailbox'], meta = null, kbRows = null, mcRows = null} = {}) {
    const bundleRoot = path.join(TMP_ROOT, `bundle-${Math.random().toString(36).slice(2, 8)}`);
    const layout     = {};

    for (const sub of subdirs) {
        fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        layout[sub] = path.join(bundleRoot, sub)
    }

    if (layout.kb) fs.writeFileSync(path.join(layout.kb, 'kb.jsonl'),
        (kbRows ?? [{embedding: vector(), id: 'kb-1', metadata: {k: 'cls'}}]).map(r => JSON.stringify(r)).join('\n') + '\n');
    if (layout.mc) fs.writeFileSync(path.join(layout.mc, 'mc.jsonl'),
        (mcRows ?? [{embedding: vector(), id: 'm-1', metadata: {t: 'prompt'}}]).map(r => JSON.stringify(r)).join('\n') + '\n');
    if (layout.graph) fs.writeFileSync(path.join(layout.graph, 'graph.jsonl'), '{"type":"node","data":{"id":"n-1"}}\n');
    if (layout.concepts) fs.writeFileSync(path.join(layout.concepts, 'nodes.jsonl'), '{"id":"c-1"}\n');
    if (layout.trajectories) fs.writeFileSync(path.join(layout.trajectories, 'trajectories.jsonl'), '{"id":"t-1"}\n');
    if (layout.mailbox) fs.writeFileSync(path.join(layout.mailbox, 'sent-to-cull.jsonl'), '{"id":"x-1"}\n');

    if (meta) fs.writeFileSync(path.join(bundleRoot, 'bundle-meta.json'), JSON.stringify(meta, null, 2));

    return {bundleRoot, layout}
}

function liveMeta(fingerprint) {
    return {
        bundleVersion: 1,
        embedding    : {
            kb: {count: 1, dimension: DIM, fingerprint, model: 'm', provider: 'p', schemaVersion: 1},
            mc: {count: 1, dimension: DIM, fingerprint, model: 'm', provider: 'p', schemaVersion: 1}
        }
    }
}

const expectedFingerprint = () => {
    const provider = AiConfig.embeddingProvider;
    const model    = provider === 'ollama' ? AiConfig.ollama.embeddingModel : AiConfig.openAiCompatible.embeddingModel;

    return `${provider}:${model}:${DIM}`
};

test.describe('embedding compatibility contract (#15691)', () => {
    test.afterAll(() => {
        fs.rmSync(TMP_ROOT, {force: true, recursive: true})
    });

    test('the backup declares a versioned per-collection embedding contract with counts and fingerprint', () => {
        const contract = buildEmbeddingContract({subsystems: {kb: 12000, mc: 450}});

        for (const collection of ['kb', 'mc']) {
            expect(contract[collection].schemaVersion).toBe(1);
            expect(contract[collection].dimension).toBe(DIM);
            expect(contract[collection].provider).toBe(AiConfig.embeddingProvider);
            expect(typeof contract[collection].model).toBe('string');
            expect(contract[collection].fingerprint).toBe(expectedFingerprint());
        }
        expect(contract.kb.count).toBe(12000);
        expect(contract.mc.count).toBe(450);
    });

    test('a corrupt FINAL row cannot slip past the line-1 sample era — full streaming catches it', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [
                {embedding: vector(), id: 'kb-1', metadata: {}},
                {embedding: vector(), id: 'kb-2', metadata: {}},
                {embedding: vector(), id: 'kb-final-corrupt', metadata: {}, note: 'not-an-array'}
            ],
            meta: liveMeta(expectedFingerprint())
        });

        // The final row's embedding is deliberately not an array — but JSON.parse still needs a valid
        // vector, so place it as a string field that classifyRowVector rejects.
        fs.writeFileSync(path.join(layout.kb, 'kb.jsonl'), [
            JSON.stringify({embedding: vector(), id: 'kb-1', metadata: {}}),
            JSON.stringify({embedding: vector(), id: 'kb-2', metadata: {}}),
            JSON.stringify({embedding: 'not-a-vector', id: 'kb-final-corrupt', metadata: {}})
        ].join('\n') + '\n');

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/vector invariant violation at kb\/kb\.jsonl \(line 3\)/)
    });

    test('wrong-dimension and non-finite vectors fail with the row id and reason', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [{embedding: [0.1, 0.2], id: 'kb-wrong-dim', metadata: {}}],
            meta  : liveMeta(expectedFingerprint())
        });

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/wrong-dimension.*kb-wrong-dim/);

        const second = buildBundle({
            kbRows: [{embedding: [...vector(), NaN], id: 'kb-nonfinite', metadata: {}}],
            meta  : liveMeta(expectedFingerprint())
        });

        await expect(validateBundle(second.bundleRoot, second.layout, SILENT, DIM)).rejects.toThrow(/non-finite|wrong-dimension/)
    });

    test('a fingerprint mismatch fails BEFORE any mutation with the declared vs expected receipt', () => {
        expect(() => assertEmbeddingCompatibility({
            bundleRoot       : '/x',
            expectedDimension: DIM,
            logger           : SILENT,
            meta             : liveMeta('other-provider:other-model:768')
        })).toThrow(/Embedding-space incompatibility at kb: bundle declares 'other-provider:other-model:768' but the destination expects/)
    });

    test('a compatible bundle passes admission with zero embedding-provider contact', async () => {
        const {bundleRoot, layout} = buildBundle({meta: liveMeta(expectedFingerprint())});
        const meta                 = await validateBundle(bundleRoot, layout, SILENT, DIM);

        expect(meta.embedding.kb.fingerprint).toBe(expectedFingerprint());
        expect(meta.embedding.mc.fingerprint).toBe(expectedFingerprint());
    });

    test('legacy bundle (no embedding contract) validates rows against the live expected dimension and proceeds', async () => {
        const {bundleRoot, layout} = buildBundle({meta: {bundleVersion: 1}});
        const warnings             = [];
        const meta                 = await validateBundle(bundleRoot, layout, {log: () => {}, warn: message => warnings.push(message)}, DIM);

        expect(meta.bundleVersion).toBe(1);
        expect(warnings.some(message => message.includes('no declared embedding contract'))).toBe(true);
    });

    test('a matching legacy-shape row set with wrong dimension still fails — the fallback is not a bypass', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [{embedding: [1, 2, 3], id: 'kb-legacy-wrong', metadata: {}}],
            meta  : {bundleVersion: 1}
        });

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/wrong-dimension/)
    });
});
