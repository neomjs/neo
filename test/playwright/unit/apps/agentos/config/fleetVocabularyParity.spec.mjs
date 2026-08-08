import {expect, test} from '@playwright/test';

import {compareFleetVocabulary} from '../../../../../../ai/scripts/lint/lint-fleet-vocabulary-parity.mjs';

import * as authorityCockpit from '../../../../../../ai/services/fleet/fleetCockpitStatus.mjs';
import * as authorityHarness from '../../../../../../ai/services/fleet/harnessTypes.mjs';
import * as authorityMcp     from '../../../../../../ai/services/fleet/mcpServers.mjs';
import * as authorityWire    from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';

import * as twinHarness from '../../../../../../apps/agentos/config/harnessTypes.mjs';
import * as twinMcp     from '../../../../../../apps/agentos/config/mcpServers.mjs';
import * as twinSources from '../../../../../../apps/agentos/config/cockpitSources.mjs';
import * as twinWire    from '../../../../../../apps/agentos/config/fleetWireMethods.mjs';

const
    authority = {mcp: authorityMcp, harness: authorityHarness, wire: authorityWire, cockpit: authorityCockpit},
    twin      = {mcp: twinMcp, harness: twinHarness, wire: twinWire, sources: twinSources};

test.describe('FM vocabulary parity — the realm boundary carries no imports, so the lint is the binding', () => {
    test('the live twin mirrors the live authority: every constant, every shared helper outcome', () => {
        expect(compareFleetVocabulary({authority, twin})).toEqual([])
    });

    test('the comparator is not a rubber stamp: an induced data drift reddens with the surface named', () => {
        // The permanent red-proof: a twin whose catalog gained an unmirrored server MUST fail, and
        // the violation names the drifted surface — the exact defect class the dissolution's
        // duplicated vocabulary would otherwise admit silently.
        const driftedTwin = {
            ...twin,
            mcp: {
                ...twin.mcp,
                MCP_SERVERS: [...twin.mcp.MCP_SERVERS, {key: 'rogue-server', label: 'Rogue', core: false, defaultEnabled: true}]
            }
        };

        const violations = compareFleetVocabulary({authority, twin: driftedTwin});

        expect(violations.length).toBeGreaterThan(0);
        expect(violations.join('\n')).toContain('MCP_SERVERS')
    });

    test('the comparator is behavior-sensitive: a helper logic fork reddens even with identical data', () => {
        // A twin that "helpfully" truthy-coerces legacy override values (the exact fail-closed
        // rule resolveMcpMatrix exists to enforce) diverges on the fixture, not on the data.
        const forkedTwin = {
            ...twin,
            mcp: {
                ...twin.mcp,
                resolveMcpMatrix: (overrides, catalog = twin.mcp.MCP_SERVERS) => {
                    const matrix = twin.mcp.defaultMcpMatrix(catalog);

                    Object.entries(overrides || {}).forEach(([key, enabled]) => {
                        if (key in matrix) {
                            matrix[key] = !!enabled
                        }
                    });

                    return matrix
                }
            }
        };

        const violations = compareFleetVocabulary({authority, twin: forkedTwin});

        expect(violations.join('\n')).toContain('resolveMcpMatrix')
    })
});
