import fs   from 'fs/promises';
import os   from 'os';
import path from 'path';

import {test, expect} from '@playwright/test';

import {
    appendRestoreTargetSetTransition,
    createRestoreTargetSetReceipt,
    getRestoreTargetSetStateFileName,
    isRestoreTargetSetCommitted,
    readRestoreTargetSetTransitions
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetStateStore.mjs';
import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

const DESCRIPTOR = createRestoreTargetSetDescriptor({
    memoriesCollection            : 'neo-agent-memory',
    summariesCollection           : 'neo-agent-sessions',
    graphDestination              : '/data/graph.sqlite',
    bundleManifestFingerprint     : `sha256:${'a'.repeat(64)}`,
    admissionDescriptorFingerprint: `sha256:${'b'.repeat(64)}`
});
const IDENTITY = deriveRestoreTargetSetIdentity(DESCRIPTOR);

test.describe('restoreTargetSetStateStore', () => {
    let dir;

    test.beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-restore-target-set-state-'));
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('strict-appends the complete semantic chain and opens eligibility only at committed', async () => {
        const states = [
            'admitted',
            'fenced',
            'staged',
            'promoted:memories',
            'promoted:summaries',
            'promoted:graph',
            'validated',
            'committed'
        ];

        for (const [index, state] of states.entries()) {
            const before = await readRestoreTargetSetTransitions({
                dir,
                attemptFingerprint: IDENTITY.attemptFingerprint
            });
            expect(isRestoreTargetSetCommitted(before)).toBe(false);

            await appendRestoreTargetSetTransition({
                ...IDENTITY,
                state,
                at     : 1_000 + index,
                details: {}
            }, {dir});
        }

        const transitions = await readRestoreTargetSetTransitions({
            dir,
            attemptFingerprint: IDENTITY.attemptFingerprint
        });

        expect(transitions.map(entry => entry.state)).toEqual(states);
        expect(transitions.map(entry => entry.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(isRestoreTargetSetCommitted(transitions)).toBe(true);

        expect(createRestoreTargetSetReceipt({
            transitions,
            ...IDENTITY,
            descriptor: DESCRIPTOR
        })).toMatchObject({
            terminal       : 'committed',
            serviceEligible: true,
            wallClockMs    : 7
        });
    });

    test('rejects a skipped transition and never fabricates eligibility', async () => {
        await appendRestoreTargetSetTransition({
            ...IDENTITY,
            state  : 'admitted',
            at     : 1,
            details: {}
        }, {dir});

        await expect(appendRestoreTargetSetTransition({
            ...IDENTITY,
            state  : 'staged',
            at     : 2,
            details: {}
        }, {dir})).rejects.toThrow(/illegal.*admitted -> staged/);

        const transitions = await readRestoreTargetSetTransitions({
            dir,
            attemptFingerprint: IDENTITY.attemptFingerprint
        });
        expect(isRestoreTargetSetCommitted(transitions)).toBe(false);
    });

    test('fails loud on corrupt JSON or identity drift', async () => {
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(
            path.join(dir, getRestoreTargetSetStateFileName(IDENTITY.attemptFingerprint)),
            '{broken\n',
            'utf8'
        );

        await expect(readRestoreTargetSetTransitions({
            dir,
            attemptFingerprint: IDENTITY.attemptFingerprint
        })).rejects.toThrow(/invalid JSON/);
    });

    test('redacts secret-shaped failure detail in the bounded receipt', () => {
        const transitions = [{
            schemaVersion: 1,
            type         : 'restore-target-set-transition',
            ...IDENTITY,
            sequence     : 1,
            previousState: null,
            state        : 'admitted',
            at           : 1,
            details      : {}
        }, {
            schemaVersion: 1,
            type         : 'restore-target-set-transition',
            ...IDENTITY,
            sequence     : 2,
            previousState: 'admitted',
            state        : 'failed-contained',
            at           : 2,
            details      : {}
        }];

        const receipt = createRestoreTargetSetReceipt({
            transitions,
            ...IDENTITY,
            descriptor: DESCRIPTOR,
            failure   : new Error('provider token=super-secret')
        });

        expect(receipt.serviceEligible).toBe(false);
        expect(receipt.failure.message).toBe('provider token=[redacted]');
    });
});
