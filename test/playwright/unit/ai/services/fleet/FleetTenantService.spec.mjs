import {setup} from '../../../../setup.mjs'

const appName = 'FleetTenantServiceTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import fs             from 'node:fs'
import os             from 'node:os'
import path           from 'node:path'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import FleetTenantService     from '../../../../../../ai/services/fleet/FleetTenantService.mjs'
import FleetControlBridge     from '../../../../../../ai/services/fleet/FleetControlBridge.mjs'
import {dispatchFleetRequest} from '../../../../../../ai/services/fleet/dispatchFleetRequest.mjs'
import {FLEET_WIRE_METHODS}   from '../../../../../../src/ai/fleet/fleetWireMethods.mjs'

const PAT = 'glpat-SUPER-SECRET-tenant-credential-42'

let sequence = 0, tmpDir

/**
 * Self-test for the remote-tenant connect surface — the design-partner entry. The binding security
 * contract: the tenant PAT rides IN, authenticates the probe, persists ONLY encrypted (AES-256-GCM,
 * 0600), and is never echoed by any return value, any public store file, or any wire-reachable
 * method. Fail-closed everywhere: bad URLs, URL-embedded credentials, rejected bearers, and
 * unreachable endpoints all yield controlled rejected outcomes with no descriptor persisted.
 */
test.describe.serial('Neo.ai.services.fleet.FleetTenantService — connectTenant', () => {
    test.beforeEach(() => {
        sequence++
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fleet-tenant-${sequence}-`))
        FleetTenantService.dataDir = tmpDir
    })

    test.afterEach(() => {
        FleetTenantService.dataDir = null
        FleetTenantService.probeFn = null
        fs.rmSync(tmpDir, {force: true, recursive: true})
    })

    test('a successful connect returns the PUBLIC descriptor: endpoint, connected status, cloud-tenant posture — no credential', async () => {
        FleetTenantService.probeFn = async () => ({ok: true, status: 200})

        const result = await FleetTenantService.connectTenant({tenantUrl: 'https://tenant.example.com/agentos/', credential: PAT})

        expect(result).toMatchObject({
            endpoint       : 'https://tenant.example.com/agentos',
            status         : 'connected',
            deploymentClass: 'cloud-tenant'
        })
        expect(result.id).toContain('tenant.example.com')
        expect(typeof result.connectedAt).toBe('string')
        expect(JSON.stringify(result)).not.toContain(PAT)
    })

    test('the PAT is never echoed: not in listTenants, not in the public store file — only in the encrypted store, decryptable Brain-side', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        const {id} = await FleetTenantService.connectTenant({tenantUrl: 'https://tenant.example.com', credential: PAT})

        expect(JSON.stringify(FleetTenantService.listTenants())).not.toContain(PAT)

        const publicStore = fs.readFileSync(path.join(tmpDir, 'tenants.json'), 'utf8')
        expect(publicStore).not.toContain(PAT)

        const encryptedStore = fs.readFileSync(path.join(tmpDir, 'tenant-credentials.enc'))
        expect(encryptedStore.includes(Buffer.from(PAT))).toBe(false)

        // The Brain-internal read (NOT wire-reachable) round-trips the credential for the transport.
        expect(FleetTenantService.getCredential(id)).toBe(PAT)
    })

    test('the probe receives the credential exactly once, for authentication only', async () => {
        const probeCalls = []
        FleetTenantService.probeFn = async args => { probeCalls.push(args); return {ok: true} }

        await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT})

        expect(probeCalls).toEqual([{endpoint: 'https://t.example.com', credential: PAT}])
    })

    test('fail-closed URL validation: malformed, non-http(s), and credential-embedded URLs all reject without persisting', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        expect(await FleetTenantService.connectTenant({tenantUrl: 'not a url', credential: PAT})).toMatchObject({status: 'rejected'})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'ftp://x.example.com', credential: PAT})).toMatchObject({status: 'rejected'})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'https://user:pass@x.example.com', credential: PAT})).toMatchObject({status: 'rejected'})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'https://ok.example.com'})).toMatchObject({status: 'rejected', reason: 'credential (tenant PAT) is required'})

        expect(FleetTenantService.listTenants()).toEqual([])
        expect(fs.existsSync(path.join(tmpDir, 'tenant-credentials.enc'))).toBe(false)
    })

    test('a rejected bearer and an unreachable endpoint both fail closed with bounded reasons — nothing persisted', async () => {
        FleetTenantService.probeFn = async () => ({ok: false, status: 401, reason: 'tenant rejected the credential'})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT}))
            .toEqual({status: 'rejected', reason: 'tenant rejected the credential'})

        FleetTenantService.probeFn = async () => { throw new Error(`ECONNREFUSED with ${PAT} in some transport dump`) }
        const result = await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT})

        // The rejection reason is bounded and endpoint-scoped — a throwing transport can never leak
        // the credential (or internals) into the outcome.
        expect(result).toEqual({status: 'rejected', reason: 'tenant endpoint unreachable'})
        expect(FleetTenantService.listTenants()).toEqual([])
    })

    test('reconnecting the same endpoint updates the descriptor in place — one endpoint, one tenant id', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        const first  = await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: 'pat-one'}),
              second = await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com/', credential: 'pat-two'})

        expect(second.id).toBe(first.id)
        expect(FleetTenantService.listTenants()).toHaveLength(1)
        expect(FleetTenantService.getCredential(first.id)).toBe('pat-two')
    })

    test('a REMOTE plain-http endpoint is refused — the bearer must not cross a network in clear', async () => {
        const probed = []
        FleetTenantService.probeFn = async args => { probed.push(args); return {ok: true} }

        expect(await FleetTenantService.connectTenant({tenantUrl: 'http://tenant.example.com', credential: PAT}))
            .toMatchObject({status: 'rejected'})

        // Refused at validation, BEFORE the probe: the credential never reached the transport at all.
        expect(probed).toEqual([])
        expect(FleetTenantService.listTenants()).toEqual([])
    })

    test('plain http stays available for LOOPBACK development only — the bounded exception', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        for (const host of ['localhost:9000', '127.0.0.1:9000', '[::1]:9000']) {
            const result = await FleetTenantService.connectTenant({tenantUrl: `http://${host}`, credential: PAT})

            expect(result).toMatchObject({status: 'connected'})
        }

        // A neighbouring host is NOT loopback, however much it looks like one.
        expect(await FleetTenantService.connectTenant({tenantUrl: 'http://127.0.0.1.evil.example.com', credential: PAT}))
            .toMatchObject({status: 'rejected'})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'http://localhost.evil.example.com', credential: PAT}))
            .toMatchObject({status: 'rejected'})
    })

    test('a hostile probe reason NEVER reaches the caller — the failure vocabulary is closed, not sanitized', async () => {
        // The probe is a collaborator whose text the remote tenant shapes. Even handed the
        // credential verbatim plus an injection attempt, the outcome carries only our own sentence.
        FleetTenantService.probeFn = async () => ({
            ok    : false,
            status: 401,
            reason: `PAT ${PAT} rejected; contact admin@evil.example.com or run rm -rf /`
        })

        const result = await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT})

        expect(result).toEqual({status: 'rejected', reason: 'tenant rejected the credential'})
        expect(JSON.stringify(result)).not.toContain(PAT)
        expect(JSON.stringify(result)).not.toContain('evil.example.com')
        expect(JSON.stringify(result)).not.toContain('rm -rf')
    })

    test('an unmapped probe status still yields a bounded reason, never a fabricated success', async () => {
        FleetTenantService.probeFn = async () => ({ok: false, status: 503})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT}))
            .toEqual({status: 'rejected', reason: 'tenant health probe failed (503)'})

        // No status at all — the probe answered ok:false and nothing else.
        FleetTenantService.probeFn = async () => ({ok: false})
        expect(await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT}))
            .toEqual({status: 'rejected', reason: 'tenant authentication failed'})
    })

    test('credential-first / descriptor-last: a failed public publish rolls the credential back and strands NO connected state', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        // Land a good tenant first, so the rollback has a prior snapshot to restore.
        const first = await FleetTenantService.connectTenant({tenantUrl: 'https://kept.example.com', credential: 'pat-kept'})

        // Now make the PUBLIC descriptor publish fail on the next connect.
        const publishAtomically = FleetTenantService.publishAtomically.bind(FleetTenantService)

        FleetTenantService.publishAtomically = (file, contents) => {
            if (file.endsWith('tenants.json')) throw new Error('disk full')
            return publishAtomically(file, contents)
        }

        try {
            const result = await FleetTenantService.connectTenant({tenantUrl: 'https://doomed.example.com', credential: 'pat-doomed'})

            expect(result).toMatchObject({status: 'rejected'})
            expect(JSON.stringify(result)).not.toContain('disk full')
        } finally {
            FleetTenantService.publishAtomically = publishAtomically
        }

        // The failed connect left NOTHING behind: no descriptor claiming connected...
        expect(FleetTenantService.listTenants().map(tenant => tenant.endpoint)).toEqual(['https://kept.example.com'])

        // ...and no orphan credential — the prior snapshot is restored intact.
        expect(FleetTenantService.getCredential(first.id)).toBe('pat-kept')
        expect(Object.values(FleetTenantService.readCredentials())).not.toContain('pat-doomed')
    })

    test('a credential-store failure returns the bounded rejection and preserves both prior stores', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        const first = await FleetTenantService.connectTenant({tenantUrl: 'https://kept.example.com', credential: 'pat-kept'})

        const descriptorBefore = fs.readFileSync(path.join(tmpDir, 'tenants.json')),
              credentialBefore = fs.readFileSync(path.join(tmpDir, 'tenant-credentials.enc'))

        const publishAtomically = FleetTenantService.publishAtomically.bind(FleetTenantService)

        FleetTenantService.publishAtomically = (file, contents) => {
            if (file.endsWith('tenant-credentials.enc')) {
                throw new Error(`credential write failed with ${PAT}`)
            }

            return publishAtomically(file, contents)
        }

        let result

        try {
            result = await FleetTenantService.connectTenant({tenantUrl: 'https://doomed.example.com', credential: 'pat-doomed'})
        } finally {
            FleetTenantService.publishAtomically = publishAtomically
        }

        expect(result).toEqual({status: 'rejected', reason: 'tenant connection could not be persisted'})
        expect(JSON.stringify(result)).not.toContain(PAT)
        expect(fs.readFileSync(path.join(tmpDir, 'tenants.json'))).toEqual(descriptorBefore)
        expect(fs.readFileSync(path.join(tmpDir, 'tenant-credentials.enc'))).toEqual(credentialBefore)
        expect(FleetTenantService.listTenants().map(tenant => tenant.endpoint)).toEqual(['https://kept.example.com'])
        expect(FleetTenantService.getCredential(first.id)).toBe('pat-kept')
        expect(Object.values(FleetTenantService.readCredentials())).not.toContain('pat-doomed')
        expect(fs.readdirSync(tmpDir).filter(name => name.includes('.tmp'))).toEqual([])
    })

    test('publication is atomic and leaves no temp files behind', async () => {
        FleetTenantService.probeFn = async () => ({ok: true})

        await FleetTenantService.connectTenant({tenantUrl: 'https://t.example.com', credential: PAT})

        expect(fs.readdirSync(tmpDir).filter(name => name.includes('.tmp'))).toEqual([])
    })
})

test.describe.serial('FleetControlBridge + wire — the remote-tenant surface', () => {
    test.afterEach(() => {
        FleetControlBridge.tenantService = null
    })

    test('connectTenant and listTenants delegate through the injectable tenant seam', async () => {
        const calls = []

        FleetControlBridge.tenantService = {
            connectTenant: async params => { calls.push(['connectTenant', params]); return {id: 't', status: 'connected'} },
            listTenants  : () => { calls.push(['listTenants']); return [{id: 't'}] }
        }

        await expect(FleetControlBridge.connectTenant({tenantUrl: 'https://t', credential: 'x'})).resolves.toEqual({id: 't', status: 'connected'})
        expect(FleetControlBridge.listTenants()).toEqual([{id: 't'}])
        expect(calls).toEqual([['connectTenant', {tenantUrl: 'https://t', credential: 'x'}], ['listTenants']])
    })

    test('both verbs are on the wire allowlist; the credential reader is NOT and can never be dispatched', async () => {
        expect(FLEET_WIRE_METHODS).toContain('connectTenant')
        expect(FLEET_WIRE_METHODS).toContain('listTenants')
        expect(FLEET_WIRE_METHODS).not.toContain('getCredential')

        const rejected = await dispatchFleetRequest({method: 'getCredential', params: 't'})
        expect(rejected).toEqual({ok: false, error: "fleet: method 'getCredential' is not on the control surface"})
    })

    test('a connectTenant dispatched over the wire returns the fail-closed envelope on service rejection', async () => {
        FleetControlBridge.tenantService = {
            connectTenant: async () => ({status: 'rejected', reason: 'tenant rejected the credential'})
        }

        const result = await dispatchFleetRequest({method: 'connectTenant', params: {tenantUrl: 'https://t', credential: 'bad'}})

        expect(result).toEqual({ok: true, result: {status: 'rejected', reason: 'tenant rejected the credential'}})
    })
})
