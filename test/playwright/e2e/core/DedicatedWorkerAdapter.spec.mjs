import {
    assertUnnavigatedBeforeNeuralLinkRoute,
    expect,
    hasBrainRuntimeRoot,
    test
} from '../../fixtures.mjs';
import {runDedicatedWorkerNeuralLink} from '../../dedicatedWorkerNeuralLink.mjs';

const APP_URL = '/examples/button/base/index.html';

test.describe('Dedicated App Worker Whitebox Adapter (No Bridge)', () => {
    test('reads and writes against a real source app on a dedicated worker and opens zero WebSockets', async ({browser, context, page}) => {
        const cdpSession        = await context.newCDPSession(page),
              webSocketsCreated = [];

        cdpSession.on('Network.webSocketCreated', event => {
            webSocketsCreated.push(event.url)
        });
        await cdpSession.send('Network.enable');

        expect(hasBrainRuntimeRoot({})).toBe(false);

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(APP_URL);

            // Address the captured dedicated App Worker directly even when given an unrelated target name
            const app = await adapter.connectToApp('UnrelatedTargetNameNeverSearchedByAppName');

            const buttons = await app.queryComponent({ntype: 'button'}, ['text']);
            expect(Array.isArray(buttons)).toBe(true);
            expect(buttons.length).toBeGreaterThan(0);

            const targetButton = buttons[0],
                  originalText = targetButton.properties.text;

            await app.setProperties(targetButton.id, {text: 'Adapter Off-Socket Write'});

            const updatedProps = await app.getComponent(targetButton.id, ['text']);
            expect(updatedProps.text).toBe('Adapter Off-Socket Write');
            await expect(page.locator(`#${targetButton.id}`)).toContainText('Adapter Off-Socket Write');

            const undoResult = await app.undo();
            expect(undoResult.undone).toBe(true);
            expect((await app.getComponent(targetButton.id, ['text'])).text).toBe(originalText);

            const redoResult = await app.redo();
            expect(redoResult.redone).toBe(true);
            expect((await app.getComponent(targetButton.id, ['text'])).text).toBe('Adapter Off-Socket Write');

            const workerState = await page.workers()
                .find(w => w.url().includes('/worker/App.mjs'))
                .evaluate(() => ({
                    allowAiClientInTests: Boolean(globalThis.Neo?.config?.allowAiClientInTests),
                    hasClient           : Boolean(globalThis.Neo?.ai?.Client),
                    hasSocket           : Boolean(globalThis.Neo?.ai?.Client?.socket)
                }));

            expect(workerState).toEqual({
                allowAiClientInTests: true,
                hasClient           : true,
                hasSocket           : false
            });
            expect(webSocketsCreated).toEqual([])
        }, {assertUnnavigated: assertUnnavigatedBeforeNeuralLinkRoute})
    });

    test('mints a fresh writer pair per test and ends it through handleAgentDisconnected when a test throws', async ({browser, context, page}) => {
        let firstWriterPair = null,
            targetButtonId  = null;

        await expect(runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            firstWriterPair = adapter.writerPair;

            await page.goto(APP_URL);

            const app     = await adapter.connectToApp('Neo.examples.button.base'),
                  buttons = await app.queryComponent({ntype: 'button'}, ['text']);

            targetButtonId = buttons[0].id;

            const worker = page.workers().find(w => w.url().includes('/worker/App.mjs'));

            await worker.evaluate(() => {
                globalThis.__disconnectedWriterPairs = [];
                const orig = globalThis.Neo.ai.Client.handleAgentDisconnected.bind(globalThis.Neo.ai.Client);

                globalThis.Neo.ai.Client.handleAgentDisconnected = pair => {
                    const result = orig(pair);
                    globalThis.__disconnectedWriterPairs.push({pair, result});
                    return result
                }
            });

            await app.setProperties(targetButtonId, {text: 'Write Before Throw'});
            throw new Error('simulated failure after write')
        })).rejects.toThrow('simulated failure after write');

        const worker = page.workers().find(w => w.url().includes('/worker/App.mjs'));

        const disconnected = await worker.evaluate(() => globalThis.__disconnectedWriterPairs);
        expect(disconnected).toHaveLength(1);
        expect(disconnected[0].pair).toEqual(firstWriterPair);
        expect(disconnected[0].result).toEqual({released: 1, swept: true});

        // A subsequent test run gets a fresh writer pair, meets no stale lock, and inherits no undo stack
        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            expect(adapter.writerPair.agentId).not.toBe(firstWriterPair.agentId);
            expect(adapter.writerPair.sessionId).not.toBe(firstWriterPair.sessionId);

            const app        = await adapter.connectToApp('Neo.examples.button.base'),
                  undoResult = await app.undo();

            expect(undoResult.undone).toBe(false);

            await app.setProperties(targetButtonId, {text: 'Second Writer Succeeds'});
            expect((await app.getComponent(targetButtonId, ['text'])).text).toBe('Second Writer Succeeds')
        })
    })
});
