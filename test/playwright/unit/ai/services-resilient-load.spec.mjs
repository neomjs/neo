import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ServicesResilientLoadTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

import Neo from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';
import {safeLoadYaml, makeSafe} from '../../../../ai/services.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scratchDir = path.join(__dirname, 'scratch');

test.describe('Neo.ai.services resilient eager-loading', () => {
    test.beforeAll(() => {
        if (!fs.existsSync(scratchDir)) {
            fs.mkdirSync(scratchDir, { recursive: true });
        }
    });

    test.afterAll(() => {
        if (fs.existsSync(scratchDir)) {
            fs.rmSync(scratchDir, { recursive: true, force: true });
        }
    });

    test('safeLoadYaml gracefully handles malformed YAML', async () => {
        const badYamlPath = path.join(scratchDir, 'bad.yaml');
        fs.writeFileSync(badYamlPath, 'this: is: invalid: yaml: [', 'utf8');

        // Should not throw, should return null
        const result = safeLoadYaml(badYamlPath);
        expect(result).toBeNull();
    });

    test('safeLoadYaml gracefully handles missing file', async () => {
        const missingPath = path.join(scratchDir, 'missing.yaml');
        
        // Should not throw, should return null
        const result = safeLoadYaml(missingPath);
        expect(result).toBeNull();
    });

    test('makeSafe degrades gracefully when spec is null', async () => {
        class MockService {
            doThing() {
                return 'done';
            }
        }
        const service = new MockService();
        
        // Wrap with null spec
        const safeService = makeSafe(service, null);
        
        // Should return the original service unmodified
        expect(safeService).toBe(service);
        expect(safeService.doThing()).toBe('done');
    });
});
