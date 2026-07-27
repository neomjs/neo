import {test, expect} from '@playwright/test';
import net            from 'node:net';
import fs             from 'node:fs';
import * as yaml      from 'js-yaml';
import {
    LOOPBACK_PROBE_TIMEOUT_MS,
    classifyLoopbackObservation,
    isLoopbackHost,
    probeLoopbackFamilies,
    resolveLoopbackFamilies
} from '../../../../../../../ai/services/memory-core/helpers/loopbackFamilyProbe.mjs';

// Neo-free helper imported directly, mirroring hostEndpoint.spec and detectionRetentionSla.spec: no
// config-singleton import, no mutation of shared state, and NO REAL SOCKETS — every connect goes
// through the injected seam.
//
// Why the seam is the whole point of this spec: the verdict that matters most is
// "IPv6 answered and IPv4 refused", and a host cannot be made to reproduce that on demand inside a
// test run. Injecting the seam is the only way to assert the asymmetry the helper exists to report,
// rather than asserting whatever the local machine happens to be doing.

/**
 * Builds a connect seam from a per-host outcome map.
 * `true` accepted, `false` refused, an Error instance rejects (unknown family).
 */
const seamFrom = outcomes => ({host}) => {
    const outcome = outcomes[host];

    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
};

const probe = (outcomes, overrides = {}) => probeLoopbackFamilies({
    host     : '127.0.0.1',
    port     : 8000,
    timeoutMs: LOOPBACK_PROBE_TIMEOUT_MS,
    connect  : seamFrom(outcomes),
    ...overrides
});

test.describe('loopbackFamilyProbe — isLoopbackHost', () => {
    test('recognises every loopback spelling a config might carry', () => {
        expect(isLoopbackHost('127.0.0.1')).toBe(true);
        expect(isLoopbackHost('127.1.2.3')).toBe(true);   // the whole 127/8 block is loopback
        expect(isLoopbackHost('::1')).toBe(true);
        expect(isLoopbackHost('[::1]')).toBe(true);       // bracketed form survives config round-trips
        expect(isLoopbackHost('localhost')).toBe(true);
        expect(isLoopbackHost('LOCALHOST')).toBe(true);
        expect(isLoopbackHost(' localhost ')).toBe(true);
    });

    test('⭐ NODE is the authority on address validity — leading-zero octets are NOT addresses', () => {
        // My own dotted-quad regex accepted these; `net.isIP` rejects them, and the runtime that opens
        // the socket is the only authority worth agreeing with. Admitting them meant the probe would
        // dial a string Node cannot parse.
        expect(net.isIP('127.000.000.001')).toBe(0);
        expect(net.isIP('127.01.2.3')).toBe(0);
        expect(isLoopbackHost('127.000.000.001')).toBe(false);
        expect(isLoopbackHost('127.01.2.3')).toBe(false);
    })

    test('⭐ brackets must be BALANCED — a half-bracketed host is malformed, not IPv6', () => {
        // Stripping a leading `[` or trailing `]` independently admitted all of these.
        expect(isLoopbackHost('[::1')).toBe(false);
        expect(isLoopbackHost('::1]')).toBe(false);
        expect(isLoopbackHost('127.0.0.1]')).toBe(false);
        expect(isLoopbackHost('[127.0.0.1')).toBe(false);
        // The balanced forms still work.
        expect(isLoopbackHost('[::1]')).toBe(true);
        expect(isLoopbackHost('::1')).toBe(true);
    })

    test('a non-`::1` IPv6 loopback spelling declines rather than being normalised', () => {
        // `0:0:0:0:0:0:0:1` IS loopback and Node accepts it, but an address normaliser inside a
        // diagnostic is a second parser to keep correct. Declining is the quiet, safe outcome — the
        // stated limit, not a surprise.
        expect(net.isIP('0:0:0:0:0:0:0:1')).toBe(6);
        expect(isLoopbackHost('0:0:0:0:0:0:0:1')).toBe(false);
    })

    test('⭐ ADMISSION IS PARSED, not prefix-matched — malformed 127-ish hosts are rejected', () => {
        // `startsWith('127.')` admitted all of these. A diagnostic that accepts a non-address and then
        // dials something else entirely is worse than no diagnostic.
        expect(isLoopbackHost('127.abc')).toBe(false);
        expect(isLoopbackHost('127.0.0.1.example.com')).toBe(false);
        expect(isLoopbackHost('127.0.0')).toBe(false);          // three octets
        expect(isLoopbackHost('127.0.0.256')).toBe(false);      // out of range
        expect(isLoopbackHost('127.0.0.1x')).toBe(false);
        expect(isLoopbackHost('1270.0.0.1')).toBe(false);       // first octet is not 127
        // ...while the whole legitimate 127/8 block still is loopback.
        expect(isLoopbackHost('127.0.0.1')).toBe(true);
        expect(isLoopbackHost('127.0.0.5')).toBe(true);
        expect(isLoopbackHost('127.255.255.254')).toBe(true);
    })

    test('⭐ a NON-CANONICAL 127/8 host is PROBED and REPORTED as itself, never as 127.0.0.1', () => {
        // The substitution bug: the probe hard-coded 127.0.0.1, so a server configured for 127.0.0.5
        // was dialed at — and had its verdict report — an address it never uses.
        expect(resolveLoopbackFamilies('127.0.0.5').map(f => f.host)).toEqual(['127.0.0.5', '::1']);
        expect(resolveLoopbackFamilies('127.0.0.5').map(f => f.label)).toEqual(['127.0.0.5', '[::1]']);
        // Only when the config supplies no IPv4 literal does the canonical stand-in apply.
        expect(resolveLoopbackFamilies('::1').map(f => f.host)).toEqual(['127.0.0.1', '::1']);
        expect(resolveLoopbackFamilies('localhost').map(f => f.host)).toEqual(['127.0.0.1', '::1']);
    })

    test('rejects the container service-name case — this is what keeps cloud deployments untouched', () => {
        // In a compose network the configured host is a service name, so no loopback claim could say
        // anything true about it. The probe must decline rather than run and be ignored: that is the
        // mechanical reason this diagnostic changes nothing for the containerised deployment.
        expect(isLoopbackHost('chroma')).toBe(false);
        expect(isLoopbackHost('chroma.internal')).toBe(false);
        expect(isLoopbackHost('10.0.0.5')).toBe(false);
        expect(isLoopbackHost('0.0.0.0')).toBe(false);    // a bind wildcard, not a dial target
        expect(isLoopbackHost(undefined)).toBe(false);
        expect(isLoopbackHost('')).toBe(false);
    });
});

test.describe('loopbackFamilyProbe — probeLoopbackFamilies refuses instead of throwing', () => {
    // Every refusal path returns a reason. A diagnostic that throws on the boot path it is diagnosing
    // is worse than no diagnostic, so "never throws" is a contract, not an implementation detail.

    test('declines a non-loopback host without dialing anything', async () => {
        let called = false;

        const observation = await probeLoopbackFamilies({
            host: 'chroma', port: 8000, timeoutMs: 250, connect: () => (called = true, Promise.resolve(true))
        });

        expect(observation.probed).toBe(false);
        expect(observation.reason).toContain('not a loopback address');
        expect(called).toBe(false);   // no socket attempted, not merely ignored
    });

    test('declines a missing or invalid port, a bad timeout, and a missing seam', async () => {
        expect((await probe({}, {port: undefined})).reason).toContain('positive integer');
        expect((await probe({}, {port: 0})).reason).toContain('positive integer');
        expect((await probe({}, {port: 8000.5})).reason).toContain('positive integer');
        expect((await probe({}, {timeoutMs: 0})).reason).toContain('positive finite');
        expect((await probe({}, {timeoutMs: Number.NaN})).reason).toContain('positive finite');
        expect((await probe({}, {connect: undefined})).reason).toContain('connect seam is required');
    });

    test('a THROWING seam degrades to unknown rather than propagating', async () => {
        // Robustness against a dependency that FAILS, not merely one that is absent: a seam which
        // throws synchronously must be contained exactly like one that rejects.
        const observation = await probeLoopbackFamilies({
            host   : '127.0.0.1', port: 8000, timeoutMs: 250,
            connect: () => { throw new Error('seam exploded'); }
        });

        expect(observation.probed).toBe(true);
        expect(observation.families.every(entry => entry.answered === null)).toBe(true);
        expect(classifyLoopbackObservation(observation).verdict).toBe('inconclusive');
    });

    test('a seam resolving a NON-boolean is treated as unknown, never coerced into a claim', async () => {
        const observation = await probe({'127.0.0.1': 'yes', '::1': undefined});

        expect(observation.families.every(entry => entry.answered === null)).toBe(true);
        expect(classifyLoopbackObservation(observation).verdict).toBe('inconclusive');
    });
});

test.describe('loopbackFamilyProbe — classifyLoopbackObservation verdicts', () => {
    test('MISMATCH: the dialed family refused and the other answered — the diagnosis itself', async () => {
        // The verdict the ticket exists for, and the one a real host cannot be made to produce here.
        const verdict = classifyLoopbackObservation(await probe({'127.0.0.1': false, '::1': true}));

        expect(verdict.verdict).toBe('mismatch');
        expect(verdict.conclusive).toBe(true);
        expect(verdict.dialed).toBe('127.0.0.1');
        expect(verdict.answering).toEqual(['[::1]']);   // bracketed for display
    });

    test('MISMATCH in the mirror direction — an IPv6-configured server against an IPv4-only listener', async () => {
        const verdict = classifyLoopbackObservation(
            await probe({'127.0.0.1': true, '::1': false}, {host: '::1'})
        );

        expect(verdict.verdict).toBe('mismatch');
        expect(verdict.dialed).toBe('[::1]');
        expect(verdict.answering).toEqual(['127.0.0.1']);
    });

    test('a bracketed configured host resolves to the same family as its bare form', async () => {
        const verdict = classifyLoopbackObservation(
            await probe({'127.0.0.1': true, '::1': false}, {host: '[::1]'})
        );

        expect(verdict.verdict).toBe('mismatch');
        expect(verdict.dialed).toBe('[::1]');
    });

    test('NO-LISTENER: both families definitively refused — rules the mismatch OUT', async () => {
        // Equally load-bearing as the mismatch verdict: it tells the operator to stop looking here.
        const verdict = classifyLoopbackObservation(await probe({'127.0.0.1': false, '::1': false}));

        expect(verdict.verdict).toBe('no-listener');
        expect(verdict.conclusive).toBe(true);
        expect(verdict.answering).toEqual([]);
        expect(verdict.empty).toEqual(['127.0.0.1', '[::1]']);
    });

    test('LISTENER-REACHABLE: the dialed family answered, so the fault is above TCP', async () => {
        const verdict = classifyLoopbackObservation(await probe({'127.0.0.1': true, '::1': false}));

        expect(verdict.verdict).toBe('listener-reachable');
        expect(verdict.conclusive).toBe(true);
    });

    test('AMBIGUOUS-HOST: `localhost` reports facts without asserting a mismatch', async () => {
        // Which family `localhost` resolves to is not observable from here, so claiming a mismatch
        // would be an assertion the probe cannot support.
        const verdict = classifyLoopbackObservation(
            await probe({'127.0.0.1': false, '::1': true}, {host: 'localhost'})
        );

        expect(verdict.verdict).toBe('ambiguous-host');
        expect(verdict.conclusive).toBe(true);
        expect(verdict.answering).toEqual(['[::1]']);
    });

    test('INCONCLUSIVE: one unknown family suppresses a mismatch that the other half would suggest', async () => {
        // The fail-closed core. IPv6 answered and IPv4 is UNKNOWN (a timeout, not a refusal) — which
        // looks exactly like a mismatch and is not one, because "IPv4 refused" was never observed.
        // Reporting a mismatch here would be the unverified assertion this module exists to retire.
        const verdict = classifyLoopbackObservation(
            await probe({'127.0.0.1': new Error('timed out after 250ms'), '::1': true})
        );

        expect(verdict.verdict).toBe('inconclusive');
        expect(verdict.conclusive).toBe(false);
        expect(verdict.unknown).toEqual(['127.0.0.1']);
        expect(verdict.reason).toContain('127.0.0.1');
    });

    test('a timeout is NOT reported as an empty family', async () => {
        const observation = await probe({'127.0.0.1': new Error('timed out'), '::1': new Error('timed out')});

        expect(classifyLoopbackObservation(observation).empty).toEqual([]);
        expect(classifyLoopbackObservation(observation).verdict).toBe('inconclusive');
    });

    test('SKIPPED: a declined observation classifies as non-conclusive and carries the reason forward', async () => {
        const declined = await probeLoopbackFamilies({host: 'chroma', port: 8000, timeoutMs: 250, connect: () => Promise.resolve(true)}),
              verdict  = classifyLoopbackObservation(declined);

        expect(verdict.verdict).toBe('skipped');
        expect(verdict.conclusive).toBe(false);
        expect(verdict.reason).toContain('not a loopback address');
    });

    test('SKIPPED for a malformed or absent observation — classification never throws either', () => {
        for (const input of [undefined, null, {}, {probed: true}, {probed: true, families: 'nope'}]) {
            expect(classifyLoopbackObservation(input).verdict).toBe('skipped');
            expect(classifyLoopbackObservation(input).conclusive).toBe(false);
        }
    });
});

test.describe('loopbackFamilyProbe — the timeout bound is stated, not inherited', () => {
    test('the exported bound is an explicit literal well above the measured connect times', () => {
        // The bound must be stated in code rather than inherited from a config default, so the value
        // itself is pinned: a refused loopback connect returns in ~0.3ms and a successful one in
        // ~1.2ms, making 250ms ~200x the observed answer time.
        expect(LOOPBACK_PROBE_TIMEOUT_MS).toBe(250);
    });

    test('the seam receives the timeout it was given — the bound is not silently replaced', async () => {
        const seen = [];

        await probeLoopbackFamilies({
            host   : '127.0.0.1', port: 8000, timeoutMs: LOOPBACK_PROBE_TIMEOUT_MS,
            connect: ({host, port, timeoutMs}) => (seen.push({host, port, timeoutMs}), Promise.resolve(false))
        });

        expect(seen).toHaveLength(2);
        expect(seen.map(entry => entry.host)).toEqual(['127.0.0.1', '::1']);
        expect(seen.every(entry => entry.timeoutMs === LOOPBACK_PROBE_TIMEOUT_MS)).toBe(true);
        expect(seen.every(entry => entry.port === 8000)).toBe(true);
    });
});

test.describe('the published contract matches the verdicts the code can actually emit', () => {
    test('⭐ every classifier verdict is in the OpenAPI enum — the schema cannot drift from the producer', () => {
        // A schema listing five of six verdicts is worse than no schema: a consumer coding against it
        // would treat the missing one as a protocol violation. So the enum is asserted against the
        // verdicts this module can PRODUCE, not eyeballed once at authoring time.
        const schema = yaml.load(fs.readFileSync('ai/mcp/server/memory-core/openapi.yaml', 'utf8'))
                  .components.schemas.HealthCheckResponse
                  .properties.database.properties.connection.properties.loopbackProbe,
              documented = new Set(schema.properties.verdict.enum),
              // Every verdict reachable from this module, each produced by a real call rather than
              // copied from a list — a hand-maintained list is the drift this test exists to stop.
              emitted    = new Set([
                  classifyLoopbackObservation(undefined).verdict,
                  classifyLoopbackObservation({probed: true, host: '127.0.0.1', port: 1, families: [
                      {family: 4, host: '127.0.0.1', label: '127.0.0.1', answered: false},
                      {family: 6, host: '::1', label: '[::1]', answered: true}
                  ]}).verdict,
                  classifyLoopbackObservation({probed: true, host: '127.0.0.1', port: 1, families: [
                      {family: 4, host: '127.0.0.1', label: '127.0.0.1', answered: false},
                      {family: 6, host: '::1', label: '[::1]', answered: false}
                  ]}).verdict,
                  classifyLoopbackObservation({probed: true, host: '127.0.0.1', port: 1, families: [
                      {family: 4, host: '127.0.0.1', label: '127.0.0.1', answered: true},
                      {family: 6, host: '::1', label: '[::1]', answered: false}
                  ]}).verdict,
                  classifyLoopbackObservation({probed: true, host: 'localhost', port: 1, families: [
                      {family: 4, host: '127.0.0.1', label: '127.0.0.1', answered: false},
                      {family: 6, host: '::1', label: '[::1]', answered: true}
                  ]}).verdict,
                  classifyLoopbackObservation({probed: true, host: '127.0.0.1', port: 1, families: [
                      {family: 4, host: '127.0.0.1', label: '127.0.0.1', answered: null},
                      {family: 6, host: '::1', label: '[::1]', answered: true}
                  ]}).verdict
              ]);

        expect(emitted.size).toBe(6);
        for (const verdict of emitted) {
            expect(documented, `verdict "${verdict}" is emitted but undocumented`).toContain(verdict);
        }
        // And nothing documented is unreachable — a phantom enum member misleads a consumer too.
        expect([...documented].sort()).toEqual([...emitted].sort());
    })

    test('the probe payload is declared nullable and optional — absent is a valid, meaningful state', () => {
        // Absence carries information: a healthy connection, or a non-loopback host. A consumer must not
        // read absence as a malformed payload.
        const connection = yaml.load(fs.readFileSync('ai/mcp/server/memory-core/openapi.yaml', 'utf8'))
            .components.schemas.HealthCheckResponse.properties.database.properties.connection;

        expect(connection.properties.loopbackProbe.nullable).toBe(true);
        expect(connection.required ?? []).not.toContain('loopbackProbe');
    })
});
