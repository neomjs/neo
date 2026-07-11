import test      from '@playwright/test';
import Neo       from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';
import Agent     from '../../../../ai/Agent.mjs';

const {expect} = test;

/**
 * @summary Probes for the Agent readiness contract: a failed boot must be observable at every
 * direct `ready()` boundary — never success-shaped partial state.
 *
 * The base ready promise resolves when the construct-fired `initAsync()` COMPLETES, including a
 * captured-failure completion (a rejection there would hang every waiter — the framework fires
 * init with no external observer). `Agent.ready()` therefore re-throws the captured
 * `initError`, so consumers cannot proceed onto an instance with no loop and no clients. These
 * probes drive the REAL class through a boot-bypassing subclass: the real `initAsync` needs
 * live MCP servers, which a unit run must never require — the subclass simulates exactly the
 * two completions the contract distinguishes (healthy / captured failure).
 */
class ProbeAgent extends Agent {
    static config = {
        /**
         * @member {String} className='Probe.ai.AgentReadiness'
         * @protected
         */
        className: 'Probe.ai.AgentReadiness',
        /**
         * Simulate the captured-failure boot completion.
         * @member {Boolean} failBoot=false
         */
        failBoot: false
    }

    /**
     * Boot bypass: completes like the real one (resolve + optionally capture), without MCP I/O.
     * @returns {Promise<void>}
     */
    async initAsync() {
        // deliberately skips Agent.initAsync (the MCP boot) — core.Base registers remotes only
        await Neo.core.Base.prototype.initAsync.call(this);

        if (this.failBoot) {
            this.initError = new Error('boot failed: probe')
        }
    }
}

Neo.setupClass(ProbeAgent);

test.describe('Neo.ai.Agent — readiness contract (failed boot is never success-shaped)', () => {
    test('a healthy boot resolves ready(); a failed boot REJECTS it even though the base promise resolved', async () => {
        const healthy = Neo.create(ProbeAgent, {servers: []});
        await expect(healthy.ready()).resolves.toBeUndefined();
        healthy.destroy();

        const broken = Neo.create(ProbeAgent, {failBoot: true, servers: []});

        await expect(broken.ready()).rejects.toThrow('boot failed: probe');
        // the sharpened contract in one frame: init COMPLETED (isReady true — the base promise
        // resolved, nothing hangs) yet readiness is REFUSED (the runtime is unusable)
        expect(broken.isReady).toBe(true);
        expect(broken.initError).not.toBeNull();
        broken.destroy()
    });

    test('delegate() never caches a sub-agent whose boot failed', async () => {
        const parent = Neo.create(ProbeAgent, {
            servers  : [],
            subAgents: {
                broken: () => Promise.resolve(ProbeAgent)
            }
        });

        await parent.ready();

        // the profile class boots with failBoot via a scoped default: create the sub-agent
        // through a wrapper class so the probe failure rides the REAL delegate() path
        class BrokenProfile extends ProbeAgent {
            static config = {
                className: 'Probe.ai.AgentReadiness.BrokenProfile',
                failBoot : true
            }
        }
        Neo.setupClass(BrokenProfile);
        parent.subAgents = {broken: () => Promise.resolve(BrokenProfile)};

        await expect(parent.delegate('broken', 'any request')).rejects.toThrow('boot failed: probe');
        // the cache stays clean: a broken sub-agent must never be handed to the NEXT delegate call
        expect(parent.activeSubAgents.broken).toBeUndefined();

        parent.destroy()
    });
});
