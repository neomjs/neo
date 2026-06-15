import {test, expect}    from '@playwright/test';
import fs                from 'fs/promises';
import os                from 'os';
import path              from 'path';
import reconcileActiveChunks from '../../../../../../../ai/services/github-workflow/shared/reconcileActiveChunks.mjs';

/**
 * @summary Falsifier coverage for the active-tier ordinal re-chunk.
 *
 * Builds a drifted active tier (items scattered across wrong chunk folders), runs the re-chunk with
 * a small itemsPerChunk, and proves: items land in ascending-id ordinal chunks, empty drift folders
 * are pruned, `_index.json` reflects the new chunk numbers, and the pass is idempotent.
 */
test.describe('Neo.ai.services.github-workflow.shared.reconcileActiveChunks', () => {
    let tmpDir, contentRoot;

    test.beforeEach(async () => {
        tmpDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-rechunk-'));
        contentRoot = path.join(tmpDir, 'content');
        await fs.mkdir(contentRoot, {recursive: true})
    });

    test.afterEach(async () => {
        await fs.rm(tmpDir, {recursive: true, force: true})
    });

    const writePr = async (chunk, id) => {
        const dir = path.join(contentRoot, 'pulls', `chunk-${chunk}`);
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(path.join(dir, `pr-${id}.md`), `# pr ${id}\n`, 'utf8')
    };

    const idsInChunk = async chunk => {
        try {
            return (await fs.readdir(path.join(contentRoot, 'pulls', `chunk-${chunk}`)))
                .map(f => parseInt(f.match(/(\d+)/)[1], 10)).sort((a, b) => a - b)
        } catch {
            return []
        }
    };

    test('re-ranks a drifted active tier into ascending-id ordinal chunks, idempotently', async () => {
        // 7 items scattered across wrong chunk folders (the drift shape): pr-10..pr-70 in chunk-1/5/9.
        await writePr(1, 50); await writePr(1, 10); await writePr(5, 70); await writePr(9, 20);
        await writePr(1, 40); await writePr(5, 30); await writePr(9, 60);

        const config = {contentRoot};
        const first  = await reconcileActiveChunks(config, {type: 'pulls', filePrefix: 'pr-', itemsPerChunk: 3});

        expect(first.total).toBe(7);
        expect(first.moved).toBeGreaterThan(0);

        // Ascending id → ordinal-3: chunk-1 = [10,20,30], chunk-2 = [40,50,60], chunk-3 = [70].
        expect(await idsInChunk(1)).toEqual([10, 20, 30]);
        expect(await idsInChunk(2)).toEqual([40, 50, 60]);
        expect(await idsInChunk(3)).toEqual([70]);
        // Emptied drift folders are pruned.
        expect(await idsInChunk(5)).toEqual([]);
        expect(await idsInChunk(9)).toEqual([]);

        // _index.json deep-link entries realign to the new chunk numbers.
        const index = JSON.parse(await fs.readFile(path.join(contentRoot, '_index.json'), 'utf8'));
        const entry = id => index.find(e => e.type === 'pulls' && String(e.id) === String(id));
        expect(entry(10).chunkNumber).toBe(1);
        expect(entry(40).chunkNumber).toBe(2);
        expect(entry(70).chunkNumber).toBe(3);

        // Idempotent: a second run relocates nothing.
        const second = await reconcileActiveChunks(config, {type: 'pulls', filePrefix: 'pr-', itemsPerChunk: 3});
        expect(second.moved).toBe(0);
        expect(await idsInChunk(1)).toEqual([10, 20, 30])
    });

    test('dedups an id present in two chunks, keeping one, so ranking stays exact', async () => {
        await writePr(1, 10); await writePr(1, 20); await writePr(1, 30);
        await writePr(5, 30); // duplicate of pr-30 in another chunk — the drift shape this fixes
        await writePr(9, 40);

        const result = await reconcileActiveChunks({contentRoot}, {type: 'pulls', filePrefix: 'pr-', itemsPerChunk: 3});

        expect(result.deduped).toBe(1);
        expect(result.total).toBe(4); // 4 unique ids, NOT 5 — the duplicate must not consume an ordinal slot.

        // 4 unique sorted [10,20,30,40] -> ordinal-3: chunk-1 = [10,20,30], chunk-2 = [40].
        expect(await idsInChunk(1)).toEqual([10, 20, 30]);
        expect(await idsInChunk(2)).toEqual([40]);

        // Exactly one pr-30 survives across the whole tier.
        const survivors = (await fs.readdir(path.join(contentRoot, 'pulls'), {recursive: true})).filter(f => /pr-30\.md$/.test(f));
        expect(survivors).toHaveLength(1)
    })
});
