import {setup} from '../../../setup.mjs';

const appName = 'SunsetDetectionTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import {execFileSync} from 'child_process';
import path from 'path';

/**
 * @summary Validation for Phase 1 Auto-Wakeup Substrate.
 */
test.describe('ai/scripts/checkSunsetted', () => {
    test('checkSunsetted.mjs returns a valid JSON string even for unknown agents', async () => {
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkSunsetted.mjs');
        const output = execFileSync('node', [scriptPath, '@neo-unknown-agent'], { encoding: 'utf-8' });
        const parsed = JSON.parse(output);
        
        expect(parsed.identity).toBe('@neo-unknown-agent');
        expect(typeof parsed.sunsetted).toBe('boolean');
        expect(typeof parsed.reason).toBe('string');
        // Unknown agent with no subscription should be considered sunsetted
        expect(parsed.sunsetted).toBe(true);
        expect(parsed.reason).toContain('No active WAKE_SUBSCRIPTION');
    });

    test('swarm-heartbeat.sh integrates the sunset detection properly before the bypass', async () => {
        const fs = await import('fs/promises');
        const script = await fs.readFile(path.resolve(process.cwd(), 'ai/scripts/swarm-heartbeat.sh'), 'utf-8');
        const checkIndex = script.indexOf('Check Sunsetted State');
        const bypassIndex = script.indexOf('Heartbeat-Bypass Detection', script.indexOf('heartbeat_pulse() {'));

        expect(checkIndex).toBeGreaterThan(-1);
        expect(bypassIndex).toBeGreaterThan(-1);
        // Ensure the sunset check happens BEFORE the bypass
        expect(checkIndex).toBeLessThan(bypassIndex);
    });
});
