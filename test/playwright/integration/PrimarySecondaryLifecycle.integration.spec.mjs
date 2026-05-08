import {test, expect} from '@playwright/test';
import {callHealthcheck, getReadiness} from './fixtures/mcpClient.mjs';

test.describe('Memory Core Primary/Secondary Lifecycle', () => {
    test.beforeAll(async () => {
        const ready = await getReadiness();
        expect(ready.servicesReady).toBe(true);
    });

    test('Primary instance assumes summarization duty', async () => {
        // mc-primary is exposed on 13001
        await expect.poll(async () => {
            const health = await callHealthcheck('http://127.0.0.1:13001', {
                clientName: 'primary-lifecycle-test'
            });
            return health.startup.summarizationStatus;
        }, {
            message: 'Waiting for primary instance to complete startup summarization',
            timeout: 15000
        }).toBe('completed');
    });

    test('Secondary instance explicitly skips summarization duty', async () => {
        // mc-secondary is exposed on 13002
        await expect.poll(async () => {
            const health = await callHealthcheck('http://127.0.0.1:13002', {
                clientName: 'secondary-lifecycle-test'
            });
            return health.startup.summarizationStatus;
        }, {
            message: 'Waiting for secondary instance to register its non-primary status',
            timeout: 15000
        }).toBe('skipped-non-primary');
    });
});
