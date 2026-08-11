import {expect, test} from '@playwright/test';
import {parse}        from 'acorn';
import {readFileSync} from 'node:fs';

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
    test('the live twin mirrors the live authority: every export is dispositioned and every pair agrees', () => {
        expect(compareFleetVocabulary({authority, twin})).toEqual([])
    });

    test('an unclassified authority-only export fails closed with its namespace and name (#16805)', () => {
        const expandedAuthority = {
            ...authority,
            mcp: {...authority.mcp, UNCLASSIFIED_AUTHORITY_PROBE: true}
        };

        expect(compareFleetVocabulary({authority: expandedAuthority, twin})).toContain(
            'mcp.authority.UNCLASSIFIED_AUTHORITY_PROBE: export is unclassified'
        )
    });

    test('an unclassified twin-only export fails closed with its namespace and name (#16805)', () => {
        const expandedTwin = {
            ...twin,
            harness: {...twin.harness, UNCLASSIFIED_TWIN_PROBE: true}
        };

        expect(compareFleetVocabulary({authority, twin: expandedTwin})).toContain(
            'harness.twin.UNCLASSIFIED_TWIN_PROBE: export is unclassified'
        )
    });

    test('same-named exports on both realms are not silently treated as a registered pair (#16805)', () => {
        const
            expandedAuthority = {
                ...authority,
                wire: {...authority.wire, UNREGISTERED_PAIR_PROBE: {owner: 'authority'}}
            },
            expandedTwin = {
                ...twin,
                wire: {...twin.wire, UNREGISTERED_PAIR_PROBE: {owner: 'twin'}}
            },
            violations = compareFleetVocabulary({authority: expandedAuthority, twin: expandedTwin});

        expect(violations).toContain('wire.authority.UNREGISTERED_PAIR_PROBE: export is unclassified');
        expect(violations).toContain('wire.twin.UNREGISTERED_PAIR_PROBE: export is unclassified')
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
    });

    test('protocol-version and capability drift each redden with the exact surface named', () => {
        const
            versionDrift = compareFleetVocabulary({
                authority,
                twin: {
                    ...twin,
                    wire: {...twin.wire, FLEET_WIRE_PROTOCOL_VERSIONS: [999]}
                }
            }),
            capabilityDrift = compareFleetVocabulary({
                authority,
                twin: {
                    ...twin,
                    wire: {...twin.wire, FLEET_WIRE_CAPABILITIES: [...twin.wire.FLEET_WIRE_CAPABILITIES, 'rogue']}
                }
            });

        expect(versionDrift.join('\n')).toContain('FLEET_WIRE_PROTOCOL_VERSIONS');
        expect(capabilityDrift.join('\n')).toContain('FLEET_WIRE_CAPABILITIES')
    });

    test('the comparator red-proves a wire-inspector fork that accepts version skew', () => {
        const forkedTwin = {
            ...twin,
            wire: {
                ...twin.wire,
                inspectFleetWireResponse: (envelope, offer) => envelope?.protocol?.version === 2
                    ? {ok: true}
                    : twin.wire.inspectFleetWireResponse(envelope, offer)
            }
        };

        expect(compareFleetVocabulary({authority, twin: forkedTwin}).join('\n'))
            .toContain('inspectFleetWireResponse')
    });

    test('the authority selects compatible offers and names both skew classes before dispatch', () => {
        const compatible = authorityWire.selectFleetWireContract(authorityWire.createFleetWireOffer());

        expect(compatible).toEqual({
            ok      : true,
            protocol: authorityWire.createFleetWireProtocolStamp(),
            state   : authorityWire.FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(authorityWire.selectFleetWireContract({
            versions    : [999],
            capabilities: [...authorityWire.FLEET_WIRE_CAPABILITIES]
        }).state).toBe(authorityWire.FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol);
        expect(authorityWire.selectFleetWireContract({
            versions    : [1],
            capabilities: ['method-schema-v1']
        }).state).toBe(authorityWire.FLEET_WIRE_RESPONSE_STATES.unsupportedCapability)
    });

    test('the finite response vocabulary is exhaustive and malformed or unoffered selections fail closed', () => {
        const
            offer  = authorityWire.createFleetWireOffer(),
            states = Object.values(authorityWire.FLEET_WIRE_RESPONSE_STATES);

        expect(new Set(states).size).toBe(states.length);
        expect(states.sort()).toEqual([
            'degraded',
            'ok',
            'operation-failed',
            'refused',
            'unsupported-capability',
            'unsupported-method',
            'unsupported-protocol'
        ]);
        expect(authorityWire.inspectFleetWireResponse(
            authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
            offer
        )).toEqual({ok: true});
        expect(() => authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok))
            .toThrow(/requires a result/);

        for (const envelope of [
            {ok: true, result: []},
            {ok: true, state: 'invented', protocol: authorityWire.createFleetWireProtocolStamp(), result: []},
            {
                ok      : true,
                state   : authorityWire.FLEET_WIRE_RESPONSE_STATES.ok,
                protocol: authorityWire.createFleetWireProtocolStamp()
            },
            authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: authorityWire.createFleetWireProtocolStamp(2),
                result  : []
            }),
            authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: authorityWire.createFleetWireProtocolStamp(1, [...offer.capabilities, 'server-only']),
                result  : []
            }),
            {
                ...authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
                ownerPrincipal: 'must-never-cross'
            },
            {
                ...authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
                protocol: {
                    ...authorityWire.createFleetWireProtocolStamp(),
                    authorization: {admin: true},
                    bearer       : 'must-never-cross'
                }
            },
            {
                ...authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.operationFailed),
                error: 'x'.repeat(301)
            },
            authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.degraded),
            {
                ...authorityWire.createFleetWireResponse(authorityWire.FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
                protocol: authorityWire.createFleetWireProtocolStamp(1, [
                    ...offer.capabilities,
                    offer.capabilities[0]
                ])
            }
        ]) {
            expect(authorityWire.inspectFleetWireResponse(envelope, offer).ok).toBe(false)
        }
    });

    test('the operable-cold app contract imports no ai or server trust authority', () => {
        const sources = [
            ['mcpServers',         new URL('../../../../../../apps/agentos/config/mcpServers.mjs', import.meta.url),        []],
            ['harnessTypes',       new URL('../../../../../../apps/agentos/config/harnessTypes.mjs', import.meta.url),      []],
            ['fleetWireMethods',   new URL('../../../../../../apps/agentos/config/fleetWireMethods.mjs', import.meta.url),  []],
            ['cockpitSources',     new URL('../../../../../../apps/agentos/config/cockpitSources.mjs', import.meta.url),    []],
            ['installFleetBridge', new URL('../../../../../../apps/agentos/fleet/installFleetBridge.mjs', import.meta.url), ['../config/fleetWireMethods.mjs']]
        ];

        for (const [label, url, expectedImports] of sources) {
            const
                ast     = parse(readFileSync(url, 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'}),
                imports = ast.body
                    .filter(node => node.type === 'ImportDeclaration')
                    .map(node => node.source.value);

            expect(imports.every(source => !source.includes('/ai/') &&
                !/fleetIngressAuth|FleetControlBridge|localBearer|Identity|ownership|authorization/i.test(source)), label)
                .toBe(true);
            expect(imports, `${label} must retain its operable-cold import contract`).toEqual(expectedImports)
        }
    })
});
