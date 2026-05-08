import {test, expect} from '@playwright/test';
import {callHealthcheck, getReadiness} from './fixtures/mcpClient.mjs';

test.describe('Memory Core Primary/Secondary Lifecycle', () => {
    test.beforeAll(async () => {
        const ready = await getReadiness();
        expect(ready.servicesReady).toBe(true);
    });

    test('Primary instance assumes summarization duty', async () => {
        // mc-primary is exposed on 13001
        const primaryHealth = await callHealthcheck('http://127.0.0.1:13001', {
            clientName: 'primary-lifecycle-test'
        });
        
        expect(primaryHealth.startup.summarizationStatus).toBe('completed');
    });

    test('Secondary instance explicitly skips summarization duty', async () => {
        // mc-secondary is exposed on 13002
        const secondaryHealth = await callHealthcheck('http://127.0.0.1:13002', {
            clientName: 'secondary-lifecycle-test'
        });
        
        expect(secondaryHealth.startup.summarizationStatus).toBe('skipped-non-primary');
    });
});
