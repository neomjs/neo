import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {buildChunkRowMetadata} from '../../../../../../ai/services/knowledge-base/helpers/chunkRowMetadata.mjs';
import {
    EMBEDDING_INPUT_FORMAT_ID,
    EMBEDDING_INPUT_FORMAT_METADATA_KEY
} from '../../../../../../ai/services/knowledge-base/helpers/embeddingInputFormat.mjs';
import {planStaleEmbeddingRepair} from '../../../../../../ai/services/knowledge-base/helpers/staleEmbeddingRepair.mjs';
import {
    parseArgs,
    repairBatch,
    repairTargets,
    scanCollection
} from '../../../../../../ai/scripts/migrations/repairStaleEmbeddings.mjs';

/**
 * The observable is a row's VECTOR changing, never an id or a generation hash changing.
 *
 * That distinction is the whole reason this ticket exists separately from its detector half: a
 * hash-difference assertion is what let a docblock read as a wired mechanism, and the falsifier that
 * actually discriminates is *"does a present, stale row get a new vector — and does its marker land
 * in the same write?"*. A fake collection is used rather than a live daemon because the property is
 * about what the runner ASKS the store to do; the paging shape it asks through is exercised too.
 */

/**
 * A minimal Chroma stand-in that records what it was asked to write.
 *
 * `get` honours `limit`/`offset` so the page walk is genuinely exercised — a fake that returned
 * everything in one page would let an off-by-one in the loop pass.
 */
function createFakeCollection(rows) {
    const store = new Map(rows.map(row => [row.id, {...row}]));

    return {
        store,
        upsertCalls: [],
        async get({limit, offset = 0, include}) {
            const page = [...store.values()].slice(offset, offset + limit);

            return {
                ids      : page.map(row => row.id),
                metadatas: include?.includes('metadatas') ? page.map(row => row.metadata) : undefined
            }
        },
        async upsert({ids, embeddings, metadatas}) {
            this.upsertCalls.push({ids, embeddings, metadatas});

            ids.forEach((id, index) => {
                store.set(id, {id, embedding: embeddings[index], metadata: metadatas[index]})
            })
        }
    }
}

const staleRow = (id, embedding = [0, 0, 0]) => ({
    id,
    embedding,
    // No marker: this is the pre-marker population, the rows written before the stamp existed.
    metadata: {tenantId: 'tenant-a', kind: 'method', name: id, content: `body of ${id}`}
});

const currentRow = id => ({
    id,
    embedding: [9, 9, 9],
    metadata : {...buildChunkRowMetadata({kind: 'method', name: id, content: `body of ${id}`}), tenantId: 'tenant-a'}
});

const fakeEmbed = texts => texts.map((text, index) => [1, index, text.length]);

test.describe('repairStaleEmbeddings — a stale row actually gets a new vector', () => {
    test('RED-PROOF: the stored vector CHANGES, and it is not merely a re-stamp', async () => {
        const collection = createFakeCollection([staleRow('a'), staleRow('b')]),
              before     = collection.store.get('a').embedding;

        const {rows}                 = await scanCollection(collection, null),
              plan                   = planStaleEmbeddingRepair({rows}),
              metadataById           = new Map(rows.map(row => [row.id, row.metadata])),
              {repairedIds, failure} = await repairTargets({
                  collection, targets: plan.targets, metadataById, embed: fakeEmbed
              });

        expect(failure).toBeNull();
        expect(repairedIds.sort()).toEqual(['a', 'b']);

        const after = collection.store.get('a').embedding;

        expect(after, 'the row holds a different vector than before the run').not.toEqual(before);
        expect(after).toEqual([1, 0, `${'method: a in \nbody of a'}`.length])
    });

    test('the vector and the marker land in ONE write, never as two', async () => {
        // A row carrying a current marker over an old vector is undetectable by construction — it is
        // invisible to every future census — so this asserts the single-call property directly
        // rather than only its outcome.
        const collection = createFakeCollection([staleRow('a')]),
              {rows}     = await scanCollection(collection, null);

        await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows}).targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        expect(collection.upsertCalls).toHaveLength(1);

        const call = collection.upsertCalls[0];

        expect(call.ids).toEqual(['a']);
        expect(call.embeddings).toHaveLength(1);
        expect(call.metadatas[0][EMBEDDING_INPUT_FORMAT_METADATA_KEY]).toBe(EMBEDDING_INPUT_FORMAT_ID)
    });

    test('the row keeps its stored metadata — a repair must not become data loss', async () => {
        // Rebuilding metadata from the reconstructed chunk would carry only the fields the
        // provider-input format reads, dropping `tenantId` and with it the row's tenant scoping.
        const collection = createFakeCollection([staleRow('a')]),
              {rows}     = await scanCollection(collection, null);

        await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows}).targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        const metadata = collection.store.get('a').metadata;

        expect(metadata.tenantId).toBe('tenant-a');
        expect(metadata.content).toBe('body of a');
        expect(metadata[EMBEDDING_INPUT_FORMAT_METADATA_KEY]).toBe(EMBEDDING_INPUT_FORMAT_ID)
    });

    test('IDEMPOTENCE end to end: a second run over the repaired store writes nothing', async () => {
        const collection = createFakeCollection([staleRow('a')]),
              first      = await scanCollection(collection, null);

        await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows: first.rows}).targets,
            metadataById: new Map(first.rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        const callsAfterFirst = collection.upsertCalls.length,
              second          = await scanCollection(collection, null),
              secondPlan      = planStaleEmbeddingRepair({rows: second.rows});

        expect(secondPlan.selectedCount, 'the repaired row is not re-selected').toBe(0);
        expect(second.census.staleCount).toBe(0);

        await repairTargets({
            collection,
            targets     : secondPlan.targets,
            metadataById: new Map(second.rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        expect(collection.upsertCalls.length, 'no second write').toBe(callsAfterFirst)
    });

    test('POSITIVE CONTROL: an already-current row is untouched, and the fixture can still select', async () => {
        // Without this, the idempotence arm would pass against a runner that repairs nothing at all.
        const collection     = createFakeCollection([currentRow('done'), staleRow('todo')]),
              {rows, census} = await scanCollection(collection, null),
              plan           = planStaleEmbeddingRepair({rows});

        expect(census.currentCount).toBe(1);
        expect(plan.targets.map(t => t.id)).toEqual(['todo'])
    });

    test('the before/after counts come from the SAME instrument', async () => {
        const collection = createFakeCollection([staleRow('a'), staleRow('b'), currentRow('c')]),
              before     = await scanCollection(collection, null);

        expect(before.census.staleCount).toBe(2);

        await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows: before.rows}).targets,
            metadataById: new Map(before.rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        const after = await scanCollection(collection, null);

        expect(after.census.staleCount).toBe(0);
        expect(after.census.currentCount).toBe(3);
        expect(after.census.scannedCount).toBe(before.census.scannedCount)
    })
});

test.describe('repairStaleEmbeddings — a partial run is never reported as a complete one', () => {
    test('a failing batch stops the run and returns the remainder with its ids', async () => {
        const collection = createFakeCollection(
            Array.from({length: 5}, (_, index) => staleRow(`row-${index}`))
        );

        const {rows} = await scanCollection(collection, null);

        let calls = 0;

        const {repairedIds, remainingIds, failure} = await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows}).targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            batchSize   : 2,
            embed       : texts => {
                calls++;
                if (calls === 2) throw new Error('provider unavailable');
                return fakeEmbed(texts)
            }
        });

        expect(repairedIds).toEqual(['row-0', 'row-1']);
        expect(remainingIds).toEqual(['row-2', 'row-3', 'row-4']);
        expect(failure.message).toBe('provider unavailable');

        // The rows after the failure keep their original vectors rather than a half-written state.
        expect(collection.store.get('row-4').embedding).toEqual([0, 0, 0])
    });

    test('a provider returning the wrong count REFUSES rather than zipping by index', async () => {
        // Pairing vectors with the wrong rows and stamping every one current is silent corruption,
        // which is worse than a failed run.
        const collection = createFakeCollection([staleRow('a'), staleRow('b')]),
              {rows}     = await scanCollection(collection, null);

        let error;

        try {
            await repairBatch({
                collection,
                targets     : planStaleEmbeddingRepair({rows}).targets,
                metadataById: new Map(rows.map(row => [row.id, row.metadata])),
                embed       : () => [[1, 2, 3]]
            })
        } catch (caught) {
            error = caught
        }

        expect(error?.message).toContain('1 embedding(s) for 2 input(s)');
        expect(collection.upsertCalls, 'nothing was written').toHaveLength(0)
    });

    test('a cooperative YIELD stops at a batch boundary and returns the remainder', async () => {
        // The lease vote is consulted between batches, never inside one: a batch is a single upsert
        // carrying vectors and markers together, so yielding between them leaves no half-written row.
        const collection = createFakeCollection(
            Array.from({length: 6}, (_, index) => staleRow(`row-${index}`))
        );

        const {rows} = await scanCollection(collection, null);

        let batches = 0;

        const {repairedIds, remainingIds, yielded, failure} = await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows}).targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            batchSize   : 2,
            embed       : texts => { batches++; return fakeEmbed(texts) },
            // Vote to yield once the first batch has landed.
            shouldYield : () => batches >= 1
        });

        expect(yielded, 'a yielded run is partial, and says so').toBe(true);
        expect(failure).toBeNull();
        expect(repairedIds).toEqual(['row-0', 'row-1']);
        expect(remainingIds).toEqual(['row-2', 'row-3', 'row-4', 'row-5']);

        // The rows it did repair are whole: vector AND marker, never one without the other.
        expect(collection.store.get('row-0').metadata[EMBEDDING_INPUT_FORMAT_METADATA_KEY]).toBe(EMBEDDING_INPUT_FORMAT_ID);
        expect(collection.store.get('row-2').embedding, 'untouched rows keep their old vector').toEqual([0, 0, 0])
    });

    test('the yield vote is never consulted mid-batch, so no batch is split', async () => {
        const collection = createFakeCollection(
            Array.from({length: 4}, (_, index) => staleRow(`row-${index}`))
        );

        const {rows} = await scanCollection(collection, null);

        const {repairedIds} = await repairTargets({
            collection,
            targets     : planStaleEmbeddingRepair({rows}).targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            batchSize   : 4,
            embed       : fakeEmbed,
            // Always voting to yield must still not interrupt the first batch.
            shouldYield : () => true
        });

        expect(repairedIds, 'the first batch runs whole before any yield can apply').toHaveLength(4)
    });

    test('ZERO-TARGET RESIDUE: nothing selected but stale rows unreconstructable is NOT a clean sweep', async () => {
        // The disposition this defends: `selectedCount === 0` alongside a non-empty `emptyInputIds`
        // is an UNREPAIRED residue. Reading it as "nothing to repair" would report a clean corpus
        // while stale rows no re-run can reach stay queryable and stay stale.
        const collection     = createFakeCollection([{id: 'empty', embedding: [0, 0, 0], metadata: {tenantId: 'tenant-a'}}]),
              {rows, census} = await scanCollection(collection, null),
              plan           = planStaleEmbeddingRepair({rows});

        expect(census.staleCount, 'the row IS stale — it carries no current marker').toBe(1);
        expect(plan.selectedCount).toBe(0);
        expect(plan.emptyInputIds).toEqual(['empty']);

        // Both halves decide the terminal disposition, which is why they are asserted together:
        // selection alone would say "done", the census alone would say "dirty".
        expect(plan.selectedCount === 0 && plan.emptyInputIds.length > 0).toBe(true)
    });

    test('MIXED: a run that repairs some AND cannot reconstruct others leaves the residue stale', async () => {
        const collection = createFakeCollection([
            staleRow('fixable'),
            {id: 'empty', embedding: [0, 0, 0], metadata: {tenantId: 'tenant-a'}}
        ]);

        const {rows} = await scanCollection(collection, null),
              plan   = planStaleEmbeddingRepair({rows});

        expect(plan.targets.map(target => target.id)).toEqual(['fixable']);
        expect(plan.emptyInputIds).toEqual(['empty']);

        await repairTargets({
            collection,
            targets     : plan.targets,
            metadataById: new Map(rows.map(row => [row.id, row.metadata])),
            embed       : fakeEmbed
        });

        // The repaired row is current; the unreconstructable one is still stale, so the after-census
        // is non-zero and a success disposition would contradict the instrument.
        const after = await scanCollection(collection, null);

        expect(after.census.staleCount, 'residue survives into the after-census').toBe(1);
        expect(after.census.currentCount).toBe(1)
    });

    test('a limit leaves a reported remainder rather than a short run reading as done', async () => {
        const collection = createFakeCollection([staleRow('a'), staleRow('b'), staleRow('c')]),
              {rows}     = await scanCollection(collection, null),
              plan       = planStaleEmbeddingRepair({rows, limit: 2});

        expect(plan.selectedCount).toBe(2);
        expect(plan.limitReached).toBe(true)
    })
});

test.describe('repairStaleEmbeddings — dry-run is the default and the flags refuse typos', () => {
    test('apply is OFF unless asked for', () => {
        expect(parseArgs([]).apply).toBe(false);
        expect(parseArgs(['--tenant', 'a']).apply).toBe(false);
        expect(parseArgs(['--apply']).apply).toBe(true)
    });

    test('a mistyped flag refuses rather than widening the run', () => {
        // A silently-ignored `--tenat` would spend provider compute across every tenant.
        expect(() => parseArgs(['--tenat', 'a'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['--tenant'])).toThrow(/non-empty value/);
        expect(() => parseArgs(['--limit', '0'])).toThrow(/positive integer/);
        expect(() => parseArgs(['--limit', 'x'])).toThrow(/positive integer/);
        expect(() => parseArgs(['--batch', '-1'])).toThrow(/positive integer/)
    });

    test('defaults are the safe ones', () => {
        const options = parseArgs([]);

        expect(options.tenant).toBeNull();
        expect(options.limit).toBe(Infinity);
        expect(options.batchSize).toBeGreaterThan(0)
    })
});

test.describe('a poison-generation bump repairs NOTHING — the corrected finding, pinned', () => {
    /**
     * An intuitive reading of the poison-generation machinery is that bumping the strategy family
     * would re-embed the affected rows. It does not: that value scopes poison/suppression evidence
     * only. The correction is pinned here as behaviour so the next reader cannot re-derive the wrong
     * version from the docblock, which is exactly how it was mis-read the first time.
     */
    test('selection is unmoved by poison-generation metadata on the row', async () => {
        const withPoison = {
            id      : 'a',
            metadata: {
                tenantId: 'tenant-a', kind: 'method', name: 'a', content: 'body of a',
                // Present, and deliberately unlike whatever the current family is.
                kbEmbeddingPoisonGeneration          : 'kb-embedding-input-v99:band-unresolved',
                [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID
            }
        };

        // Carries the CURRENT format marker, so it is current regardless of any poison value.
        expect(planStaleEmbeddingRepair({rows: [withPoison]}).selectedCount).toBe(0);

        // POSITIVE CONTROL: the same row selects the moment the FORMAT marker is what changes, which
        // proves the arm above is not passing because the fixture can never select.
        const formatChanged = {
            ...withPoison,
            metadata: {...withPoison.metadata, [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: 'kb-embed-input-v1-older'}
        };

        expect(planStaleEmbeddingRepair({rows: [formatChanged]}).selectedCount).toBe(1)
    });

    test('the repair path does not READ the poison family — a bump cannot reach it', async () => {
        const fs   = await import('node:fs'),
              path = await import('node:path'),
              read = relative => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

        const sources = [
            'ai/services/knowledge-base/helpers/staleEmbeddingCensus.mjs',
            'ai/services/knowledge-base/helpers/staleEmbeddingRepair.mjs',
            'ai/scripts/migrations/repairStaleEmbeddings.mjs'
        ].map(relative => ({relative, text: read(relative)}));

        for (const {relative, text} of sources) {
            // The runner's module docblock NAMES the poison family to record that it is not the
            // mechanism, so code lines are checked rather than the whole file.
            const codeLines = text.split('\n').filter(line => {
                const trimmed = line.trim();
                return trimmed !== '' && !trimmed.startsWith('*') && !trimmed.startsWith('/*') && !trimmed.startsWith('//')
            });

            expect(codeLines.join('\n'), relative).not.toContain('PoisonGeneration');
            expect(codeLines.join('\n'), relative).not.toContain('POISON_STRATEGY_FAMILY')
        }

        // POSITIVE CONTROL for the scan itself: it really is reading these files, and it really does
        // find the marker they DO depend on. Without this the assertions above pass on empty strings.
        expect(sources.map(source => source.text).join('\n')).toContain('EMBEDDING_INPUT_FORMAT');
        expect(sources.every(source => source.text.length > 500)).toBe(true)
    })
});

test.describe('repairStaleEmbeddings — the page walk is exercised, not assumed', () => {
    test('a corpus larger than one page is fully scanned', async () => {
        // The fake honours limit/offset, so an off-by-one in the walk would surface as a short count.
        const collection = createFakeCollection(
            Array.from({length: 4500}, (_, index) => staleRow(`row-${index}`))
        );

        const {census, rows} = await scanCollection(collection, null);

        expect(census.scannedCount).toBe(4500);
        expect(rows).toHaveLength(4500);
        expect(census.staleCount).toBe(4500)
    })
});

/**
 * Production-bound wiring evidence for the heavy-maintenance contracts, mirroring the source-inspection
 * arms the other manual heavy scripts carry (`syncGithubWorkflow.spec.mjs`, `offHostSync.spec.mjs`).
 *
 * These live at the source level deliberately. The lease acquisition, owner, resolved leaves and the
 * recorder handoff all sit inside the guarded `main()`, which is not exported — importing this module
 * runs nothing, which is the property that keeps the unit specs above provider-free. The `shouldYield`
 * arms prove `repairTargets` HONOURS a vote; only these prove `main()` actually supplies one, and that
 * distinction is what a reviewer caught: the runtime wiring existed with no assertion reaching it.
 */
test.describe('repairStaleEmbeddings — heavy-maintenance wiring is present in the shipped script', () => {
    const scriptPath = new URL(
        '../../../../../../ai/scripts/migrations/repairStaleEmbeddings.mjs', import.meta.url
    ).pathname;

    /** @returns {Promise<String>} The shipped script's source. */
    const readScript = async () => (await import('node:fs/promises')).readFile(scriptPath, 'utf8');

    test('the apply path acquires the lease, owns it by name, and resolves its leaves at the use site', async () => {
        const source = await readScript();

        const
            leaseIndex    = source.indexOf('await withHeavyMaintenanceLease('),
            ownerIndex    = source.indexOf("owner       : 'kbStaleEmbeddingRepair'"),
            leasePathIdx  = source.indexOf('resolveHeavyMaintenanceLeasePath({dataDir: aiConfig.orchestrator.dataDir})'),
            staleAfterIdx = source.indexOf('aiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs'),
            applyGate     = source.indexOf("if (!options.apply) {");

        expect(leaseIndex,    'the lease call must exist').toBeGreaterThan(-1);
        expect(ownerIndex,    'the run must own the lease under its own name, not a borrowed one').toBeGreaterThan(-1);
        expect(leasePathIdx,  'the lease path is resolved from the orchestrator leaf at the use site').toBeGreaterThan(-1);
        expect(staleAfterIdx, 'staleAfterMs comes from the resolved leaf, never a literal').toBeGreaterThan(-1);

        // Ordering is the load-bearing part: the dry-run return must precede the lease, or a dry run
        // would take a deployment-wide lease to do nothing.
        expect(applyGate).toBeGreaterThan(-1);
        expect(applyGate, 'the dry-run gate returns BEFORE any lease is acquired').toBeLessThan(leaseIndex);
    });

    test('the provider call is recorded, so a multi-day burn is visible to the operator', async () => {
        const source = await readScript();

        expect(source).toContain('providerActivityRecorder: KBRecorderService');
        // The recorder must reach the embed call, not merely be imported.
        expect(
            source.indexOf('providerActivityRecorder: KBRecorderService'),
            'the recorder is passed inside the embedTexts options'
        ).toBeGreaterThan(source.indexOf('TextEmbeddingService.embedTexts('));
    });

    test('the yield vote is built from THIS run\'s acquisition and handed to the batch loop', async () => {
        const source = await readScript();

        expect(source).toContain('createLeaseYieldVoter(acquisition)');
        expect(source).toContain('shouldYield: createLeaseYieldVoter(acquisition)?.vote');
    });

    test('a HELD lease is an explicit non-success disposition, not a silent no-op', async () => {
        const source = await readScript();

        expect(source).toContain("outcome.status === 'held'");
        expect(source).toContain('Nothing was repaired.');
        // A held run that exited 0 would tell a caller the corpus was reconciled.
        expect(source.indexOf('process.exitCode = 1', source.indexOf("outcome.status === 'held'"))).toBeGreaterThan(-1);
    });

    test('POSITIVE CONTROL: the matcher really is reading this script', async () => {
        // Without this, every assertion above would also pass against an empty string — the failure
        // mode where a source scan reports a clean bill because it read nothing.
        const source = await readScript();

        expect(source.length).toBeGreaterThan(2000);
        expect(source).toContain('export async function repairTargets');
        expect(source, 'a token that must NOT be present, so the matcher can fail').not.toContain('withHeavyMaintenanceLeaseNotWired');
    })
});
