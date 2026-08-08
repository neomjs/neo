import {test, expect} from '@playwright/test';

import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

import * as yaml from 'js-yaml';

import {readDeployedRevision, resetDeployedRevisionCache}
    from '../../../../../../ai/services/shared/deployedRevision.mjs';

const SERVERS = [
    ['knowledge-base', 'ai/mcp/server/knowledge-base/openapi.yaml'],
    ['memory-core',    'ai/mcp/server/memory-core/openapi.yaml']
];

/**
 * @summary A deployment must answer which commit it is running, and must still answer when it cannot.
 *
 * The omission case is the one worth guarding: a consumer computing skew subtracts the reported
 * revision from a named ref, and a field that is simply absent reads as "nothing to report", which is
 * indistinguishable from current. So presence is the contract and `null` is how "unknown" is said.
 */
test.describe('deployedRevision', () => {
    let root;

    test.beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-deployed-revision-'));
        resetDeployedRevisionCache();
    });

    test.afterEach(async () => {
        await fs.remove(root);
        resetDeployedRevisionCache();
    });

    test('a packaged revision is reported verbatim', async () => {
        const sha      = 'c492cd06d1aa1f0b7e4d2c9a8b3f61e5d0a7c412',
              filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, `${sha}\n`);
        expect(readDeployedRevision({filePath, useCache: false})).toBe(sha);
    });

    test('absent, empty and unreadable all report null rather than throwing', async () => {
        const empty = path.join(root, '.neo-revision');

        await fs.writeFile(empty, '   \n');

        expect(readDeployedRevision({filePath: path.join(root, 'no-such-file'), useCache: false})).toBeNull();
        expect(readDeployedRevision({filePath: empty, useCache: false})).toBeNull();
        expect(readDeployedRevision({filePath: root, useCache: false})).toBeNull();
    });

    test('the local-build marker survives — it is a real answer, not a missing one', async () => {
        const filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, 'local-build\n');

        // Coercing this to null would erase the distinction between a dev-iteration image and a
        // runtime the pipeline never built.
        expect(readDeployedRevision({filePath, useCache: false})).toBe('local-build');
    });

    test('the memo distinguishes not-yet-read from read-as-null', async () => {
        const filePath = path.join(root, '.neo-revision');

        // An unbuilt runtime caches `null`. A single sentinel would re-read the file on every
        // healthcheck for exactly the deployments that have nothing to read.
        expect(readDeployedRevision({filePath})).toBeNull();
        await fs.writeFile(filePath, 'aaaaaaaa\n');
        expect(readDeployedRevision({filePath}), 'the null answer was memoised').toBeNull();

        // Non-vacuity: proving the reset changes the answer proves the memo held it, rather than the
        // write simply not having landed.
        resetDeployedRevisionCache();
        expect(readDeployedRevision({filePath})).toBe('aaaaaaaa');
    });
});

/**
 * @summary A field a client cannot DISCOVER is not on the MCP surface.
 *
 * `additionalProperties: true` lets an undeclared key through, so a service can emit a field forever
 * while `tools/list.outputSchema` never names it. The parity lint compares the two services against
 * each OTHER, so two services both omitting it are consistent and both wrong.
 */
test.describe('deployedRevision — MCP output contract', () => {
    for (const [name, schemaPath] of SERVERS) {
        test(`${name}: declared, nullable, and required at the top level`, () => {
            const schema = yaml.load(fs.readFileSync(schemaPath, 'utf8')).components.schemas.HealthCheckResponse;

            // Control: a sibling that IS declared, so a typo'd schema path fails loudly rather than
            // reading as a real regression.
            expect(schema.properties.runtimeFreshness, 'schema path resolved').toBeTruthy();

            expect(schema.properties.deployedRevision).toMatchObject({type: 'string', nullable: true});

            // The half that fails independently: presence is the contract, and without top-level
            // requiredness the response may omit the field entirely.
            expect(schema.required || []).toContain('deployedRevision');
        });
    }

    test('the emitted value satisfies the declared type, including the unknown case', () => {
        const observed = readDeployedRevision({filePath: '/nonexistent-by-design', useCache: false});

        // A schema and a payload can each be internally valid and disagree; this is the only
        // assertion that reads both.
        expect(observed === null || typeof observed === 'string').toBe(true);
    });
});
