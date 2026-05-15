import {setup} from '../../../../../setup.mjs';

const appName = 'AdrSourceTest';

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
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Neo.ai.services.knowledge-base.source.AdrSource', () => {
    let AdrSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig    = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        AdrSource = (await import('../../../../../../../ai/services/knowledge-base/source/AdrSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, `adr-source-mock-${process.pid}-${Date.now()}`);

        const adrDir = path.join(mockRoot, 'learn/agentos/decisions');
        fs.ensureDirSync(adrDir);

        fs.writeFileSync(path.join(adrDir, '0001-example-adr.md'),
`# ADR 1
Example decision.`);

        fs.writeFileSync(path.join(adrDir, 'not-an-adr.md'),
`# Not an ADR
This should be skipped.`);

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('is a Neo.setupClass singleton with the expected className and extract() method', () => {
        expect(AdrSource, 'default export must resolve').toBeDefined();
        expect(AdrSource.className).toBe('Neo.ai.services.knowledge-base.source.AdrSource');
        expect(typeof AdrSource.extract).toBe('function');
    });

    test('extract() emits correctly typed and chunked ADRs, skipping non-matching files', async () => {
        const written = [];
        const writeStream = {
            write(chunkStr) {
                written.push(JSON.parse(chunkStr.trim()));
                return true;
            }
        };
        const createHashFn = chunk => 'hash:' + chunk.name;

        const count = await AdrSource.extract(writeStream, createHashFn);

        expect(count).toBe(1);
        expect(written).toHaveLength(1);

        const chunk = written[0];
        expect(chunk).toMatchObject({
            type: 'adr',
            kind: 'adr',
            name: '0001-example-adr',
            content: '# ADR 1\nExample decision.'
        });
    });
});
