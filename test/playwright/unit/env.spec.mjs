import { test, expect } from '@playwright/test';
test('env test', () => {
    console.log('UNIT_TEST_MODE is:', process.env.UNIT_TEST_MODE);
    expect(process.env.UNIT_TEST_MODE).toBe('true');
});
