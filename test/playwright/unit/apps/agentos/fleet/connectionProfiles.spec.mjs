import {expect, test} from '@playwright/test';

import {normalizeSecureMcpEndpoint} from '../../../../../../ai/services/fleet/mcpWireParsing.mjs';

import {
    assertStorableProfileRecord,
    createCustodyMigration,
    createFleetProfile,
    CUSTODIAN_STORABLE_CREDENTIAL_FIELDS,
    CUSTODY_MIGRATION_PHASES,
    deriveFleetProfileId,
    FLEET_BEARER_PATTERN,
    FLEET_PROFILE_CONTRACT_VERSION,
    isStaleProfile,
    normalizeFleetEndpoint,
    PROFILE_CUSTODIANS,
    PROFILE_FORBIDDEN_CREDENTIAL_FIELDS,
    PROFILE_FORBIDDEN_IDENTITY_KEYS,
    rehydrateProfile,
    retireBearerIngressSlot
} from '../../../../../../apps/agentos/fleet/connectionProfiles.mjs';

// connectionProfiles.mjs is the pure client-side profile contract: identity from ONE versioned
// endpoint-normalization policy (the twin of the Node side's normalizeSecureMcpEndpoint), a closed
// record schema that refuses credential material, and the explicit custody-migration machine. The
// realm boundary carries no imports, so THIS spec is the binding between twin and authority.

const
    loopbackFleet = 'http://127.0.0.1:8083/fleet',
    testBearer    = 'A'.repeat(43), // canonical FORMAT only — the Node side owns real verification
    validRecord   = overrides => ({
        canonicalEndpoint: loopbackFleet,
        contractVersion  : FLEET_PROFILE_CONTRACT_VERSION,
        custodian        : 'session-only',
        generation       : 1,
        profileId        : deriveFleetProfileId(loopbackFleet),
        ...overrides
    });

test.describe('connectionProfiles — endpoint normalization is the Node policy, twinned', () => {
    // Every fixture runs through BOTH normalizers below; the pairs must agree on refusals and on
    // canonical text alike, or the two realms disagree about what "the same endpoint" means.
    const fixtures = [
        {candidate: 'http://127.0.0.1:8083/fleet',        canonical: 'http://127.0.0.1:8083/fleet'},
        {candidate: 'http://localhost:8083/fleet',        canonical: 'http://localhost:8083/fleet'},
        {candidate: 'http://[::1]:8083/fleet',            canonical: 'http://[::1]:8083/fleet'},
        {candidate: 'HTTP://LOCALHOST:8083/Fleet',        canonical: 'http://localhost:8083/Fleet'},
        {candidate: 'http://127.0.0.1:80/fleet',          canonical: 'http://127.0.0.1/fleet'},
        {candidate: ' http://127.0.0.1:8083/fleet ',      canonical: 'http://127.0.0.1:8083/fleet'},
        {candidate: 'http://127.0.0.1:8083/fleet///',     canonical: 'http://127.0.0.1:8083/fleet'},
        {candidate: 'http://127.0.0.1:8083/',             canonical: 'http://127.0.0.1:8083'},
        {candidate: 'http://127.0.0.1:8083/fleet?a=1#x',  canonical: 'http://127.0.0.1:8083/fleet'},
        {candidate: 'https://plane.example.test/fleet',   canonical: 'https://plane.example.test/fleet'},
        {candidate: 'https://plane.example.test:443/f',   canonical: 'https://plane.example.test/f'},
        {candidate: 'http://plane.example.test/fleet',    canonical: null}, // plain http is loopback-only
        {candidate: 'https://user:pw@example.test/fleet', canonical: null}, // credentials-in-URL
        {candidate: 'file:///tmp/fleet',                  canonical: null},
        {candidate: 'not-a-url',                          canonical: null},
        {candidate: '',                                   canonical: null},
        {candidate: 42,                                   canonical: null},
        {candidate: null,                                 canonical: null}
    ];

    test('the canonical matrix: one endpoint maps to one identity, refused shapes map to null', () => {
        for (const {candidate, canonical} of fixtures) {
            expect(normalizeFleetEndpoint(candidate), `client(${String(candidate)})`).toBe(canonical)
        }
    });

    test('PARITY: the client twin and the Node authority answer every fixture identically', () => {
        for (const {candidate} of fixtures) {
            expect(normalizeFleetEndpoint(candidate), `parity(${String(candidate)})`)
                .toBe(normalizeSecureMcpEndpoint(candidate))
        }
    });

    test('profile ids embed the contract version and derive from the endpoint alone', () => {
        expect(deriveFleetProfileId(loopbackFleet)).toBe(`fleet-profile:v${FLEET_PROFILE_CONTRACT_VERSION}:${loopbackFleet}`);
        expect(deriveFleetProfileId(`${loopbackFleet}?a=1`)).toBe(deriveFleetProfileId(`${loopbackFleet}///`));
        expect(deriveFleetProfileId('http://plane.example.test/fleet')).toBeNull()
    });

    test('forbidden identity keys never reach identity: labels vary, the id does not', () => {
        expect(PROFILE_FORBIDDEN_IDENTITY_KEYS).toEqual(['label', 'login', 'checkoutPath']);

        const a = createFleetProfile({custodian: 'session-only', endpoint: loopbackFleet, label: 'Local Plane'}),
              b = createFleetProfile({custodian: 'session-only', endpoint: loopbackFleet, label: 'Renamed'});

        expect(a.profileId).toBe(b.profileId)
    });
});

test.describe('connectionProfiles — the record schema is closed and credential-free (Option-D as code)', () => {
    test('creation produces a frozen, guard-validated record with exactly the admitted fields', () => {
        const profile = createFleetProfile({custodian: 'session-only', endpoint: `${loopbackFleet}?x=1`, label: 'Dev'});

        expect(Object.isFrozen(profile)).toBe(true);
        expect(profile).toEqual({
            canonicalEndpoint: loopbackFleet,
            contractVersion  : FLEET_PROFILE_CONTRACT_VERSION,
            custodian        : 'session-only',
            generation       : 1,
            label            : 'Dev',
            profileId        : deriveFleetProfileId(loopbackFleet)
        })
    });

    test('a refused endpoint fails creation with the named remediation', () => {
        expect(() => createFleetProfile({custodian: 'session-only', endpoint: 'http://plane.example.test/fleet'}))
            .toThrow(/https endpoint, or plain http on an exact loopback host/)
    });

    test('bearerEnvVar is env-indirection-only and must be a NAME, never a value', () => {
        const profile = createFleetProfile({bearerEnvVar: 'FLEET_BEARER', custodian: 'env-indirection', endpoint: loopbackFleet});

        expect(profile.bearerEnvVar).toBe('FLEET_BEARER');
        expect(CUSTODIAN_STORABLE_CREDENTIAL_FIELDS['env-indirection']).toEqual(['bearerEnvVar']);

        expect(() => createFleetProfile({bearerEnvVar: 'FLEET_BEARER', custodian: 'session-only', endpoint: loopbackFleet}))
            .toThrow(/env-indirection custodian's field/);
        expect(() => createFleetProfile({bearerEnvVar: 'not upper snake', custodian: 'env-indirection', endpoint: loopbackFleet}))
            .toThrow(/NAME \(upper-snake\), never a value/)
    });

    test('every forbidden credential field name is refused under every custodian', () => {
        for (const custodian of PROFILE_CUSTODIANS) {
            for (const field of PROFILE_FORBIDDEN_CREDENTIAL_FIELDS) {
                expect(() => assertStorableProfileRecord(validRecord({custodian, [field]: 'anything'})),
                    `${custodian} must refuse '${field}'`).toThrow(/refuses credential field/)
            }
        }
    });

    test('a bearer-shaped VALUE is refused in ANY field — the label smuggle is caught by shape', () => {
        expect(FLEET_BEARER_PATTERN.test(testBearer)).toBe(true);
        expect(FLEET_BEARER_PATTERN.test(testBearer.slice(0, 42))).toBe(false);
        expect(() => assertStorableProfileRecord(validRecord({label: testBearer})))
            .toThrow(/bearer-shaped material/)
    });

    test('unknown fields, nested values, forged ids, and malformed core fields are refused', () => {
        expect(() => assertStorableProfileRecord(validRecord({rememberMe: true}))).toThrow(/unknown field/);
        expect(() => assertStorableProfileRecord(validRecord({label: {nested: 'x'}}))).toThrow(/flat primitive/);
        expect(() => assertStorableProfileRecord(validRecord({profileId: 'fleet-profile:v1:http://forged.example.test'})))
            .toThrow(/ids are derived, never hand-assigned/);
        expect(() => assertStorableProfileRecord(validRecord({custodian: 'keychain'}))).toThrow(/custodian must be one of/);
        expect(() => assertStorableProfileRecord(validRecord({generation: 0}))).toThrow(/positive-integer/);
        expect(() => assertStorableProfileRecord(null)).toThrow(/plain object/)
    });
});

test.describe('connectionProfiles — stale records rehydrate explicitly, never silently', () => {
    test('a foreign contract version flags stale; rehydration re-derives identity and keeps custody truth', () => {
        const stale = validRecord({contractVersion: 999, custodian: 'env-indirection', bearerEnvVar: 'FLEET_BEARER', generation: 7, profileId: 'fleet-profile:v999:http://127.0.0.1:8083/fleet'});

        expect(isStaleProfile(stale)).toBe(true);
        expect(isStaleProfile(validRecord())).toBe(false);

        const fresh = rehydrateProfile(stale);

        expect(fresh.contractVersion).toBe(FLEET_PROFILE_CONTRACT_VERSION);
        expect(fresh.profileId).toBe(deriveFleetProfileId(loopbackFleet));
        expect(fresh.custodian).toBe('env-indirection');
        expect(fresh.bearerEnvVar).toBe('FLEET_BEARER');
        expect(fresh.generation).toBe(7)
    });

    test('an endpoint the current contract refuses cannot be silently upgraded', () => {
        expect(() => rehydrateProfile(validRecord({canonicalEndpoint: 'http://plane.example.test/fleet'})))
            .toThrow(/cannot rehydrate/);
        expect(() => rehydrateProfile(undefined)).toThrow(/cannot rehydrate/)
    });
});

test.describe('connectionProfiles — the custody-migration machine', () => {
    test('the four phases execute in order and generation advances exactly at retire', () => {
        expect(CUSTODY_MIGRATION_PHASES).toEqual(['read-old', 'establish', 'verify', 'retire']);

        const migration = createCustodyMigration({fromCustodian: 'session-only', generation: 3, toCustodian: 'electron-main'});

        expect(migration.phase).toBe('read-old');
        expect(() => migration.nextGeneration).toThrow(/advances only at retire/);

        expect(migration.advance()).toBe('establish');
        expect(migration.advance()).toBe('verify');
        expect(migration.advance()).toBe('retire');
        expect(migration.advance()).toBeNull();

        expect(migration.completed).toBe(true);
        expect(migration.phase).toBeNull();
        expect(migration.nextGeneration).toBe(4);
        expect(() => migration.advance()).toThrow(/terminal/);
        expect(() => migration.rollback()).toThrow(/cannot roll back after retire/)
    });

    test('rollback before retire restores the old custody truth and is terminal', () => {
        const migration = createCustodyMigration({fromCustodian: 'session-only', generation: 3, toCustodian: 'env-indirection'});

        migration.advance(); // establish underway

        expect(migration.rollback()).toEqual({custodian: 'session-only', generation: 3});
        expect(migration.rolledBack).toBe(true);
        expect(migration.phase).toBeNull();
        expect(() => migration.advance()).toThrow(/terminal/);
        expect(() => migration.rollback()).toThrow(/terminal/);
        expect(() => migration.nextGeneration).toThrow(/keeps the old custody truth/)
    });

    test('a migration requires two different known custodians and the live generation', () => {
        expect(() => createCustodyMigration({fromCustodian: 'session-only', generation: 1, toCustodian: 'session-only'}))
            .toThrow(/reconnect, not a migration/);
        expect(() => createCustodyMigration({fromCustodian: 'keychain', generation: 1, toCustodian: 'session-only'}))
            .toThrow(/requires custodians from/);
        expect(() => createCustodyMigration({fromCustodian: 'session-only', generation: 0, toCustodian: 'electron-main'}))
            .toThrow(/positive-integer generation/)
    });
});

test.describe('connectionProfiles — the pre-boot ingress retire helper', () => {
    test('retires a present bearer, preserves siblings, and reports honestly when there is nothing to retire', () => {
        const target = {AgentOS: {fleet: {bearerToken: testBearer, registryBridge: {live: true}}}};

        expect(retireBearerIngressSlot(target)).toBe(true);
        expect('bearerToken' in target.AgentOS.fleet).toBe(false);
        expect(target.AgentOS.fleet.registryBridge).toEqual({live: true});

        expect(retireBearerIngressSlot(target)).toBe(false);
        expect(retireBearerIngressSlot({})).toBe(false);
        expect(retireBearerIngressSlot(undefined)).toBe(false)
    });

    test('the CAS guard: only the exact verified value retires; a rotated value survives', () => {
        const rotated = 'B'.repeat(43),
              target  = {AgentOS: {fleet: {bearerToken: rotated}}};

        expect(retireBearerIngressSlot(target, {expected: testBearer}), 'a mismatched slot is a different credential').toBe(false);
        expect(target.AgentOS.fleet.bearerToken).toBe(rotated);

        expect(retireBearerIngressSlot(target, {expected: rotated})).toBe(true);
        expect('bearerToken' in target.AgentOS.fleet).toBe(false);

        expect(retireBearerIngressSlot(target, {expected: rotated}), 'an empty slot retires nothing under the guard').toBe(false)
    });
});
