import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TemporalSummaryDaemonTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';

const daemonPath = path.resolve(process.cwd(), 'ai/daemons/temporal-summary/daemon.mjs');

test.describe('ai/daemons/temporal-summary/daemon.mjs', () => {
    test('importing the wrapper never starts the service — process-entry isolation', async () => {
        const service = (await import('../../../../../../ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs')).default;

        await import('../../../../../../ai/daemons/temporal-summary/daemon.mjs');

        // the start()/signal-handler block is guarded by the main-module check, so a plain import is inert
        expect(service.isPolling).toBe(false)
    });

    test('the entry point injects both required start() arguments from the config SSOT', () => {
        const source = fs.readFileSync(daemonPath, 'utf8');

        // the service carries no config defaults and fails loud without these — the entry point is the
        // config-aware boundary that resolves them at the use site
        expect(source).toContain('enabled       : AiConfig.temporalSummary.aggregationEnabled');
        expect(source).toContain('pollIntervalMs: AiConfig.temporalSummary.aggregationIntervalMs');
    });

    test('the config leaves resolve to an opt-in default and a positive interval', async () => {
        const AiConfig = (await import('../../../../../../ai/config.mjs')).default;

        // opt-in by default: a fresh checkout never silently runs the aggregation lane
        expect(AiConfig.temporalSummary.aggregationEnabled).toBe(false);
        expect(AiConfig.temporalSummary.aggregationIntervalMs).toBeGreaterThan(0);
    });

    test('the wrapper registers clean-stop handlers for both termination signals', () => {
        const source = fs.readFileSync(daemonPath, 'utf8');

        expect(source).toContain("process.on('SIGTERM'");
        expect(source).toContain("process.on('SIGINT'");
        expect(source).toContain('TemporalSummaryAggregationService.stop()')
    })
});
