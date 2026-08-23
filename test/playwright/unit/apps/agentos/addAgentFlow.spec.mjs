import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSAddAgentFlowTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Instance       from '../../../../../src/manager/Instance.mjs';
import AddAgentForm   from '../../../../../apps/agentos/view/fleet/instances/AddAgentForm.mjs';

import AddAgentFlow from '../../../../../apps/agentos/util/AddAgentFlow.mjs';

const CREDENTIAL = 'github_pat_11TESTSECRET_shouldNeverEscape';

const cleanPayload = () => ({
    credential    : CREDENTIAL,
    githubUsername: 'neo-kimi-phoebe',
    harnessType   : 'opencode'
});

const cleanReadback = () => ({
    id            : 'resident-7',
    githubUsername: 'neo-kimi-phoebe',
    harnessType   : 'opencode',
    updatedAt     : '2026-07-18T00:00:00.000Z'
});

test.describe('AgentOS.view.fleet.addAgentFlow — the pure flow half (#15242)', () => {
    test('payload validation names every missing ingredient and passes a complete one', () => {
        expect(AddAgentFlow.validateDefinePayload({}).valid).toBe(false);
        expect(AddAgentFlow.validateDefinePayload({credential: 'x', githubUsername: '   ', harnessType: 'codex'}).valid).toBe(false);
        expect(AddAgentFlow.validateDefinePayload({credential: '',  githubUsername: 'user', harnessType: 'codex'}).valid).toBe(false);
        expect(AddAgentFlow.validateDefinePayload({credential: 'x', githubUsername: 'user', harnessType: ''}).valid).toBe(false);
        expect(AddAgentFlow.validateDefinePayload(cleanPayload())).toEqual({valid: true, reason: ''})
    });

    test('shell credential ingress validates and projects public intent only', () => {
        const bridge = {credentialIngress: 'shell'};

        expect(AddAgentFlow.isShellCredentialIngress(bridge)).toBe(true);
        expect(AddAgentFlow.validateDefinePayload(
            {githubUsername: 'neo-kimi-phoebe', harnessType: 'opencode'},
            {credentialRequired: false}
        )).toEqual({valid: true, reason: ''});
        expect(AddAgentFlow.createDefineAgentIntent({...cleanPayload(), command: 'must-not-cross'}, bridge)).toEqual({
            githubUsername: 'neo-kimi-phoebe',
            harnessType   : 'opencode'
        });
        expect(AddAgentFlow.createDefineAgentIntent(cleanPayload(), {})).toEqual(cleanPayload())
    });

    test('the readback guard fails closed on every poisoned shape and passes the canonical one', () => {
        // missing public identity
        expect(AddAgentFlow.validateReadback({githubUsername: 'x', harnessType: 'y'}, CREDENTIAL).valid).toBe(false);
        // top-level secret key
        expect(AddAgentFlow.validateReadback({...cleanReadback(), token: 'leak'}, CREDENTIAL).valid).toBe(false);
        expect(AddAgentFlow.validateReadback({...cleanReadback(), credential: 'leak'}, CREDENTIAL).valid).toBe(false);
        // serialized credential echo, arbitrarily nested
        expect(AddAgentFlow.validateReadback({...cleanReadback(), meta: {note: `echo ${CREDENTIAL}`}}, CREDENTIAL).valid).toBe(false);
        // non-serializable
        const circular = cleanReadback();
        circular.self  = circular;
        expect(AddAgentFlow.validateReadback(circular, CREDENTIAL).valid).toBe(false);
        // canonical
        expect(AddAgentFlow.validateReadback(cleanReadback(), CREDENTIAL)).toEqual({valid: true, reason: ''})
    });

    test('no bridge → gated, nothing attempted; a bridge without defineAgent is equally gated', async () => {
        const gated = await AddAgentFlow.submitDefineAgent({bridgeResolver: () => null, payload: cleanPayload()});

        expect(gated.state).toBe('gated');
        expect(gated.reason).toContain('fails closed');

        const wrongShape = await AddAgentFlow.submitDefineAgent({bridgeResolver: () => ({}), payload: cleanPayload()});
        expect(wrongShape.state).toBe('gated')
    });

    test('a controlled domain rejection passes its reason through; a transport throw stays sanitized', async () => {
        const rejected = await AddAgentFlow.submitDefineAgent({
            bridgeResolver: () => ({defineAgent: async () => ({status: 'rejected', reason: 'duplicate handle'})}),
            payload       : cleanPayload()
        });

        expect(rejected).toEqual({state: 'rejected', reason: 'duplicate handle'});

        const thrown = await AddAgentFlow.submitDefineAgent({
            bridgeResolver: () => ({defineAgent: async () => { throw new Error(`boom ${CREDENTIAL}`) }}),
            payload       : cleanPayload()
        });

        expect(thrown.state).toBe('rejected');
        // the sanitization claim: a transport error may carry credential bytes; the outcome must not
        expect(JSON.stringify(thrown)).not.toContain(CREDENTIAL)
    });

    test('an invalid readback resolves rejected; the canonical readback is the ONLY confirmed shape', async () => {
        const echoing = await AddAgentFlow.submitDefineAgent({
            bridgeResolver: () => ({defineAgent: async () => ({...cleanReadback(), note: CREDENTIAL})}),
            payload       : cleanPayload()
        });

        expect(echoing.state).toBe('rejected');

        const confirmed = await AddAgentFlow.submitDefineAgent({
            bridgeResolver: () => ({defineAgent: async payload => {
                expect(payload.githubUsername).toBe('neo-kimi-phoebe');
                return cleanReadback()
            }}),
            payload: cleanPayload()
        });

        expect(confirmed.state).toBe('readback-confirmed');
        expect(confirmed.definition).toEqual(cleanReadback());
        expect(AddAgentFlow.ADD_AGENT_STATES).toContain(confirmed.state)
    });

    test('shell submit crosses the generic bridge with public intent only', async () => {
        let received;

        const confirmed = await AddAgentFlow.submitDefineAgent({
            bridgeResolver: () => ({
                credentialIngress: 'shell',
                defineAgent      : async payload => {
                    received = payload;
                    return cleanReadback()
                }
            }),
            payload: {...cleanPayload(), command: 'must-not-cross', env: {TOKEN: CREDENTIAL}}
        });

        expect(received).toEqual({
            githubUsername: 'neo-kimi-phoebe',
            harnessType   : 'opencode'
        });
        expect(JSON.stringify(received)).not.toContain(CREDENTIAL);
        expect(confirmed.state).toBe('readback-confirmed')
    });
});

test.describe('AgentOS.view.fleet.instances.AddAgentForm — flow wiring + the credential-settle rule (#15242)', () => {
    test('bridge absent at construction renders gated with the submit affordance disabled-with-reason', () => {
        const form = Neo.create(AddAgentForm, {appName: 'AgentOSAddAgentFlowTest'});

        expect(form.flowStatus.state).toBe('gated');
        expect(form.getReference('submit-button').disabled).toBe(true);

        const statusCls = form.getReference('flow-status').cls;
        expect(statusCls).toContain('is-gated');

        form.destroy()
    });

    test('a confirmed round-trip fires agentDefinitionAccepted with the readback AND clears the PAT field', async () => {
        const
            fired = [],
            calls = [],
            form  = Neo.create(AddAgentForm, {
                appName       : 'AgentOSAddAgentFlowTest',
                bridgeResolver: () => ({defineAgent: async payload => {
                    calls.push(payload);
                    return cleanReadback()
                }})
            });

        form.on('agentDefinitionAccepted', data => fired.push(data));

        const credentialField = await form.getField('credential');
        const usernameField   = await form.getField('githubUsername');

        usernameField.value   = 'neo-kimi-phoebe';
        credentialField.value = CREDENTIAL;
        form.harnessType      = 'opencode';

        await form.onSubmitClick();

        expect(form.flowStatus.state).toBe('readback-confirmed');
        expect(fired).toHaveLength(1);
        expect(fired[0].agent).toEqual(cleanReadback());
        expect(calls).toEqual([cleanPayload()]);
        // the settle rule: no terminal state leaves credential bytes in the field
        expect(credentialField.value ?? '').toBe('');

        form.destroy()
    });

    test('shell mode renders no PAT field and submits only public intent', async () => {
        let received;

        const form = Neo.create(AddAgentForm, {
            appName       : 'AgentOSAddAgentFlowTest',
            bridgeResolver: () => ({
                credentialIngress: 'shell',
                defineAgent      : async payload => {
                    received = payload;
                    return cleanReadback()
                }
            })
        });

        expect(form.items.some(item => item.name === 'credential')).toBe(false);
        expect(form.flowStatus.reason).toContain('native shell');

        const usernameField = await form.getField('githubUsername');

        usernameField.value = 'neo-kimi-phoebe';
        form.harnessType    = 'opencode';

        await form.onSubmitClick();

        expect(received).toEqual({
            githubUsername: 'neo-kimi-phoebe',
            harnessType   : 'opencode'
        });
        expect(form.flowStatus.state).toBe('readback-confirmed');

        form.destroy()
    });

    test('a rejected round-trip still clears the PAT field — the settle rule is terminal-state-independent', async () => {
        const form = Neo.create(AddAgentForm, {
            appName       : 'AgentOSAddAgentFlowTest',
            bridgeResolver: () => ({defineAgent: async () => ({status: 'rejected', reason: 'nope'})})
        });

        const credentialField = await form.getField('credential');
        const usernameField   = await form.getField('githubUsername');

        usernameField.value   = 'neo-kimi-phoebe';
        credentialField.value = CREDENTIAL;

        await form.onSubmitClick();

        expect(form.flowStatus).toEqual({state: 'rejected', reason: 'nope'});
        expect(credentialField.value ?? '').toBe('');

        form.destroy()
    });

    test('an incomplete definition rejects before submitting — the flow never renders an in-flight state it is not in', async () => {
        const
            bridgeCalls = [],
            form        = Neo.create(AddAgentForm, {
                appName       : 'AgentOSAddAgentFlowTest',
                bridgeResolver: () => ({defineAgent: async () => { bridgeCalls.push(1); return cleanReadback() }})
            });

        await form.onSubmitClick(); // nothing filled in

        expect(form.flowStatus.state).toBe('rejected');
        expect(bridgeCalls).toHaveLength(0);

        form.destroy()
    });
});
