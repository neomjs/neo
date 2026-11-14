import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * A built app page must find its static siblings — a web app manifest above all — inside the dist
 * app folder, because the dist tree is served as its own root.
 *
 * Two halves are exercised here. The copy itself runs against a real temporary tree, so these are
 * behaviour assertions, not a simulation. The wiring half is asserted against the build sources,
 * because the original defect was not a broken function: it was three call sites that each
 * independently failed to name the extension, and only source text can witness that a call site
 * exists at all. What is NOT covered is a real webpack/esm compile — that needs the actual builds.
 */
test.describe('dist app assets', () => {
    let DIST_APP_ASSET_EXTENSIONS, DIST_EXCLUDED_APP_RESOURCES,
        copyDistAppAssets, excludedResourcesFor, isDistAppAsset, isExcludedDistResource, repoRoot;

    const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

    test.beforeAll(async () => {
        ({
            DIST_APP_ASSET_EXTENSIONS,
            DIST_EXCLUDED_APP_RESOURCES,
            copyDistAppAssets,
            excludedResourcesFor,
            isDistAppAsset,
            isExcludedDistResource
        } = await import('../../../../buildScripts/util/distAppAssets.mjs'));

        // fileURLToPath, not URL#pathname: on Windows the pathname keeps its leading slash (`/G:/…`)
        repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    });

    test('a web app manifest is a dist asset', () => {
        expect(isDistAppAsset('manifest.webmanifest')).toBe(true);
        expect(isDistAppAsset('app.webmanifest')).toBe(true)
    });

    test('the files the builds already handle are not dist assets', () => {
        // A false positive here would route an .mjs into the verbatim copy branch, skipping the
        // Terser + import-rewrite pass the esm build depends on.
        for (const fileName of ['app.mjs', 'neo-config.json', 'index.html']) {
            expect(isDistAppAsset(fileName)).toBe(false)
        }
    });

    test('the match is on the extension, not on the word appearing in the name', () => {
        expect(isDistAppAsset('webmanifest-notes.md')).toBe(false);
        expect(isDistAppAsset('manifest.webmanifest.bak')).toBe(false)
    });

    test.describe('copying into a dist app folder', () => {
        let source, target, workspace;

        test.beforeEach(() => {
            workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-dist-assets-'));
            // camelCase on purpose: app-folder casing is the other half of this fix, and a copy
            // that works only on a case-insensitive filesystem is the failure being prevented.
            source    = path.join(workspace, 'apps', 'myApp');
            target    = path.join(workspace, 'dist', 'production', 'apps', 'myApp');

            fs.mkdirSync(path.join(source, 'resources'), {recursive: true});
            fs.mkdirSync(target, {recursive: true});
        });

        test.afterEach(() => {
            fs.rmSync(workspace, {force: true, recursive: true})
        });

        test('a root-level manifest lands next to the generated page', () => {
            fs.writeFileSync(path.join(source, 'manifest.webmanifest'), '{"name":"probe"}');

            expect(copyDistAppAssets(source, target)).toEqual(['manifest.webmanifest']);
            expect(fs.readFileSync(path.join(target, 'manifest.webmanifest'), 'utf8')).toBe('{"name":"probe"}')
        });

        test('generated and source files the builds own are left alone', () => {
            fs.writeFileSync(path.join(source, 'index.html'),      '<html></html>');
            fs.writeFileSync(path.join(source, 'neo-config.json'), '{}');
            fs.writeFileSync(path.join(source, 'app.mjs'),         'export default {}');

            expect(copyDistAppAssets(source, target)).toEqual([]);
            expect(fs.readdirSync(target)).toEqual([])
        });

        test('only the folder root is scanned — resources are copied wholesale elsewhere', () => {
            fs.writeFileSync(path.join(source, 'resources', 'nested.webmanifest'), '{}');

            expect(copyDistAppAssets(source, target)).toEqual([]);
            expect(fs.existsSync(path.join(target, 'nested.webmanifest'))).toBe(false)
        });

        test('an app folder without assets is not an error', () => {
            expect(copyDistAppAssets(source, target)).toEqual([])
        });

        test('an absent source folder is not an error', () => {
            expect(copyDistAppAssets(path.join(workspace, 'apps', 'absent'), target)).toEqual([])
        });
    });

    test.describe('the builds are wired to it', () => {
        const APP_WORKER_CONFIGS = [
            'buildScripts/webpack/development/webpack.config.appworker.mjs',
            'buildScripts/webpack/production/webpack.config.appworker.mjs'
        ];

        test('both webpack app builds copy the assets', () => {
            for (const config of APP_WORKER_CONFIGS) {
                expect(read(config), `${config} must call copyDistAppAssets`).toContain('copyDistAppAssets(')
            }
        });

        test('the esm build gates its verbatim copy on the shared rule', () => {
            expect(read('buildScripts/build/esmodules.mjs')).toContain('isDistAppAsset(dirent.name)')
        });

        test('no webpack app build folds a named folder to lower case', () => {
            // The fold was applied to the READ path as well, so a camelCase app could not be built
            // on a case-sensitive filesystem at all, and its resources landed in a second folder.
            // `Docs` keeps the fold: it is a synthetic key whose source folder really is `docs/`.
            for (const config of APP_WORKER_CONFIGS) {
                const source = read(config);

                expect(source, `${config} must not lowercase an app folder`)
                    .not.toContain("folder === 'examples' ? key : key.toLowerCase()");
                expect(source, `${config} must still fold the synthetic Docs key`)
                    .toContain("folder === '' ? key.toLowerCase() : key");
            }
        });

        test('the extension and excluded-resource sets are single shared definitions (#20945)', () => {
            expect(DIST_APP_ASSET_EXTENSIONS).toContain('.webmanifest');
            expect(DIST_EXCLUDED_APP_RESOURCES).toEqual([
                'apps/portal/resources/data/seo.json',
                'apps/portal/resources/data/ssg-archive-routes.json'
            ]);

            expect(isExcludedDistResource('apps/portal/resources/data/seo.json')).toBe(true);
            expect(isExcludedDistResource('/workspace/neo/apps/portal/resources/data/seo.json')).toBe(true);
            expect(isExcludedDistResource('C:\\workspace\\neo\\apps\\portal\\resources\\data\\ssg-archive-routes.json')).toBe(true);
            expect(isExcludedDistResource('apps/portal/resources/data/blog.json')).toBe(false);

            expect(excludedResourcesFor('apps/portal/resources')).toEqual([
                'data/seo.json',
                'data/ssg-archive-routes.json'
            ]);
            expect(excludedResourcesFor('apps\\portal\\resources')).toEqual([
                'data/seo.json',
                'data/ssg-archive-routes.json'
            ]);
            expect(excludedResourcesFor('apps/colors/resources')).toEqual([]);

            for (const config of APP_WORKER_CONFIGS) {
                expect(read(config), `${config} must wire excludedResourcesFor`).toContain('excludedResourcesFor(')
            }
            expect(read('buildScripts/build/esmodules.mjs')).toContain('isExcludedDistResource(normalizedInput)');

            // Neither build may re-declare the extension or seo.json locally — that divergence is the defect.
            for (const buildFile of [...APP_WORKER_CONFIGS, 'buildScripts/build/esmodules.mjs']) {
                expect(read(buildFile), `${buildFile} must not name .webmanifest itself`)
                    .not.toContain('.webmanifest');
                expect(read(buildFile), `${buildFile} must not hardcode seo.json itself`)
                    .not.toContain('seo.json')
            }
        });

        test('copyFolder.mjs -x omits excluded Portal SEO JSON files and removes stale copies from target (#20945)', () => {
            const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-copy-folder-exclude-'));

            try {
                const sourceRes = path.join(tempRoot, 'apps', 'portal', 'resources'),
                      targetRes = path.join(tempRoot, 'dist', 'production', 'apps', 'portal', 'resources');

                fs.mkdirSync(path.join(sourceRes, 'data'), {recursive: true});
                fs.mkdirSync(path.join(targetRes, 'data'), {recursive: true});

                fs.writeFileSync(path.join(sourceRes, 'data', 'blog.json'), '{"data":[]}');
                fs.writeFileSync(path.join(sourceRes, 'data', 'seo.json'), '{"/home":{}}');
                fs.writeFileSync(path.join(sourceRes, 'data', 'ssg-archive-routes.json'), '[]');
                // Pre-populate stale copy in target to prove incremental builds purge it
                fs.writeFileSync(path.join(targetRes, 'data', 'seo.json'), '{"stale":true}');

                const excluded = excludedResourcesFor('apps/portal/resources');
                execFileSync(process.execPath, [
                    path.join(repoRoot, 'buildScripts/util/copyFolder.mjs'),
                    '-s', sourceRes,
                    '-t', targetRes,
                    '-x', excluded.join(',')
                ], {cwd: repoRoot, stdio: 'pipe'});

                expect(fs.existsSync(path.join(targetRes, 'data', 'blog.json'))).toBe(true);
                expect(fs.existsSync(path.join(targetRes, 'data', 'seo.json'))).toBe(false);
                expect(fs.existsSync(path.join(targetRes, 'data', 'ssg-archive-routes.json'))).toBe(false);
            } finally {
                fs.rmSync(tempRoot, {force: true, recursive: true})
            }
        });
    });
});
