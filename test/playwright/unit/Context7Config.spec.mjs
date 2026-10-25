import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';

test.describe('root context7.json configuration', () => {
    test('adheres to the Context7 schema contract, matches package.json description, and references existing folders', async () => {
        const repoRoot     = process.cwd();
        const configPath   = path.join(repoRoot, 'context7.json');
        const pkgPath      = path.join(repoRoot, 'package.json');
        const context7Conf = await fs.readJSON(configPath);
        const pkg          = await fs.readJSON(pkgPath);

        const allowedKeys = new Set([
            '$schema',
            'projectTitle',
            'description',
            'branch',
            'folders',
            'excludeFolders',
            'excludeFiles',
            'rules',
            'disallow',
            'redirect',
            'previousVersions',
            'url',
            'public_key'
        ]);

        for (const key of Object.keys(context7Conf)) {
            expect(allowedKeys.has(key)).toBe(true);
        }

        expect(context7Conf.$schema).toBe('https://context7.com/schema/context7.json');
        expect(context7Conf.projectTitle).toBe('Neo.mjs');
        expect(context7Conf.description).toBe(pkg.description);
        expect(context7Conf.description.length).toBeGreaterThanOrEqual(10);
        expect(context7Conf.description.length).toBeLessThanOrEqual(500);
        expect(context7Conf.branch).toBe('dev');

        expect(Array.isArray(context7Conf.folders)).toBe(true);
        expect(context7Conf.folders).toEqual(['learn', 'examples']);
        for (const folder of context7Conf.folders) {
            expect(await fs.pathExists(path.join(repoRoot, folder))).toBe(true);
        }

        expect(Array.isArray(context7Conf.excludeFolders)).toBe(true);
        expect(context7Conf.excludeFolders.length).toBeLessThanOrEqual(50);
        expect(context7Conf.excludeFolders).not.toContain('ai');

        expect(Array.isArray(context7Conf.excludeFiles)).toBe(true);
        expect(context7Conf.excludeFiles.length).toBeLessThanOrEqual(100);
        for (const fileName of context7Conf.excludeFiles) {
            expect(/^[^/\\]+$/.test(fileName)).toBe(true);
        }

        expect(Array.isArray(context7Conf.rules)).toBe(true);
        expect(context7Conf.rules.length).toBeGreaterThan(0);
        expect(context7Conf.rules.length).toBeLessThanOrEqual(50);
        for (const rule of context7Conf.rules) {
            expect(rule.length).toBeGreaterThanOrEqual(1);
            expect(rule.length).toBeLessThanOrEqual(255);
        }
    });
});
