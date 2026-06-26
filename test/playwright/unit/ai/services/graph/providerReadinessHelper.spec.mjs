import {setup} from '../../../../setup.mjs';

const appName = 'ProviderReadinessHelperTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import os             from 'os';
import path           from 'path';

// Pure helper (no I/O) — imported dynamically after the Neo bootstrap (the module's import chain
// references Neo at load). It guarantees LM Studio's CLI bin dir (~/.lmstudio/bin) is on the
// execFile PATH, so the readiness probe no longer reports a healthy provider as unavailable when
// the daemon/MCP-server launch env lacks that dir (the bare-`lms` spawn ENOENT false-negative).

const LMS_BIN = path.join(os.homedir(), '.lmstudio', 'bin');
const SEP     = process.platform === 'win32' ? ';' : ':';

test.describe('lmsExecOptions — embedding-readiness PATH fix', () => {
    let lmsExecOptions;

    test.beforeAll(async () => {
        lmsExecOptions = (await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs')).lmsExecOptions;
    });

    test('augments PATH with the LM Studio bin dir', () => {
        const opts = lmsExecOptions();
        expect(opts.env.PATH.split(SEP)).toContain(LMS_BIN);
    });

    test('merges extra options (e.g. timeout) alongside the augmented env', () => {
        const opts = lmsExecOptions({timeout: 5000});
        expect(opts.timeout).toBe(5000);
        expect(opts.env.PATH.split(SEP)).toContain(LMS_BIN);
    });

    test('preserves every pre-existing PATH entry', () => {
        const opts = lmsExecOptions();
        for (const entry of (process.env.PATH || '').split(SEP).filter(Boolean)) {
            expect(opts.env.PATH.split(SEP)).toContain(entry);
        }
    });

    test('is idempotent — does not duplicate the bin dir when already on PATH', () => {
        const origPath = process.env.PATH;
        try {
            process.env.PATH  = `${LMS_BIN}${SEP}/usr/bin`;
            const opts        = lmsExecOptions();
            const occurrences = opts.env.PATH.split(SEP).filter(p => p === LMS_BIN).length;
            expect(occurrences).toBe(1);
        } finally {
            process.env.PATH = origPath;
        }
    });

    test('preserves a caller-supplied extra.env (merges, does not clobber) + augments its PATH', () => {
        const opts    = lmsExecOptions({timeout: 99, env: {FOO: 'bar', PATH: '/custom/bin'}});
        const entries = opts.env.PATH.split(SEP);
        expect(opts.timeout).toBe(99);   // extra options preserved
        expect(opts.env.FOO).toBe('bar'); // caller env preserved (not clobbered)
        expect(entries).toContain('/custom/bin'); // caller PATH preserved
        expect(entries).toContain(LMS_BIN);       // lms bin dir augmented onto the caller PATH
    });
});
