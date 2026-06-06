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
 * `userDataDir` envelope yields the generic address override the wake daemon reads; and every
 * degenerate shape (partial config, unknown type) fails closed so a non-default instance can never
 * silently fall back to the default route and misroute its wakes.
 */

test.describe('Neo.ai.mcp.server.shared.services.BootEnvelopeResolver (#12418)', () => {
    const NEO_DIR     = '/Users/example/.claude-instances/Neo';
    const DEFAULT_DIR = '/Users/example/Library/Application Support/Claude';
    const PS_ELECTRON_PARENT_CHAIN = [
        `90001 20005 /Users/example/.nvm/versions/node/v22/bin/node /Users/example/neo/ai/mcp/server/memory-core/main.mjs`,
        `20005 20001 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer --user-data-dir=${NEO_DIR} --app-path=/x`,
        `20001 1 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=${NEO_DIR}`,
        `13106 1 /Applications/Claude.app/Contents/MacOS/Claude`,
        `13119 13106 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=gpu-process --user-data-dir=${DEFAULT_DIR} --gpu-preferences=xyz`
    ].join('\n');

    test('default instance — neither env var set returns null (routed by absence)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({}, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: '90001 1 /usr/local/bin/node /tmp/server.mjs'
        })).toBeNull();
    });

    test('empty-string env vars are treated as absent (default instance)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : '',
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: '   '
        })).toBeNull();
    });

    test('userDataDir envelope yields the generic address override the daemon reads', () => {
        const result = BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : NEO_DIR,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
        }, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        });

        expect(result).toEqual({
            instanceAddress: NEO_DIR,
            addressType    : 'userDataDir'
        });
    });

    test('trims surrounding whitespace on both fields', () => {
        const result = BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : `  ${NEO_DIR}  `,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: '  userDataDir  '
        });

        expect(result).toEqual({
            instanceAddress: NEO_DIR,
            addressType    : 'userDataDir'
        });
    });

    test('fails closed on a partial envelope — address without type', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS: NEO_DIR
        }, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        })).toThrow(/Partial boot envelope/);
    });

    test('fails closed on a partial envelope — type without address', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
        }, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        })).toThrow(/Partial boot envelope/);
    });

    test('rejects an unrecognized address type', () => {
        expect(() => BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : NEO_DIR,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'frontmost'
        })).toThrow(/Invalid NEO_HARNESS_INSTANCE_ADDRESS_TYPE/);
    });

    test('pid envelope yields the generic address override', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : '20001',
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'pid'
        })).toEqual({
            instanceAddress: '20001',
            addressType    : 'pid'
        });
    });

    test('remaining graduated address types yield generic address overrides', () => {
        for (const addressType of ['tmuxSession', 'webhookUrl']) {
            expect(BootEnvelopeResolver.resolveOverrideMetadata({
                NEO_HARNESS_INSTANCE_ADDRESS     : 'reserved-value',
                NEO_HARNESS_INSTANCE_ADDRESS_TYPE: addressType
            })).toEqual({
                instanceAddress: 'reserved-value',
                addressType
            });
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
                addressType    : 'userDataDir'
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
        expect(BootEnvelopeResolver.dispatchableAddressTypes).toEqual(['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']);
    });

    test('fallback discovers userDataDir from macOS Electron helper→main parent chain (#12419)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({}, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        })).toEqual({
            instanceAddress: NEO_DIR,
            addressType    : 'userDataDir'
        });
    });

    test('fallback never overrides an explicit envelope value (#12419)', () => {
        const explicitDir = '/Users/example/.claude-instances/Explicit';

        expect(BootEnvelopeResolver.resolveOverrideMetadata({
            NEO_HARNESS_INSTANCE_ADDRESS     : explicitDir,
            NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
        }, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        })).toEqual({
            instanceAddress: explicitDir,
            addressType    : 'userDataDir'
        });
    });

    test('fallback no-ops outside macOS / Electron parent chains (#12419)', () => {
        expect(BootEnvelopeResolver.resolveOverrideMetadata({}, {
            bootPid : 90001,
            platform: 'linux',
            psOutput: PS_ELECTRON_PARENT_CHAIN
        })).toBeNull();

        expect(BootEnvelopeResolver.resolveOverrideMetadata({}, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: [
                '90001 42 /usr/local/bin/node /Users/example/neo/ai/mcp/server/memory-core/main.mjs',
                '42 1 /usr/bin/tmux new-session'
            ].join('\n')
        })).toBeNull();
    });

    test('fallback fails closed when discovered userDataDir cannot map to a main pid (#12419)', () => {
        const helperOnlySnapshot = [
            `90001 20005 /Users/example/.nvm/versions/node/v22/bin/node /Users/example/neo/ai/mcp/server/memory-core/main.mjs`,
            `20005 20001 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer --user-data-dir=${NEO_DIR} --app-path=/x`
        ].join('\n');

        expect(BootEnvelopeResolver.resolveOverrideMetadata({}, {
            bootPid : 90001,
            platform: 'darwin',
            psOutput: helperOnlySnapshot
        })).toBeNull();
    });
});
