import {test, expect} from '@playwright/test';

import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

import * as yaml from 'js-yaml';

import {readDeployedRevision} from '../../../../../../ai/services/shared/deployedRevision.mjs';

const SERVERS = [
    'ai/mcp/server/knowledge-base/openapi.yaml',
    'ai/mcp/server/memory-core/openapi.yaml'
];

test.describe('deployedRevision', () => {
    let root;

    test.beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-rev-')) });
    test.afterEach (async () => { await fs.remove(root) });

    test('reports the recorded revision, and the local-build marker survives', async () => {
        const filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, 'c492cd06d1aa1f0b7e4d2c9a8b3f61e5d0a7c412\n');
        expect(readDeployedRevision({filePath})).toBe('c492cd06d1aa1f0b7e4d2c9a8b3f61e5d0a7c412');

        // Not coerced to null: a dev-iteration image must stay distinguishable from an unbuilt one.
        await fs.writeFile(filePath, 'local-build\n');
        expect(readDeployedRevision({filePath})).toBe('local-build');
    });

    test('absent, empty and unreadable give null instead of throwing', async () => {
        const empty = path.join(root, '.neo-revision');

        await fs.writeFile(empty, '   \n');

        // A healthcheck must not fail because provenance was unavailable.
        expect(readDeployedRevision({filePath: path.join(root, 'nope')})).toBeNull();
        expect(readDeployedRevision({filePath: empty})).toBeNull();
        expect(readDeployedRevision({filePath: root})).toBeNull();
    });

    for (const schemaPath of SERVERS) {
        test(`${schemaPath}: declared nullable and required, so absence cannot read as current`, () => {
            const schema = yaml.load(fs.readFileSync(schemaPath, 'utf8')).components.schemas.HealthCheckResponse;

            // Control: a declared sibling, so a typo'd path fails loudly rather than as a regression.
            expect(schema.properties.runtimeFreshness, 'schema path resolved').toBeTruthy();

            expect(schema.properties.deployedRevision).toMatchObject({type: 'string', nullable: true});
            expect(schema.required || []).toContain('deployedRevision');
        });
    }
});
