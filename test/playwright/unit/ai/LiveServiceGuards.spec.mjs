import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'LiveServiceGuardsTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    unitRoot  = path.resolve(__dirname, '..'),
    // A model server answers chat/embedding requests and JIT-LOADS whatever model id it is handed.
    // Chroma's port is deliberately absent: the unit harness starts a run-scoped Chroma on a free
    // port under `UNIT_TEST_MODE`, so reaching Chroma is isolated by construction. Reaching a model
    // server is not — there is one, it belongs to whoever is running the suite, and it has finite RAM.
    MODEL_HOSTS = [':1234', ':11434', ':11435'],
    OPT_IN      = 'NEO_TEST_LIVE_MODELS';

/**
 * @summary No unit spec may drive a real model server unless the runner explicitly opted in.
 *
 * **What this exists to prevent, observed rather than imagined.** A spec set the configured chat
 * model to `gemma-4-31b-it` and pointed the host at `127.0.0.1:1234`, then ran real summarization.
 * A model id in a request is not a fixture — it is a LOAD INSTRUCTION, and LM Studio honours it. So
 * every routine local `npm run test-unit` pulled a ~20 GB dense model into the operator's RAM beside
 * the one already serving production traffic, where a 60-minute idle TTL kept it resident long after
 * the run ended. The suite was choosing the deployment's model policy, and choosing against it.
 *
 * **Why the old guard could not catch it.** These specs carried `test.skip(!!NEO_TEST_SKIP_CI, …)` —
 * skip in CI, run everywhere else. That is inverted: it exempts the machine with nothing to lose and
 * exposes the machine with the models loaded, the real Chroma, and the operator watching. The same
 * shape as skipping on a missing API key, where the condition meaning "unsafe here" is wired as the
 * condition to skip.
 *
 * **Why a source-level assertion.** A behavioural arm cannot express this: the failure mode is a spec
 * doing something to a machine that CI does not have, so CI can never observe it directly. Reading
 * the guard is the only check that runs in the environment which is structurally blind to the defect.
 */
function unitSpecFiles(dir = unitRoot, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            unitSpecFiles(full, out)
        } else if (entry.name.endsWith('.spec.mjs')) {
            out.push(full)
        }
    }

    return out
}

/**
 * @summary Strips comments, so the prose in THIS file's own siblings cannot satisfy or trip a check.
 * @param {String} source
 * @returns {String}
 */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
}

test.describe('no unit spec drives a live model server without an explicit opt-in', () => {
    const files = unitSpecFiles();

    test('the sweep actually found the unit specs — a zero-file sweep proves nothing', () => {
        // Without this, a broken path resolution turns every assertion below into a vacuous pass.
        expect(files.length, 'unit spec discovery returned nothing').toBeGreaterThan(100)
    });

    /**
     * @summary The precise target: the INVERTED guard on a spec that reaches a model host.
     *
     * A first version of this arm flagged every spec merely NAMING a model port, and it reported 18
     * — almost all of them config-assertion specs (`configBase.spec.mjs`, `generateKimiSeatConfig`)
     * that carry the host string as expected data and never open a socket. Forcing an opt-in gate on
     * those would disable real coverage to buy no safety at all, so breadth here is not caution, it
     * is damage.
     *
     * What actually distinguishes a dangerous spec is not that it mentions a host — it is that its
     * author already KNEW it needs a live service and reached for `NEO_TEST_SKIP_CI` to express it.
     * That guard means "skip in CI, run everywhere else", and everywhere else is somebody's laptop
     * with their models loaded. The pair — names a model host AND carries the inverted guard — is
     * the signal, and it is the pair that must not exist.
     */
    test('no spec reaching a model host may use the INVERTED skip-in-CI guard', () => {
        const offenders = [];

        for (const file of files) {
            const source = stripComments(fs.readFileSync(file, 'utf8'));

            if (!MODEL_HOSTS.some(hostPort => source.includes(`127.0.0.1${hostPort}`) ||
                    source.includes(`localhost${hostPort}`))) {
                continue
            }

            if (source.includes('NEO_TEST_SKIP_CI')) {
                offenders.push(path.relative(unitRoot, file))
            }
        }

        expect(offenders,
            'these specs reach a real model server and gate on NEO_TEST_SKIP_CI, which skips in CI ' +
            'and RUNS on the operator machine — backwards. A model id in a request is a load ' +
            `instruction. Gate on ${OPT_IN} instead, or point the spec at the mock server.`
        ).toEqual([])
    });

    test('NON-VACUITY — both halves of the pair are detectable in this tree', () => {
        // An empty offender list must mean "the pair does not occur", not "one half never matches".
        // Asserted separately so a broken matcher names WHICH half went blind.
        let namesHost       = 0,
            usesLegacyGuard = 0;

        for (const file of files) {
            const source = stripComments(fs.readFileSync(file, 'utf8'));

            if (MODEL_HOSTS.some(hostPort => source.includes(`127.0.0.1${hostPort}`))) namesHost++;
            if (source.includes('NEO_TEST_SKIP_CI'))                                   usesLegacyGuard++
        }

        expect(namesHost, 'no spec matched the model-host pattern — that half of the matcher is broken')
            .toBeGreaterThan(0);
        expect(usesLegacyGuard, 'no spec matched the legacy guard — that half of the matcher is broken')
            .toBeGreaterThan(0)
    })
});
