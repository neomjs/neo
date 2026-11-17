import {expect, test} from '../../fixtures.mjs';

/**
 * The example this spec certifies. It loads neither module that evaluates a string: `Neo.code.LivePreview`
 * (the live code editor behind `src/code/executor/Neo.mjs`) and the Neural Link client
 * (`src/ai/client/RuntimeService.mjs`, off by default through `useAiClient`).
 */
const APP = '/examples/grid/container/index.html';
const REPORT_PATH = '/__csp-report';
const PROBE_WORKER = '/test/playwright/e2e/core/fixtures/cspViolationWorker.mjs';

/**
 * One named policy, in its starting shape. No directive below is wider than this: the example boots
 * clean under it, and the certification test is the measurement. A directive may only be widened when a
 * recorded violation forces it, and the widening then carries a comment naming that violation, so the
 * next reader can tell a measured need from a guess.
 */
const POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'"
].join('; ');

/**
 * Boots the example under `policy` and records what the page and its workers did.
 * @param {Object}  page
 * @param {String}  policy The policy stamped on the document and on every script response.
 * @param {Object}  [options]
 * @param {Boolean} [options.waitForApp] False for a policy expected to block the boot, where there is no app to wait for.
 * @returns {Promise<Object>} `{document, workerScripts, stamped, violations, reports, errors}`, where `workerScripts` are the
 * paths of the worker scripts that were served with the header.
 */
async function boot(page, policy, {waitForApp = true} = {}) {
    const stamped = [], violations = [], reports = [], errors = [], workerUrls = [];

    // The event is the signal: a blocked fetch prints console text a page can suppress, and the console
    // API never sees a violation raised inside a worker.
    await page.addInitScript(() => {
        globalThis.__cspViolations = [];

        document.addEventListener('securitypolicyviolation', event => {
            globalThis.__cspViolations.push({
                directive: event.violatedDirective,
                blocked  : event.blockedURI,
                sample   : event.sample
            })
        })
    });

    page.on('worker', worker => workerUrls.push(worker.url()));
    page.on('console', message => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', error => errors.push(error.message));

    await page.context().route('**/*', async route => {
        const request = route.request(),
              type    = request.resourceType(),
              // A worker takes its policy from its own script response, not from the page that started it,
              // so the document alone is not the measurement.
              stampedHere = type === 'document' || type === 'script';

        if (new URL(request.url()).pathname === REPORT_PATH && request.method() === 'POST') {
            reports.push(request.postDataJSON()['csp-report']);
            return route.fulfill({status: 204})
        }

        if (!stampedHere) {
            return route.continue()
        }

        stamped.push({type, path: new URL(request.url()).pathname});
        const response = await route.fetch({maxRetries: 2});

        await route.fulfill({
            response,
            headers: {...response.headers(), 'content-security-policy': policy + '; report-uri ' + REPORT_PATH}
        })
    });

    await page.goto(APP);

    if (waitForApp) {
        await page.waitForFunction(() => globalThis.Neo?.worker?.Manager?.workers?.app, null, {timeout: 30000});
        await page.locator('.neo-grid-container').first().waitFor({state: 'visible', timeout: 30000})
    }

    violations.push(...await page.evaluate(() => globalThis.__cspViolations));

    return {
        document: stamped.filter(entry => entry.type === 'document'),
        // The intersection is the claim: these worker scripts were fetched, and the header was on them.
        workerScripts: [...new Set(workerUrls.map(url => new URL(url).pathname))]
            .filter(path => stamped.some(entry => entry.type === 'script' && entry.path === path)),
        stamped,
        violations,
        reports,
        errors
    }
}

test.describe('Content security policy', () => {

    test.afterEach(async ({context}) => {
        await context.unrouteAll({behavior: 'wait'})
    });

    test('the engine boots under the named policy without a violation', async ({page}) => {
        const record = await boot(page, POLICY);

        expect(record.document.map(entry => entry.path), 'the header reached the document').toContain(
            '/examples/grid/container/index.html'
        );

        expect(record.workerScripts.length, 'the header reached at least one worker script').toBeGreaterThan(0);

        expect(record.violations, 'no directive of the policy was violated').toEqual([]);
        expect(record.reports, 'no policy violation was reported from the page or its workers').toEqual([]);
        expect(
            record.errors.filter(text => /content security policy|refused to/i.test(text)),
            'no policy violation reached the console'
        ).toEqual([]);

        await expect(page.locator('.neo-grid-container')).toHaveCount(1)
    });

    test('a violation inside a worker reaches the report endpoint', async ({page}) => {
        const record = await boot(page, POLICY);
        const result = await page.evaluate(path => new Promise((resolve, reject) => {
            const worker = new Worker(path);
            worker.onmessage = event => resolve(event.data);
            worker.onerror   = event => reject(new Error(event.message))
        }), PROBE_WORKER);

        expect(result).toBe('EvalError');
        await expect.poll(() => record.reports).toEqual(expect.arrayContaining([expect.objectContaining({
            'document-uri'       : new URL(PROBE_WORKER, page.url()).href,
            'effective-directive': 'script-src',
            'blocked-uri'        : 'eval'
        })]));
        expect(await page.evaluate(() => globalThis.__cspViolations)).toEqual([])
    });

    // The witness has to be able to fail, or the green above proves only that nothing is measured. This
    // arm is the failure the certification test would report, produced on purpose.
    test('the witness reports a violation when the policy denies the boot', async ({page}) => {
        const record = await boot(page, "default-src 'self'; script-src 'none'", {waitForApp: false});

        expect(record.violations.length, 'the denied script was recorded').toBeGreaterThan(0);
        expect(record.violations.some(entry => /script-src/.test(entry.directive))).toBe(true);

        await expect(page.locator('.neo-grid-container'), 'the app never rendered').toHaveCount(0)
    })
});
