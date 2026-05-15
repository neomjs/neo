import {setup} from '../../../../../setup.mjs';

const appName = 'ConceptSourceTest';

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

test.describe('Neo.ai.services.knowledge-base.source.ConceptSource', () => {
    let ConceptSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig    = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        ConceptSource = (await import('../../../../../../../ai/services/knowledge-base/source/ConceptSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, `concept-source-mock-${process.pid}-${Date.now()}`);

        const conceptsDir = path.join(mockRoot, 'resources/content/concepts');
        fs.ensureDirSync(conceptsDir);

        fs.writeFileSync(path.join(conceptsDir, 'multi-threading.md'),
`---
name: "Multi-Threading Architecture"
tier: 1
---

Neo.mjs distributes application logic across dedicated Web Workers.`);

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('is a Neo.setupClass singleton with the expected className and extract() method', () => {
        expect(ConceptSource, 'default export must resolve').toBeDefined();
        expect(ConceptSource.className).toBe('Neo.ai.services.knowledge-base.source.ConceptSource');
        expect(typeof ConceptSource.extract).toBe('function');
    });

    test('extract() emits correctly typed and chunked concepts', async () => {
        const written = [];
        const writeStream = {
            write(chunkStr) {
                written.push(JSON.parse(chunkStr.trim()));
                return true;
            }
        };
        const createHashFn = chunk => 'hash:' + chunk.name;

        const count = await ConceptSource.extract(writeStream, createHashFn);

        expect(count).toBe(1);
        expect(written).toHaveLength(1);

        const chunk = written[0];
        expect(chunk).toMatchObject({
            type: 'concept',
            kind: 'concept',
            name: 'Multi-Threading Architecture',
            tier: 1,
            description: 'Neo.mjs distributes application logic across dedicated Web Workers.',
            content: 'Multi-Threading Architecture: Neo.mjs distributes application logic across dedicated Web Workers.'
        });
    });
});
