import {setup} from '../../../../../setup.mjs';

const appName = 'RawRepoSourceTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import aiConfig        from '../../../../../../../ai/mcp/server/knowledge-base/config.mjs';
import RawRepoSource   from '../../../../../../../ai/services/knowledge-base/source/RawRepoSource.mjs';

/**
 * @summary Unit coverage for the explicit raw repository Source fallback added by #12029.
 */
test.describe('Neo.ai.services.knowledge-base.source.RawRepoSource (#12029)', () => {
    let originalNeoRootDir, originalSourcePaths, tempDir;

    test.beforeEach(async () => {
        originalNeoRootDir = aiConfig.neoRootDir;
        originalSourcePaths = aiConfig.sourcePaths;
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-raw-repo-source-'));

        await fs.outputFile(path.join(tempDir, 'repo/README.md'), '# Tenant Repo\n');
        await fs.outputFile(path.join(tempDir, 'repo/src/index.js'), 'export const value = 42;\n');
        await fs.outputFile(path.join(tempDir, 'repo/dist/bundle.js'), 'generated\n');
        await fs.outputFile(path.join(tempDir, 'repo/docs/output/all.json'), '{}\n');
        await fs.outputFile(path.join(tempDir, 'repo/node_modules/pkg/index.js'), 'dependency\n');
        await fs.outputFile(path.join(tempDir, 'repo/package-lock.json'), '{}\n');
        await fs.outputFile(path.join(tempDir, 'repo/resources/images/logo.png'), 'not really png\n');
        await fs.outputFile(path.join(tempDir, 'repo/assets/logo.png'), 'not really png\n');

        aiConfig.neoRootDir = tempDir;
        aiConfig.sourcePaths = {
            RawRepoSource: {
                root: 'repo'
            }
        };
    });

    test.afterEach(async () => {
        aiConfig.neoRootDir = originalNeoRootDir;
        aiConfig.sourcePaths = originalSourcePaths;
        await fs.remove(tempDir);
    });

    test('emits one raw-text parsed chunk per included file and skips generated/binary defaults', async () => {
        const chunks = [],
              stream = {write: line => chunks.push(JSON.parse(line))};

        const count = await RawRepoSource.extract(stream, chunk => `hash:${chunk.sourcePath}`);

        expect(count).toBe(2);
        expect(chunks.map(chunk => chunk.sourcePath)).toEqual([
            'repo/README.md',
            'repo/src/index.js'
        ]);
        expect(chunks[0]).toMatchObject({
            schemaVersion: '1.0.0',
            parserId     : 'raw-text',
            parserVersion: '1.0.0',
            rootKind     : 'external-source',
            kind         : 'doc-section',
            type         : 'raw',
            name         : 'repo/README.md',
            source       : 'repo/README.md',
            hash         : 'hash:repo/README.md'
        });
    });

    test('includeExtensions narrows the raw fallback to an explicit allowlist', async () => {
        aiConfig.sourcePaths.RawRepoSource = {
            root             : 'repo',
            includeExtensions: ['md']
        };

        const chunks = [],
              stream = {write: line => chunks.push(JSON.parse(line))};

        const count = await RawRepoSource.extract(stream, chunk => `hash:${chunk.sourcePath}`);

        expect(count).toBe(1);
        expect(chunks[0].sourcePath).toBe('repo/README.md');
    });
});
