import {expect, test}                           from '@playwright/test';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir}                                 from 'node:os';
import path                                     from 'node:path';
import {
    CONTENT_SECURITY_POLICY,
    createHarnessAssetResolver,
    isAllowedHarnessAssetPath,
    isHarnessDocumentUrl,
    parseHarnessUrl
} from '../../../../harness/contentPolicy.mjs';

test.describe('harness content policy', () => {
    let outsideRoot, repoRoot, resolveAsset;

    test.beforeAll(async () => {
        repoRoot    = await mkdtemp(path.join(tmpdir(), 'neo-harness-policy-'));
        outsideRoot = await mkdtemp(path.join(tmpdir(), 'neo-harness-outside-'));

        const files = [
            'apps/agentos/index.html',
            'dist/development/css/src/Global.css',
            'node_modules/@fortawesome/fontawesome-free/css/all.min.css',
            'node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2',
            'resources/images/logo/neo_logo_primary.svg',
            'resources/theme-map.json',
            'src/Neo.mjs'
        ];

        for (const file of files) {
            const target = path.join(repoRoot, file);

            await mkdir(path.dirname(target), {recursive: true});
            await writeFile(target, file)
        }

        await writeFile(path.join(outsideRoot, 'secret.mjs'), 'secret');
        await symlink(path.join(outsideRoot, 'secret.mjs'), path.join(repoRoot, 'src', 'linked-secret.mjs'));

        resolveAsset = await createHarnessAssetResolver(repoRoot)
    });

    test.afterAll(async () => {
        await rm(repoRoot, {force: true, recursive: true});
        await rm(outsideRoot, {force: true, recursive: true})
    });

    test('accepts only the packaged host and dotfile-free canonical paths', () => {
        expect(parseHarnessUrl('app://neo/apps/agentos/index.html')).toMatchObject({
            ok      : true,
            pathname: '/apps/agentos/index.html'
        });
        expect(parseHarnessUrl('app://evil/apps/agentos/index.html').ok).toBe(false);
        expect(parseHarnessUrl('app://neo/.env').ok).toBe(false);
        expect(parseHarnessUrl('app://neo/%2Egit/config').ok).toBe(false);
        expect(parseHarnessUrl('app://neo/apps/agentos/%5C..%5C.env').ok).toBe(false);
        expect(parseHarnessUrl('app://neo/src/Neo.mjs%3A%24DATA').ok).toBe(false)
    });

    test('limits navigation and popup targets to Agent OS HTML documents', () => {
        expect(isHarnessDocumentUrl('app://neo/apps/agentos/index.html')).toBe(true);
        expect(isHarnessDocumentUrl('app://neo/apps/agentos/design/plan.html?mode=review')).toBe(true);
        expect(isHarnessDocumentUrl('app://neo/apps/agentos/app.mjs')).toBe(false);
        expect(isHarnessDocumentUrl('app://neo/src/Neo.mjs')).toBe(false);
        expect(isHarnessDocumentUrl('https://neo/apps/agentos/index.html')).toBe(false)
    });

    test('defines a restrictive policy with only the named passive-image exception', () => {
        expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
        expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
        expect(CONTENT_SECURITY_POLICY).toContain(
            "img-src 'self' data: https://github.com https://avatars.githubusercontent.com"
        );
        expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
        expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'self' https://")
    });

    test('serves only explicit application source and asset surfaces', async () => {
        for (const url of [
            'app://neo/apps/agentos/index.html',
            'app://neo/dist/development/css/src/Global.css',
            'app://neo/node_modules/@fortawesome/fontawesome-free/css/all.min.css',
            'app://neo/node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2',
            'app://neo/resources/images/logo/neo_logo_primary.svg',
            'app://neo/resources/theme-map.json',
            'app://neo/src/Neo.mjs'
        ]) {
            expect((await resolveAsset(url)).ok, url).toBe(true)
        }

        expect(isAllowedHarnessAssetPath('/ai/config.mjs')).toBe(false);
        expect(isAllowedHarnessAssetPath('/package.json')).toBe(false)
    });

    test('denies repository secrets and unrelated content', async () => {
        for (const url of [
            'app://neo/.env',
            'app://neo/.git/config',
            'app://neo/.codex/config.toml',
            'app://neo/ai/config.mjs',
            'app://neo/package.json'
        ]) {
            expect((await resolveAsset(url)).ok, url).toBe(false)
        }
    });

    test('fails closed for missing files and symlinks escaping the repo root', async () => {
        await expect(resolveAsset('app://neo/src/missing.mjs')).resolves.toMatchObject({
            ok    : false,
            reason: 'missing'
        });
        await expect(resolveAsset('app://neo/src/linked-secret.mjs')).resolves.toMatchObject({
            ok    : false,
            reason: 'containment'
        })
    });
});
