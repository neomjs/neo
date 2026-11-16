import {test, expect}                                                                                       from '@playwright/test';
import {execFileSync, spawnSync}                                                                            from 'node:child_process';
import {copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir}                                                                                             from 'node:os';
import path                                                                                                 from 'node:path';

/**
 * @summary Exercises the production runner against real git commits and real Playwright JSON reports in a disposable checkout.
 * @returns {Object} Isolated checkout and helpers.
 */
function fixture() {
    const root  = mkdtempSync(path.join(tmpdir(), 'neo-red-on-base-')),
          git   = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}),
          write = (file, contents) => {
              mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
              writeFileSync(path.join(root, file), contents)
          };
    git('init', '-q');
    git('config', 'user.name', 'Runner fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    write('.gitignore', 'node_modules\ntest/playwright/test-results/\nsummary.md\n');
    write('package.json', '{"type":"module"}');
    write('test/playwright/playwright.config.unit.mjs', `export default {
        testDir: './unit', projects: [{name: 'unit-engine'}], timeout: 10000
    };`);
    write('source.mjs', 'export const value = 1;\n');
    write('deleted.mjs', 'export const present = true;\n');
    write('test/playwright/unit/demo.spec.mjs', `import {test, expect} from '@playwright/test';
        import {value} from '../../../source.mjs';
        test('existing', () => expect(typeof value).toBe('number'));
    `);
    git('add', '.');
    git('commit', '-qm', 'base');
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'junction');
    for (const file of ['runRedOnBase.mjs', 'compareRedOnBase.mjs']) {
        copyFileSync(path.resolve('test/playwright', file), path.join(root, 'test/playwright', file))
    }
    return {root, git, write}
}

test('runner restores modified, deleted and added source while keeping head specs and dependencies', () => {
    const {root, git, write} = fixture();
    try {
        write('source.mjs', 'export const value = 2;\n');
        rmSync(path.join(root, 'deleted.mjs'));
        write('added.mjs', 'export const added = true;\n');
        write('test/playwright/unit/demo.spec.mjs', `import {test, expect} from '@playwright/test';
            import {value} from '../../../source.mjs';
            test('existing', () => expect(typeof value).toBe('number'));
            test('requires source fix', () => expect(value).toBe(2));
            test('passes both ways', () => expect(value).toBeGreaterThan(0));
        `);
        write('test/playwright/unit/load.spec.mjs', `import {test, expect} from '@playwright/test';
            import {added} from '../../../added.mjs';
            test('new module', () => expect(added).toBe(true));
        `);
        git('add', '.');
        git('commit', '-qm', 'head');
        const result = spawnSync(process.execPath, ['test/playwright/runRedOnBase.mjs'], {
            cwd: root, encoding: 'utf8', env: {...process.env, GITHUB_STEP_SUMMARY: path.join(root, 'summary.md')}
        });
        expect(result.status, result.stderr).toBe(0);
        const rows = JSON.parse(readFileSync(path.join(root, 'test/playwright/test-results/red-on-base/comparison.json'), 'utf8'));
        expect(rows.find(row => row.titlePath.at(-1) === 'requires source fix')).toMatchObject({classification: 'fails-without-change', isNew: true});
        expect(rows.find(row => row.titlePath.at(-1) === 'passes both ways')).toMatchObject({classification: 'passes-both', isNew: true});
        expect(rows.find(row => row.titlePath.at(-1) === 'new module')).toMatchObject({classification: 'cannot-load', isNew: true});
        expect(result.stdout).toContain('::warning file=test/playwright/unit/demo.spec.mjs,line=');
        expect(result.stdout).not.toContain('::warning file=test/playwright/unit/load.spec.mjs');
        expect(readFileSync(path.join(root, 'source.mjs'), 'utf8')).toContain('value = 1');
        expect(existsSync(path.join(root, 'deleted.mjs'))).toBe(true);
        expect(existsSync(path.join(root, 'added.mjs'))).toBe(false);
        expect(readFileSync(path.join(root, 'test/playwright/unit/demo.spec.mjs'), 'utf8')).toContain('requires source fix');
        expect(existsSync(path.join(root, 'node_modules/@playwright/test'))).toBe(true)
    } finally {
        rmSync(root, {recursive: true, force: true})
    }
});

test('runner skips a test-only change with an explicit reason and no report runs', () => {
    const {root, git, write} = fixture();
    try {
        write('test/playwright/unit/demo.spec.mjs', `import {test} from '@playwright/test'; test('only a test', () => {});`);
        // Keep the runner in test/, and add no production paths to the commit.
        git('add', 'test');
        git('commit', '-qm', 'test-only');
        const summary = path.join(root, 'summary.md'),
              result  = spawnSync(process.execPath, ['test/playwright/runRedOnBase.mjs'], {
                  cwd: root, encoding: 'utf8', env: {...process.env, GITHUB_STEP_SUMMARY: summary}
              });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(summary, 'utf8')).toContain('no paths outside test/ changed');
        expect(existsSync(path.join(root, 'test/playwright/test-results/red-on-base/head.json'))).toBe(false)
    } finally {
        rmSync(root, {recursive: true, force: true})
    }
});
