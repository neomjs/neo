import {test, expect} from '@playwright/test';

/**
 * The check's value is entirely in WHICH rosters it fires on, so the assertions are the two
 * populations rather than the message text.
 *
 * The broad form of this rule — "a spec enumerates members of a set it could derive" — was measured
 * before this check existed and produced **25 candidates of which 22 were correct as written**. A
 * service class's method roster IS the obligation; deriving it from the class asserts that the class
 * has the methods it has, which is green forever including after a deletion. So the suppression cases
 * below are not politeness, they are the reason the trigger is narrow.
 */
test.describe('check-derived-domain — fires on a growable set, not on an obligation', () => {
    let findUnderivedRosters, artifactBoundIdentifiers, ESCAPE_MARKER;

    test.beforeAll(async () => {
        ({findUnderivedRosters, artifactBoundIdentifiers, ESCAPE_MARKER} =
            await import('../../../../buildScripts/util/check-derived-domain.mjs'));
    });

    test('FIRES: a roster indexing an object parsed from a file', () => {
        // The shape this check exists for. `compose` is read from disk, so it can gain a service
        // without touching this spec — and the roster silently stops covering it.
        const source = `
            const compose = yaml.load(readFileSync(composePath, 'utf8'));
            for (const service of ['kb-server', 'mc-server']) {
                expect(compose.services[service].volumes).toBeTruthy();
            }`;

        const findings = findUnderivedRosters(source, 'x.spec.mjs');

        expect(findings).toHaveLength(1);
        expect(findings[0].roster).toEqual(['kb-server', 'mc-server']);
        expect(findings[0].root).toBe('compose');
    });

    test('FIRES when the artifact is bound by ASSIGNMENT, not declaration', () => {
        // A spec that reads its artifact in `beforeAll` assigns to an outer `let`. Missing this shape
        // would suppress exactly the files this check exists for.
        const source = `
            let compose;
            beforeAll(() => { compose = JSON.parse(readFileSync(p, 'utf8')) });
            for (const svc of ['a', 'b']) { expect(compose.services[svc]).toBeTruthy() }`;

        expect(findUnderivedRosters(source)).toHaveLength(1);
    });

    test('SUPPRESSES: a roster indexing an IMPORTED class — the method list IS the obligation', () => {
        // `KbAlertingService.spec` and its siblings. Deriving this roster from the class would assert
        // the class has the methods it has: green forever, including after someone deletes one. The
        // set also cannot grow without editing something the spec imports.
        const source = `
            import KbAlertingService from '../../KbAlertingService.mjs';
            for (const method of ['getKbConfig', 'fetchRollup']) {
                expect(typeof KbAlertingService[method]).toBe('function');
            }`;

        expect(findUnderivedRosters(source)).toEqual([]);
    });

    test('SUPPRESSES: a roster indexing an in-file fixture object', () => {
        // A literal fixture cannot grow behind the spec; it is right there.
        const source = `
            const fixture = {top: 1, left: 2};
            for (const edge of ['top', 'left']) { expect(fixture[edge]).toBeGreaterThan(0) }`;

        expect(findUnderivedRosters(source)).toEqual([]);
    });

    test('SUPPRESSES: a roster that never INDEXES the artifact', () => {
        // Without a computed member access there is no evidence the artifact is keyed by these
        // strings, so there is no evidence `Object.keys` was available.
        const source = `
            const manifest = JSON.parse(readFileSync(p, 'utf8'));
            for (const name of ['a', 'b']) { expect(manifest.names).toContain(name) }`;

        expect(findUnderivedRosters(source)).toEqual([]);
    });

    test('SUPPRESSES: a single-element roster — that is a case, not an enumeration', () => {
        const source = `
            const compose = yaml.load(readFileSync(p, 'utf8'));
            for (const service of ['only']) { expect(compose.services[service]).toBeTruthy() }`;

        expect(findUnderivedRosters(source)).toEqual([]);
    });

    test('the escape marker requires a REASON on the same or preceding line', () => {
        const source = `
            const compose = yaml.load(readFileSync(p, 'utf8'));
            // ${ESCAPE_MARKER} these two are the contract, not the population
            for (const service of ['a', 'b']) { expect(compose.services[service]).toBeTruthy() }`;

        expect(findUnderivedRosters(source)).toEqual([]);
    });

    test('an unparseable file passes rather than failing every commit that touches it', () => {
        expect(findUnderivedRosters('const = = =;')).toEqual([]);
    });

    test('artifactBoundIdentifiers reports only world-reading binds', async () => {
        const source = `
            const fromDisk = readFileSync(p, 'utf8');
            const inline   = {a: 1};`;

        const acorn = await import('acorn'),
              ast   = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'}),
              bound = artifactBoundIdentifiers(source, ast);

        expect([...bound]).toEqual(['fromDisk']);
    });
});
