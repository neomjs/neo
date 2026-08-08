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
 * @summary A deployment must be able to answer which commit it is running, and must say so even when
 * it cannot.
 *
 * The packaged revision is written by the image's source stage into `.neo-revision`; the
 * `NEO_REVISION` build arg is an operator assertion that no runtime code reads and that is empty by
 * default. These specs pin the read side: the value when a build wrote one, and — the case that
 * matters more — an explicit `unknown` when none did.
 *
 * The omission case is the one worth guarding. A consumer computing deployment skew subtracts the
 * reported revision from a named ref; a field that is simply absent reads as "nothing to report",
 * which is indistinguishable from current. So every assertion below checks that the key EXISTS
 * before checking what it holds — an assertion on a missing key would pass for the wrong reason.
 */

/**
 * @summary The output contract, not just the payload — a field a client cannot DISCOVER is not on the
 * MCP surface.
 *
 * `additionalProperties: true` lets an undeclared runtime key through without rejection, so a service can
 * emit a field indefinitely while `tools/list.outputSchema` never names it and no schema-driven consumer
 * learns it exists. The parity lint cannot catch that: it compares the two service schemas against **each
 * other**, so two services that both omit a field are perfectly consistent and both wrong.
 *
 * Top-level requiredness is asserted separately from the nested shape because they fail independently —
 * `required: [revision, source]` constrains the object only once it EXISTS, and the whole point of this
 * field is that absence is never a valid answer.
 *
 * Caught by @neo-gpt across two review cycles; this spec is the permanent witness he asked for, because
 * the first repair was verified once by hand and nothing kept it verified.
 */
test.describe('deployedRevision — MCP output contract (#16568)', () => {
    for (const [name, path] of SERVERS) {
        test(`${name}: HealthCheckResponse declares deployedRevision and requires it at top level`, () => {
            const
                doc    = yaml.load(fs.readFileSync(path, 'utf8')),
                schema = doc.components.schemas.HealthCheckResponse,
                props  = schema.properties || {},
                field  = props.deployedRevision;

            // Control: a sibling that IS declared. Without it a typo'd schema path would fail every
            // assertion below for the wrong reason and read as a real regression.
            expect(props.runtimeFreshness, 'schema path resolved').toBeTruthy();

            expect(field, 'deployedRevision declared').toBeTruthy();
            expect(field.properties.source.enum.sort()).toEqual(['packaged', 'unknown']);
            expect([...(field.required || [])].sort()).toEqual(['revision', 'source']);

            // The half that fails independently: the object's own contract says nothing about whether the
            // response must carry it.
            expect(schema.required || [], 'deployedRevision required at top level').toContain('deployedRevision');
        });
    }

    test('the emitted shape satisfies the declared contract, including the unknown case', () => {
        const observed = readDeployedRevision({filePath: '/nonexistent-by-design', useCache: false});

        for (const [name, path] of SERVERS) {
            const field = yaml.load(fs.readFileSync(path, 'utf8'))
                .components.schemas.HealthCheckResponse.properties.deployedRevision;

            // A schema and a payload can each be internally valid and disagree. This is the only assertion
            // that reads both.
            expect(Object.keys(observed).sort(), `${name}: emitted keys match declared required`)
                .toEqual([...field.required].sort());
            expect(field.properties.source.enum, `${name}: emitted source is a declared enum member`)
                .toContain(observed.source);
        }
    });
});

test.describe('deployedRevision (#16568)', () => {
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
        const
            sha      = 'c492cd06d1aa1f0b7e4d2c9a8b3f61e5d0a7c412',
            filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, `${sha}\n`);

        const observed = readDeployedRevision({filePath, useCache: false});

        expect(Object.keys(observed)).toContain('revision');
        expect(observed.revision).toBe(sha);
        expect(observed.source).toBe('packaged');
    });

    test('an absent file reports unknown rather than throwing or omitting the field', async () => {
        const observed = readDeployedRevision({
            filePath: path.join(root, 'no-such-file'),
            useCache: false
        });

        // Key presence first: an assertion on a missing key would pass for the wrong reason, and this
        // is the exact shape a skew consumer must be able to distinguish from "current".
        expect(Object.keys(observed)).toContain('revision');
        expect(Object.keys(observed)).toContain('source');
        expect(observed.source).toBe('unknown');
        expect(observed.revision).toBeNull();
    });

    test('an empty file is unknown, not an empty-string revision', async () => {
        const filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, '   \n');

        const observed = readDeployedRevision({filePath, useCache: false});

        expect(observed.source).toBe('unknown');
        expect(observed.revision).toBeNull();
    });

    test('the local-build marker survives — it is a real answer, not a missing one', async () => {
        const filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, 'local-build\n');

        const observed = readDeployedRevision({filePath, useCache: false});

        // Coercing this to `unknown` would erase the distinction between a dev-iteration image and a
        // runtime that was never built by the pipeline at all.
        expect(observed.revision).toBe('local-build');
        expect(observed.source).toBe('packaged');
    });

    test('the value is memoised per process, and the memo is what the seam resets', async () => {
        const filePath = path.join(root, '.neo-revision');

        await fs.writeFile(filePath, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
        expect(readDeployedRevision({filePath}).revision).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

        // A running container's packaged revision cannot change, so a second read must not pay for
        // another syscall on the hottest endpoint we serve.
        await fs.writeFile(filePath, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
        expect(readDeployedRevision({filePath}).revision).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

        // Non-vacuity control: if the memo were not in play, the assertion above would pass simply
        // because the write did not land. Proving the reset changes the answer proves the memo was
        // what held it.
        resetDeployedRevisionCache();
        expect(readDeployedRevision({filePath}).revision).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });
});
