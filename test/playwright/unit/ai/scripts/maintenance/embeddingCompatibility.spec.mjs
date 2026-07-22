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
import AiConfig                 from '../../../../../../ai/config.template.mjs';
import {buildEmbeddingContract} from '../../../../../../ai/scripts/maintenance/backup.mjs';
import {
    assessEmbeddingCompatibility,
    validateBundle,
    validateEmbeddingContractSchema
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

const liveConsumer = () => {
    const provider = AiConfig.embeddingProvider;

    return {
        model: provider === 'ollama' ? AiConfig.ollama.embeddingModel : AiConfig.openAiCompatible.embeddingModel,
        provider
    }
};

function liveMeta({consumer = liveConsumer(), dimension = DIM, kbCount = 1, mcCount = 1, schemaVersion = 1} = {}) {
    const embedding = {
        dimension,
        kb: {count: kbCount},
        mc: {count: mcCount},
        schemaVersion
    };

    if (consumer) embedding.expectedConsumer = consumer;

    return {bundleVersion: 1, embedding}
}

test.describe('embedding compatibility contract (#15691)', () => {
    test.afterAll(() => {
        fs.rmSync(TMP_ROOT, {force: true, recursive: true})
    });

    test('the backup stamps write-time facts (dimension, counts) plus an advisory consumer expectation — never vector provenance', () => {
        const contract = buildEmbeddingContract({subsystems: {kb: 12000, mc: 450}});

        expect(contract.schemaVersion).toBe(1);
        expect(contract.dimension).toBe(AiConfig.vectorDimension);
        expect(contract.expectedConsumer.provider).toBe(AiConfig.embeddingProvider);
        expect(typeof contract.expectedConsumer.model).toBe('string');
        expect(contract.kb).toEqual({count: 12000});
        expect(contract.mc).toEqual({count: 450});
        // No fingerprint, no producer claim: a config snapshot is not write-time vector provenance.
        expect('fingerprint' in contract).toBe(false);
        expect('fingerprint' in contract.kb).toBe(false);
    });

    test('a corrupt FINAL row cannot slip past the line-1 sample era — full streaming catches it', async () => {
        const {bundleRoot, layout} = buildBundle({kbRows: []});

        fs.writeFileSync(path.join(layout.kb, 'kb.jsonl'), [
            JSON.stringify({embedding: vector(), id: 'kb-1', metadata: {}}),
            JSON.stringify({embedding: vector(), id: 'kb-2', metadata: {}}),
            JSON.stringify({embedding: 'not-a-vector', id: 'kb-final-corrupt', metadata: {}})
        ].join('\n') + '\n');

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/vector invariant violation at kb\/kb\.jsonl \(line 3\)/)
    });

    test('wrong-dimension and non-finite vectors fail with the row id and reason', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [{embedding: [0.1, 0.2], id: 'kb-wrong-dim', metadata: {}}]
        });

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/wrong-dimension.*kb-wrong-dim/);

        const second = buildBundle({
            kbRows: [{embedding: [...vector(), NaN], id: 'kb-nonfinite', metadata: {}}]
        });

        await expect(validateBundle(second.bundleRoot, second.layout, SILENT, DIM)).rejects.toThrow(/non-finite|wrong-dimension/)
    });

    test('a vector row without a non-empty string id fails as missing-id', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [{embedding: vector(), metadata: {}}]
        });

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/missing-id/)
    });

    test('the declared schema, dimension, and counts are hard gates bound to the bundle\'s own evidence', async () => {
        // Unsupported schema version
        let bundle = buildBundle({meta: liveMeta({schemaVersion: 2})});
        await expect(validateBundle(bundle.bundleRoot, bundle.layout, SILENT, DIM)).rejects.toThrow(/unsupported-schema-version/);

        // Declared dimension contradicts the destination's expectation
        bundle = buildBundle({meta: liveMeta({dimension: 768})});
        await expect(validateBundle(bundle.bundleRoot, bundle.layout, SILENT, DIM)).rejects.toThrow(/dimension-contract-mismatch/);

        // Declared count contradicts the streamed row total
        bundle = buildBundle({meta: liveMeta({kbCount: 5})});
        await expect(validateBundle(bundle.bundleRoot, bundle.layout, SILENT, DIM)).rejects.toThrow(/count-contract-mismatch.*declares 5.*streams 1/);

        // Malformed per-collection block
        bundle = buildBundle({meta: liveMeta({kbCount: -1})});
        await expect(validateBundle(bundle.bundleRoot, bundle.layout, SILENT, DIM)).rejects.toThrow(/invalid-embedding-schema/);
    });

    test('a consumer-expectation mismatch is an advisory classification, never a hard refusal', async () => {
        const {bundleRoot, layout} = buildBundle({
            meta: liveMeta({consumer: {model: 'other-model', provider: 'other-provider'}})
        });
        const warnings = [];

        const meta = await validateBundle(bundleRoot, layout, {log: () => {}, warn: message => warnings.push(message)}, DIM);

        expect(meta.embeddingAdvisories).toHaveLength(1);
        expect(meta.embeddingAdvisories[0].reason).toBe('consumer-expectation-mismatch');
        expect(meta.embeddingAdvisories[0].bundle).toEqual({model: 'other-model', provider: 'other-provider'});
        expect(warnings.some(message => message.includes('consumer-expectation-mismatch'))).toBe(true);
    });

    test('an embedding block without expectedConsumer classifies provenance as unverified, not as a failure', () => {
        const meta       = liveMeta({consumer: null});
        const advisories = assessEmbeddingCompatibility({
            expectedDimension: DIM,
            logger           : SILENT,
            meta
        });

        expect(advisories).toHaveLength(1);
        expect(advisories[0].reason).toBe('semantic-provenance-unverified');
    });

    test('a compatible bundle passes admission with zero embedding-provider contact and no advisories', async () => {
        const {bundleRoot, layout} = buildBundle({meta: liveMeta()});
        const meta                 = await validateBundle(bundleRoot, layout, SILENT, DIM);

        expect(meta.embeddingAdvisories).toEqual([]);
        expect(meta.embedding.dimension).toBe(DIM);
    });

    test('legacy bundle (no embedding contract) validates rows against the live expected dimension and proceeds', async () => {
        const {bundleRoot, layout} = buildBundle({meta: {bundleVersion: 1}});
        const warnings             = [];
        const meta                 = await validateBundle(bundleRoot, layout, {log: () => {}, warn: message => warnings.push(message)}, DIM);

        expect(meta.bundleVersion).toBe(1);
        expect(warnings.some(message => message.includes('semantic-provenance-unverified'))).toBe(true);
    });

    test('a matching legacy-shape row set with wrong dimension still fails — the fallback is not a bypass', async () => {
        const {bundleRoot, layout} = buildBundle({
            kbRows: [{embedding: [1, 2, 3], id: 'kb-legacy-wrong', metadata: {}}],
            meta  : {bundleVersion: 1}
        });

        await expect(validateBundle(bundleRoot, layout, SILENT, DIM)).rejects.toThrow(/wrong-dimension/)
    });
});
