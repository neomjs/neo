import {test, expect}                            from '@playwright/test';
import fs                                        from 'fs/promises';
import os                                        from 'os';
import path                                      from 'path';
import {parseContentPath, pathSegmentOptionsFor} from '../../../../../../../ai/services/github-workflow/shared/contentPath.mjs';
import {writeContentIndex}                       from '../../../../../../../ai/services/github-workflow/shared/contentIndex.mjs';
import {
    buildContentInventory,
    resolveArchivedLocation,
    validateContentIntegrity
} from '../../../../../../../ai/services/github-workflow/shared/contentInventory.mjs';

/**
 * @summary Falsifier coverage for the complete-corpus inventory and its integrity verdict.
 *
 * The corpus these helpers describe drifted for months without a single red signal, so the bar here
 * is not "does it report the right numbers on a healthy tree" — a probe aimed at the wrong shape
 * also reports zeros, and zeros from a blind instrument are indistinguishable from health. Every
 * detection case below is paired with a positive control proving the same probe returns non-zero
 * when the condition is present, and the clean-corpus case proves the verdict can reach PASS at all.
 * A validator that cannot fail and a validator that cannot pass are equally worthless.
 *
 * The production shapes are reproduced literally: an index entry naming a path that no longer exists
 * (the archive-move drift), and one id owning two byte-divergent artifacts in different chunks of the
 * same sealed version bucket (the partial-ordinal duplicate).
 */
test.describe('Neo.ai.services.github-workflow.shared.contentInventory', () => {
    let tmpDir, contentRoot, config;

    test.beforeEach(async () => {
        tmpDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-inventory-'));
        contentRoot = path.join(tmpDir, 'content');
        config      = {contentRoot};
        await fs.mkdir(contentRoot, {recursive: true})
    });

    test.afterEach(async () => {
        await fs.rm(tmpDir, {recursive: true, force: true})
    });

    /** Writes an active-tier PR artifact and returns its contentRoot-relative path. */
    const writeActive = async (chunk, id, body = `# pr ${id}\n`) => {
        const dir = path.join(contentRoot, 'pulls', `chunk-${chunk}`);
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(path.join(dir, `pr-${id}.md`), body, 'utf8');
        return `pulls/chunk-${chunk}/pr-${id}.md`
    };

    /** Writes an archive-tier PR artifact and returns its contentRoot-relative path. */
    const writeArchived = async (version, chunk, id, body = `# pr ${id}\n`) => {
        const dir = path.join(contentRoot, 'archive', 'pulls', version, `chunk-${chunk}`);
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(path.join(dir, `pr-${id}.md`), body, 'utf8');
        return `archive/pulls/${version}/chunk-${chunk}/pr-${id}.md`
    };

    const indexEntry = (id, relPath, version = null, chunkNumber = 1) =>
        ({type: 'pulls', id, version, chunkNumber, path: relPath});

    const inventoryOpts = {type: 'pulls', filePrefix: 'pr-'};

    test.describe('parseContentPath — the inverse of the path math', () => {
        test('reads an archive path back into its tier coordinates', () => {
            expect(parseContentPath({
                contentRoot: 'resources/content',
                filePath   : 'archive/pulls/v13.0.0/chunk-2/pr-10124.md'
            })).toEqual({type: 'pulls', version: 'v13.0.0', bucket: null, chunkNumber: 2, filename: 'pr-10124.md'})
        });

        test('reads an active path back into its tier coordinates', () => {
            expect(parseContentPath({
                contentRoot: 'resources/content',
                filePath   : 'pulls/chunk-1/pr-9537.md'
            })).toEqual({type: 'pulls', version: null, bucket: null, chunkNumber: 1, filename: 'pr-9537.md'})
        });

        test('reads an ABSOLUTE path back into its tier coordinates', () => {
            expect(parseContentPath({
                contentRoot: '/repo/resources/content',
                filePath   : '/repo/resources/content/archive/pulls/v13.0.0/chunk-2/pr-10124.md'
            })).toEqual({type: 'pulls', version: 'v13.0.0', bucket: null, chunkNumber: 2, filename: 'pr-10124.md'})
        });

        test('a non-version archive segment reads as a bucket, not a version', () => {
            const parsed = parseContentPath({
                contentRoot: 'resources/content',
                filePath   : 'archive/pulls/rejected/chunk-1/pr-5.md'
            });

            expect(parsed.bucket).toBe('rejected');
            expect(parsed.version).toBeNull()
        });

        test('an OVERRIDDEN chunk prefix parses — the vocabulary is configured, not universal', () => {
            // A hardcoded `chunk-` agrees with the shipped default and diverges silently the moment a
            // deployment overrides it: the forward build would emit `slice-3/` while the inverse only
            // recognised `chunk-3/`, and the two halves of one contract would disagree with nothing red.
            expect(parseContentPath({
                contentRoot: 'resources/content',
                filePath   : 'archive/pulls/v13.0.0/slice-2/pr-10124.md',
                chunkPrefix: 'slice-'
            })).toEqual({type: 'pulls', version: 'v13.0.0', bucket: null, chunkNumber: 2, filename: 'pr-10124.md'})
        });

        test('an OVERRIDDEN version prefix classifies release buckets — not as named buckets', () => {
            // The version/bucket split is decided by the prefix. Hardcoding `/^v\d/` would reclassify
            // every release bucket as a non-release bucket under an override — silently, since both
            // are valid shapes and neither throws.
            const parsed = parseContentPath({
                contentRoot  : 'resources/content',
                filePath     : 'archive/pulls/rel-13.0.0/chunk-1/pr-5.md',
                versionPrefix: 'rel-'
            });

            expect(parsed.version).toBe('rel-13.0.0');
            expect(parsed.bucket).toBeNull()
        });

        test('under an overridden version prefix, a `v`-shaped segment is a BUCKET, not a version', () => {
            // The inverse of the above, and the reason this must be config-driven rather than
            // permissive: with `rel-` configured, `v13.0.0` is not a release bucket at all.
            const parsed = parseContentPath({
                contentRoot  : 'resources/content',
                filePath     : 'archive/pulls/v13.0.0/chunk-1/pr-5.md',
                versionPrefix: 'rel-'
            });

            expect(parsed.bucket).toBe('v13.0.0');
            expect(parsed.version).toBeNull()
        });

        test('pathSegmentOptionsFor maps config names to parse options, and defaults when absent', () => {
            expect(pathSegmentOptionsFor({archiveChunkPrefix: 'slice-', versionDirectoryPrefix: 'rel-'}))
                .toEqual({chunkPrefix: 'slice-', versionPrefix: 'rel-'});
            expect(pathSegmentOptionsFor({})).toEqual({chunkPrefix: 'chunk-', versionPrefix: 'v'})
        });

        test('a projectRoot-relative path does NOT parse — the convention trap, pinned', () => {
            // `metadata.{type}[].path` is projectRoot-relative (`resources/content/pulls/…`) while
            // `_index.json` is contentRoot-relative (`pulls/…`). Both are bare relative strings; only
            // the leading root segment tells them apart, and nothing in the string reveals which
            // convention produced it. Against a `resources/content` root the metadata shape resolves
            // to `resources/content/resources/content/…` and is correctly rejected.
            //
            // Pinned rather than "fixed" by sniffing for the prefix: a parser that guesses which
            // convention it was handed would silently accept a doubled path as a real one, which is
            // the same trade — a confident answer over an honest refusal — that produced the drift
            // this module exists to detect.
            expect(parseContentPath({
                contentRoot: 'resources/content',
                filePath   : 'resources/content/pulls/chunk-1/pr-9537.md'
            })).toBeNull()
        });

        test('returns null for paths that are not chunked content rather than throwing', () => {
            // Off-contract input is data, not an exception: callers scanning a real tree will meet
            // stray files, and a throw here would make the scanner the thing that fails.
            expect(parseContentPath({contentRoot: 'resources/content', filePath: 'resources/content/_index.json'})).toBeNull();
            expect(parseContentPath({contentRoot: 'resources/content', filePath: 'resources/content/pulls/pr-1.md'})).toBeNull();
            expect(parseContentPath({contentRoot: 'resources/content', filePath: 'resources/content/pulls/nochunk/pr-1.md'})).toBeNull();
            expect(parseContentPath({contentRoot: 'resources/content', filePath: '/etc/passwd'})).toBeNull()
        });

        test('round-trips every path the inventory reports — the two directions cannot disagree', async () => {
            await writeActive(1, 10);
            await writeArchived('v13.0.0', 2, 20);

            const inventory = await buildContentInventory(config, inventoryOpts);

            for (const [, copies] of inventory) {
                for (const copy of copies) {
                    const parsed = parseContentPath({contentRoot, filePath: copy.absPath});

                    expect(parsed).not.toBeNull();
                    expect(parsed.chunkNumber).toBe(copy.chunkNumber);
                    expect(parsed.version).toBe(copy.version)
                }
            }
        })
    });

    test.describe('buildContentInventory — complete membership across both tiers', () => {
        test('POSITIVE CONTROL: finds artifacts in the active tier AND every archive bucket', async () => {
            // This is the control every zero below leans on. A scanner that misses a tier reports a
            // smaller corpus, and a smaller corpus reports fewer duplicates — silently.
            await writeActive(1, 10);
            await writeActive(1, 20);
            await writeArchived('v13.0.0', 1, 30);
            await writeArchived('v12.0.0', 3, 40);

            const inventory = await buildContentInventory(config, inventoryOpts);

            expect(inventory.size).toBe(4);
            expect([...inventory.keys()].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
            expect(inventory.get(10)[0].version).toBeNull();
            expect(inventory.get(30)[0].version).toBe('v13.0.0');
            expect(inventory.get(40)[0].version).toBe('v12.0.0');
            expect(inventory.get(40)[0].chunkNumber).toBe(3)
        });

        test('keys map to an ARRAY so a second copy is surfaced, never overwritten', async () => {
            // A Map<id, entry> would drop the second copy and report a clean corpus — the precise
            // blindness that let divergent duplicates accumulate unseen.
            await writeArchived('v13.0.0', 1, 10124, 'copy A');
            await writeArchived('v13.0.0', 2, 10124, 'copy B is longer');

            const inventory = await buildContentInventory(config, inventoryOpts);

            expect(inventory.size).toBe(1);
            expect(inventory.get(10124)).toHaveLength(2);
            expect(inventory.get(10124).map(c => c.chunkNumber).sort()).toEqual([1, 2])
        });

        test('an empty corpus is zero — and the control above proves the scanner can find files', async () => {
            expect((await buildContentInventory(config, inventoryOpts)).size).toBe(0)
        })
    });

    test.describe('resolveArchivedLocation — sealed placement as a lookup', () => {
        test('reports unique for exactly one archived artifact', async () => {
            await writeArchived('v13.0.0', 2, 10);

            const resolved = resolveArchivedLocation(await buildContentInventory(config, inventoryOpts), 10);

            expect(resolved.status).toBe('unique');
            expect(resolved.entry.chunkNumber).toBe(2)
        });

        test('reports none for an active-only artifact — active is not a sealed location', async () => {
            await writeActive(1, 10);

            expect(resolveArchivedLocation(await buildContentInventory(config, inventoryOpts), 10).status).toBe('none')
        });

        test('reports AMBIGUOUS rather than picking a copy — resolving here would launder the corruption', async () => {
            await writeArchived('v13.0.0', 1, 10, 'A');
            await writeArchived('v13.0.0', 2, 10, 'B');

            const resolved = resolveArchivedLocation(await buildContentInventory(config, inventoryOpts), 10);

            expect(resolved.status).toBe('ambiguous');
            expect(resolved.entry).toBeNull();
            expect(resolved.copies).toHaveLength(2)
        })
    });

    test.describe('validateContentIntegrity — the verdict', () => {
        test('a clean corpus PASSES — proving the verdict is reachable, so a FAIL below means something', async () => {
            const a = await writeActive(1, 10),
                  b = await writeArchived('v13.0.0', 1, 20);

            await writeContentIndex(config, [indexEntry(10, a), indexEntry(20, b, 'v13.0.0')]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.ok).toBe(true);
            expect(result.indexedTotal).toBe(2);
            expect(result.corpusTotal).toBe(2);
            expect(result.uniqueIds).toBe(2)
        });

        test('detects an index entry naming a path that does not exist — the archive-move drift', async () => {
            // The production shape: the file was renamed into the archive and the index kept naming
            // its old active path. 2,015 entries in the live corpus look exactly like this.
            const archived = await writeArchived('v13.0.0', 1, 9537);

            await writeContentIndex(config, [indexEntry(9537, 'pulls/chunk-1/pr-9537.md')]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.ok).toBe(false);
            expect(result.staleIndexEntries).toHaveLength(1);
            expect(result.staleIndexEntries[0].path).toBe('pulls/chunk-1/pr-9537.md');
            // The artifact itself is present and healthy — only the lookup is wrong.
            expect(result.corpusTotal).toBe(1);
            expect(archived).toContain('v13.0.0')
        });

        test('detects an entry whose chunkNumber contradicts its own path — a real file, described wrongly', async () => {
            // The costume a path-existence check cannot see through. The entry names a file that
            // exists, so "every indexed path resolves" passes — and the entry still lies about where
            // the file sits. This is what a plan-derived chunkNumber produces once placement can
            // legitimately differ from the plan.
            const archived = await writeArchived('v13.0.0', 2, 10124);

            await writeContentIndex(config, [indexEntry(10124, archived, 'v13.0.0', 1)]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.staleIndexEntries).toHaveLength(0);          // the path is real
            expect(result.inconsistentIndexEntries).toHaveLength(1);   // and the coordinates are not
            expect(result.inconsistentIndexEntries[0].actual).toEqual({version: 'v13.0.0', chunkNumber: 2});
            expect(result.ok).toBe(false)
        });

        test('detects an entry whose version contradicts its own path', async () => {
            const archived = await writeArchived('v13.0.0', 1, 55);

            await writeContentIndex(config, [indexEntry(55, archived, 'v12.0.0', 1)]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.inconsistentIndexEntries).toHaveLength(1);
            expect(result.ok).toBe(false)
        });

        test('an entry that agrees with its path is NOT flagged — the check can pass', async () => {
            const archived = await writeArchived('v13.0.0', 2, 66);

            await writeContentIndex(config, [indexEntry(66, archived, 'v13.0.0', 2)]);

            expect((await validateContentIntegrity(config, inventoryOpts)).inconsistentIndexEntries).toHaveLength(0)
        });

        test('detects DUPLICATE index rows for one id — two assertions about where it lives', async () => {
            // `updateContentIndex` keys by {type, id} and so cannot produce these, which is exactly
            // why they must be checked on READ: a hand-edit, a bad merge, or any writer that appends
            // rather than upserts makes two rows for one id. Every path-existence check passes on
            // both, and the first one wins at lookup — silently and arbitrarily.
            const a = await writeActive(1, 10);

            await writeContentIndex(config, [indexEntry(10, a), {...indexEntry(10, a), chunkNumber: 2}]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.duplicateIndexEntryIds).toEqual([10]);
            expect(result.ok).toBe(false)
        });

        test('detects an artifact that no index entry names', async () => {
            await writeActive(1, 10);
            await writeContentIndex(config, []);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.ok).toBe(false);
            expect(result.unindexedIds).toEqual([10])
        });

        test('classifies byte-IDENTICAL duplicates separately — one artifact written twice', async () => {
            await writeArchived('v13.0.0', 1, 10, 'same bytes');
            await writeArchived('v13.0.0', 2, 10, 'same bytes');
            await writeContentIndex(config, [indexEntry(10, 'archive/pulls/v13.0.0/chunk-1/pr-10.md', 'v13.0.0')]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.identicalDuplicateIds).toEqual([10]);
            expect(result.divergentDuplicateIds).toEqual([]);
            expect(result.ok).toBe(false)
        });

        test('classifies byte-DIVERGENT duplicates as their own class — the fail-loud shape', async () => {
            // Reproduces pr-10124: one id, two chunks of the same sealed version, different bytes.
            // Nothing on disk says which rendering is current, so position must not decide it.
            await writeArchived('v13.0.0', 1, 10124, 'rendering with fewer comments');
            await writeArchived('v13.0.0', 2, 10124, 'rendering with more comments and reviews');
            await writeContentIndex(config, [indexEntry(10124, 'archive/pulls/v13.0.0/chunk-2/pr-10124.md', 'v13.0.0', 2)]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.divergentDuplicateIds).toEqual([10124]);
            expect(result.identicalDuplicateIds).toEqual([]);
            expect(result.ok).toBe(false);
            // Both copies counted: the corpus holds two artifacts for one id.
            expect(result.corpusTotal).toBe(2);
            expect(result.uniqueIds).toBe(1)
        });

        test('reports every defect class at once rather than stopping at the first', async () => {
            // A pass that returns on first fault turns a corpus census into a bisect.
            await writeArchived('v13.0.0', 1, 10, 'A');
            await writeArchived('v13.0.0', 2, 10, 'B');
            await writeActive(1, 20);
            await writeContentIndex(config, [indexEntry(30, 'pulls/chunk-1/pr-30.md')]);

            const result = await validateContentIntegrity(config, inventoryOpts);

            expect(result.divergentDuplicateIds).toEqual([10]);
            expect(result.unindexedIds.sort((a, b) => a - b)).toEqual([10, 20]);
            expect(result.staleIndexEntries).toHaveLength(1);
            expect(result.ok).toBe(false)
        });

        test('accepts a pre-built inventory so a sync does not scan the corpus twice', async () => {
            const a = await writeActive(1, 10);
            await writeContentIndex(config, [indexEntry(10, a)]);

            const inventory = await buildContentInventory(config, inventoryOpts),
                  result    = await validateContentIntegrity(config, {...inventoryOpts, inventory});

            expect(result.ok).toBe(true);
            expect(result.corpusTotal).toBe(1)
        })
    })
});
