import {setup} from '../../../setup.mjs';

const appName = 'BootstrapWorktreeTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';

/**
 * @summary Coverage for the worktree bootstrap script (#10095).
 *
 * Uses tmp dirs as fake main-checkout and fake worktree to exercise the copy logic
 * without touching the real repo state. The CLI-mode `execFile` resolution of
 * `git worktree list --porcelain` is not exercised here — that path is a thin wrapper
 * around the already-covered `bootstrapWorktree(...)` function.
 */
test.describe('ai/scripts/bootstrapWorktree', () => {
    let bootstrapWorktree;
    let BOOTSTRAP_CONFIGS;
    let fakeMainCheckout;
    let fakeWorktree;

    const fixtureConfigs = [
        'ai/mcp/server/github-workflow/config.mjs',
        'ai/mcp/server/knowledge-base/config.mjs',
        'ai/mcp/server/memory-core/config.mjs',
        'ai/mcp/server/neural-link/config.mjs'
    ];

    test.beforeAll(async () => {
        const mod        = await import('../../../../../ai/scripts/bootstrapWorktree.mjs');
        bootstrapWorktree = mod.bootstrapWorktree;
        BOOTSTRAP_CONFIGS = mod.BOOTSTRAP_CONFIGS;
    });

    test.beforeEach(async () => {
        const tmpBase    = path.resolve(process.cwd(), 'tmp', `bootstrap-worktree-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        fakeMainCheckout = path.join(tmpBase, 'main-checkout');
        fakeWorktree     = path.join(tmpBase, 'worktree');

        for (const rel of fixtureConfigs) {
            const src = path.join(fakeMainCheckout, rel);
            await fs.ensureDir(path.dirname(src));
            await fs.writeFile(src, `// fixture content for ${rel}\n`, 'utf-8');
        }
        await fs.ensureDir(fakeWorktree);
    });

    test.afterEach(async () => {
        if (fakeMainCheckout) {
            await fs.remove(path.dirname(fakeMainCheckout)).catch(() => {});
        }
    });

    test('exports the canonical BOOTSTRAP_CONFIGS list', () => {
        expect(BOOTSTRAP_CONFIGS).toEqual(fixtureConfigs);
    });

    test('copies every missing config.mjs from main checkout into the worktree', async () => {
        const logs   = [];
        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : (line) => logs.push(line)
        });

        expect(result.copied).toEqual(fixtureConfigs);
        expect(result.skipped).toHaveLength(0);
        expect(result.missing).toHaveLength(0);

        for (const rel of fixtureConfigs) {
            const dst     = path.join(fakeWorktree, rel);
            const content = await fs.readFile(dst, 'utf-8');
            expect(content).toContain(`fixture content for ${rel}`);
        }
    });

    test('is idempotent — re-running after partial seed leaves existing files untouched', async () => {
        // Pre-seed one of the four with distinct content; confirm it's preserved.
        const preseeded    = fixtureConfigs[0];
        const preseededDst = path.join(fakeWorktree, preseeded);
        await fs.ensureDir(path.dirname(preseededDst));
        await fs.writeFile(preseededDst, '// preserved local override\n', 'utf-8');

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : () => {}
        });

        expect(result.copied).toEqual(fixtureConfigs.slice(1));
        expect(result.skipped).toEqual([preseeded]);

        const preserved = await fs.readFile(preseededDst, 'utf-8');
        expect(preserved).toBe('// preserved local override\n');
    });

    test('refuses to copy when running inside the main checkout', async () => {
        const logs   = [];
        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeMainCheckout, // same path = main checkout mode
            configs     : fixtureConfigs,
            log         : (line) => logs.push(line)
        });

        expect(result.copied).toHaveLength(0);
        expect(result.skipped).toHaveLength(0);
        expect(result.missing).toHaveLength(0);
        expect(logs.join('\n')).toContain('main checkout');
    });

    test('reports configs missing in the main checkout without throwing', async () => {
        // Remove one fixture from the main checkout to simulate a partial release.
        const removed = fixtureConfigs[2];
        await fs.remove(path.join(fakeMainCheckout, removed));

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : () => {}
        });

        expect(result.missing).toEqual([removed]);
        expect(result.copied).toEqual(fixtureConfigs.filter(c => c !== removed));
    });
});
