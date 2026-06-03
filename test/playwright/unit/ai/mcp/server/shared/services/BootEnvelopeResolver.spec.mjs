import {setup} from '../../../../../../setup.mjs';

const appName = 'BootEnvelopeResolverTest';

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

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../../src/core/_export.mjs';
import BootEnvelopeResolver from '../../../../../../../../ai/mcp/server/shared/services/BootEnvelopeResolver.mjs';

/**
 * @summary Unit coverage for `BootEnvelopeResolver.resolveOverrideMetadata`.
 *
 * The resolver maps the boot instance-address envelope (`NEO_HARNESS_INSTANCE_ADDRESS` +
 * `NEO_HARNESS_INSTANCE_ADDRESS_TYPE`) into wake-subscription `overrideMetadata`. The critical
 * behaviors: a fully-omitted envelope is the default instance (null, routed by absence); a complete
 * `userDataDir` envelope yields the address override the bridge daemon reads; and every degenerate
 * shape (partial config, unknown type, recognized-but-not-yet-dispatchable type) fails closed so a
 * non-default instance can never silently fall back to the default route and misroute its wakes.
 */

test.describe('Neo.ai.mcp.server.shared.services.BootEnvelopeResolver (#12418)', () => {
    const NEO_DIR = '/Users/example/.claude-instances/Neo';

    test('default instance — neither env var set returns null (routed by absence)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({})).toBeNull();
    });

    test('empty-string env vars are treated as absent (default instance)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : '',
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: '   '
        })).toBeNull();
    });

    test('userDataDir envelope yields the address override the daemon reads', () => {
        const result = BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : NEO_DIR,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
        });

        expect(result).toEqual({
            instanceAddress: NEO_DIR,
            addressType    : 'userDataDir',
            userDataDir    : NEO_DIR
        });
    });

    test('trims surrounding whitespace on both fields', () => {
        const result = BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : `  ${NEO_DIR}  `,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: '  userDataDir  '
        });

        expect(result).toEqual({
            instanceAddress: NEO_DIR,
            addressType    : 'userDataDir',
            userDataDir    : NEO_DIR
        });
    });

    test('fails closed on a partial envelope — address without type', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS: NEO_DIR
        })).toThrow(/Partial boot envelope/);
    });

    test('fails closed on a partial envelope — type without address', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
        })).toThrow(/Partial boot envelope/);
    });

    test('rejects an unrecognized address type', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : NEO_DIR,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'frontmost'
        })).toThrow(/Invalid NEO_HARNESS_INSTANCE_ADDRESS_TYPE/);
    });

    test('fails closed on a recognized-but-not-yet-dispatchable type (pid)', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : '20001',
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'pid'
        })).toThrow(/not yet implemented/);
    });

    test('fails closed on the remaining reserved types (tmuxSession, webhookUrl)', () => {
        for (const addressType of ['tmuxSession', 'webhookUrl']) {
            expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
                NEO_HARNESS_INSTANCE_ADDRESS     : 'reserved-value',
                NEO_HARNESS_INSTANCE_ADDRESS_TYPE: addressType
            })).toThrow(/not yet implemented/);
        }
    });

    test('reads from process.env by default', () => {
        const prevAddress = process.env.NEO_HARNESS_INSTANCE_ADDRESS,
              prevType    = process.env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE;

        try {
            process.env.NEO_HARNESS_INSTANCE_ADDRESS      = NEO_DIR;
            process.env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE = 'userDataDir';

            expect(BootEnvelopeResolver.resolveOverrideMetadata()).toEqual({
                instanceAddress: NEO_DIR,
                addressType    : 'userDataDir',
                userDataDir    : NEO_DIR
            });
        } finally {
            if (prevAddress === undefined) delete process.env.NEO_HARNESS_INSTANCE_ADDRESS;
            else                           process.env.NEO_HARNESS_INSTANCE_ADDRESS = prevAddress;

            if (prevType === undefined) delete process.env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE;
            else                        process.env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE = prevType;
        }
    });

    test('validAddressTypes documents the graduated address-kind set', () => {
        expect(BootEnvelopeResolver.validAddressTypes).toEqual(['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']);
        expect(BootEnvelopeResolver.dispatchableAddressTypes).toEqual(['userDataDir']);
    });
});
