import {test, expect} from '@playwright/test';

import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

import {readDeployedRevision, resetDeployedRevisionCache}
    from '../../../../../../ai/services/shared/deployedRevision.mjs';

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
