import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

/**
 * The baselined theme-coverage guard (ticket-ref-ok: the spec pins the ticket's enforcement AC —
 * a guard that fails when a src/ package newly reaches zero theme coverage, with the known
 * zero-coverage packages baselined and justified).
 *
 * The guard's value is its failure DIRECTIONS and the fact that the live tree passes, so those
 * are what is asserted — not the message text. Fixture trees are planted in a tmp dir; the
 * collector is pure over injectable paths. The live-tree control is the ratchet's anchor: a guard
 * that cannot pass on the tree it guards is ceremony.
 */
test.describe('check-theme-coverage — baselined zero-coverage guard', () => {
    let collectThemeCoverageFailures, tmpRoot;

    const makeTree = ({srcPkgs = [], darkPkgs = [], lightPkgs = []} = {}) => {
        const root   = fs.mkdtempSync(path.join(tmpRoot, 'theme-coverage-')),
              srcDir = path.join(root, 'src'),
              mk     = (dir, pkg) => { fs.mkdirSync(path.join(dir, pkg), {recursive: true}); fs.writeFileSync(path.join(dir, pkg, 'X.scss'), '.x {}') };

        fs.mkdirSync(srcDir, {recursive: true});
        srcPkgs.forEach(pkg => fs.mkdirSync(path.join(srcDir, pkg), {recursive: true}));
        darkPkgs.forEach(pkg  => mk(path.join(root, 'theme-neo-dark'),  pkg));
        lightPkgs.forEach(pkg => mk(path.join(root, 'theme-neo-light'), pkg));

        return {srcDir, darkDir: path.join(root, 'theme-neo-dark'), lightDir: path.join(root, 'theme-neo-light')};
    };

    test.beforeAll(async () => {
        ({collectThemeCoverageFailures} = await import('../../../../buildScripts/util/check-theme-coverage.mjs'));
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-coverage-'));
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    test('CONTROL: the live tree passes — covered in both themes or baselined with a justification', () => {
        expect(collectThemeCoverageFailures()).toEqual([]);
    });

    test('FIRES: a new zero-coverage package with no baseline row', () => {
        const failures = collectThemeCoverageFailures({...makeTree({srcPkgs: ['dashboard']}), baseline: {}});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[new-uncovered]');
        expect(failures[0]).toContain('dashboard');
    });

    test('FIRES: values in one neo theme only — the half-covered class', () => {
        const failures = collectThemeCoverageFailures({...makeTree({srcPkgs: ['grid'], darkPkgs: ['grid']}), baseline: {}});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[half-covered]');
        expect(failures[0]).toContain('grid');
    });

    test('FIRES: burn-down — a baselined package that gained coverage must leave the baseline', () => {
        const tree     = makeTree({srcPkgs: ['sitemap'], darkPkgs: ['sitemap'], lightPkgs: ['sitemap']}),
              failures = collectThemeCoverageFailures({...tree, baseline: {sitemap: 'was theme-free'}});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[burn-down]');
        expect(failures[0]).toContain('sitemap');
    });

    test('FIRES: a stale row — the baseline names a package that no longer exists', () => {
        const failures = collectThemeCoverageFailures({...makeTree({srcPkgs: ['grid']}), baseline: {vanished: 'gone'}});

        expect(failures.some(f => f.includes('[stale-row]') && f.includes('vanished'))).toBe(true);
    });

    test('PASSES: a baselined zero-coverage package with a recorded justification', () => {
        const failures = collectThemeCoverageFailures({...makeTree({srcPkgs: ['layout']}), baseline: {layout: 'positioning only'}});

        expect(failures).toEqual([]);
    });

    test('FAILS CLOSED: a missing structure root is a failure, never a vacuous green', () => {
        const failures = collectThemeCoverageFailures({srcDir: path.join(tmpRoot, 'does-not-exist')});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[surface]');
    });
});
