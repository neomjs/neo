import {test, expect}               from '@playwright/test';
import Neo                          from '../../../../../../src/Neo.mjs';
import * as core                    from '../../../../../../src/core/_export.mjs';
import {wireBootIdentityReadSource} from '../../../../../../ai/services/fleet/wireBootIdentityReadSource.mjs';

test.describe('wireBootIdentityReadSource — the fleet-server boot injection of the boot-identity reader', () => {
    test('wires bootIdentitySource with a read-source built from the shared dir', () => {
        const bridge       = {bootIdentitySource: null},
              seen         = [],
              stubSource   = {produceBootIdentityFact: async () => ({fact: null, classification: 'unknown', advisory: true})},
              createSource = ({dir}) => { seen.push(dir); return stubSource };

        const wired = wireBootIdentityReadSource({dir: '/shared/runtime', bridge, createSource});

        expect(seen).toEqual(['/shared/runtime']);          // the reader was pointed at the shared dir
        expect(bridge.bootIdentitySource).toBe(stubSource); // the bridge seam is now wired
        expect(wired).toBe(stubSource);
    });

    test('an absent / empty dir leaves bootIdentitySource UNWIRED — the honest advisory-unknown, never a fabricated source', () => {
        const bridge = {bootIdentitySource: null};

        expect(wireBootIdentityReadSource({dir: '', bridge})).toBeNull();
        expect(wireBootIdentityReadSource({bridge})).toBeNull();
        expect(bridge.bootIdentitySource).toBeNull(); // untouched — the seam degrades to advisory-unknown
    });
});
