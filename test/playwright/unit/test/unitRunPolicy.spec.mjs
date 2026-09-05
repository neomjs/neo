import {test, expect}       from '@playwright/test';
import {buildUnitRunPolicy} from '../../playwright.config.unit.mjs';

/**
 * The unit run policy is read by three readers in CI — a reviewer (the `github` annotations), the defect
 * ledger's producer (the `list` reporter's one line per test, whose `✓` marks are the only per-test pass
 * evidence a green run leaves in its log) and the failure artifact (the `json` report) — and by one
 * locally. These arms pin the reporter list in both modes, so a reporter cannot quietly drop out and
 * take a reader with it.
 */
test.describe('unit run policy — the reporters each reader depends on', () => {
    test('in CI the github annotations, the per-test list and the json report compose, in that order', () => {
        const {reporter, failOnFlakyTests, forbidOnly, retries, workers} = buildUnitRunPolicy({isCI: true});

        expect(reporter.map(entry => entry[0])).toEqual(['github', 'list', 'json']);
        expect(reporter[2][1].outputFile.endsWith('test-results/unit/test-results.json')).toBe(true);
        expect({failOnFlakyTests, forbidOnly, retries, workers}).toEqual({failOnFlakyTests: true, forbidOnly: true, retries: 2, workers: 4});
    });

    test('locally only the json report is configured; the runner\'s terminal output stays the developer\'s', () => {
        const {reporter, failOnFlakyTests, forbidOnly, retries, workers} = buildUnitRunPolicy({isCI: false});

        expect(reporter.map(entry => entry[0])).toEqual(['json']);
        expect({failOnFlakyTests, forbidOnly, retries, workers}).toEqual({failOnFlakyTests: false, forbidOnly: false, retries: 0, workers: undefined});
    });
});
