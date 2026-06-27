import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import AiConfig                from '../../../../../../ai/config.mjs';
import {resolveCloudOnlyEnabled} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';

const KEY = 'composeServiceRecoveryEnabled';

test.describe('Neo.ai.daemons.Orchestrator cloudOnly mode-gate (#14150 composeServiceRecoveryEnabled)', () => {
    let savedMode, savedPresent, savedValue;

    test.beforeEach(() => {
        savedMode    = AiConfig.orchestrator.deploymentMode;
        savedPresent = KEY in AiConfig.orchestrator.cloudOnly;
        savedValue   = AiConfig.orchestrator.cloudOnly[KEY];
    });

    test.afterEach(() => {
        AiConfig.orchestrator.deploymentMode = savedMode;
        if (savedPresent) {
            AiConfig.orchestrator.cloudOnly[KEY] = savedValue;
        } else {
            delete AiConfig.orchestrator.cloudOnly[KEY];
        }
    });

    test('mode-gate default: cloud → B1 enabled, local → B1 disabled', () => {
        AiConfig.orchestrator.cloudOnly[KEY] = null; // profile default (the leaf default)

        AiConfig.orchestrator.deploymentMode = 'cloud';
        expect(resolveCloudOnlyEnabled(KEY)).toBe(true);

        AiConfig.orchestrator.deploymentMode = 'local';
        expect(resolveCloudOnlyEnabled(KEY)).toBe(false);
    });

    test('explicit override beats the deployment default (opt-in local / opt-out cloud)', () => {
        AiConfig.orchestrator.deploymentMode = 'local';
        AiConfig.orchestrator.cloudOnly[KEY] = true;  // operator opts B1 in for a local smoke test
        expect(resolveCloudOnlyEnabled(KEY)).toBe(true);

        AiConfig.orchestrator.deploymentMode = 'cloud';
        AiConfig.orchestrator.cloudOnly[KEY] = false; // operator opts B1 out in a cloud deployment
        expect(resolveCloudOnlyEnabled(KEY)).toBe(false);
    });
});
