import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_InstanceService} = await loadNeuralLinkModules();

/**
 * @summary Live Neural Link proof for transaction archive + replay.
 *
 * Drives the full product path: an agent opens a named transaction, creates a component through the live NL
 * write surface, commits and archives it, reloads the page to force a fresh App Worker session, replays the
 * archive, then proves the replayed build is itself undoable.
 */
test.describe('Neural Link - transaction archive replay (e2e)', () => {
    test.setTimeout(120000);

    test('saves a named transaction and replays it after reload into a fresh undoable build', async ({ page, neuralLink, baseURL }) => {
        const
            // Default to the runner's injected baseURL (the resolved free port); an explicit
            // NEO_E2E_BASE_URL still wins. A default run must never fall back to a foreign :8080 server —
            // this witness synthesizes an absolute origin, so it has to consume the same port the config resolved.
            appOrigin = process.env.NEO_E2E_BASE_URL || baseURL,
            appUrl    = `${appOrigin}/examples/button/base/index.html?nlArchiveReplay=${Date.now()}`;

        await page.goto(`${appOrigin}/package.json?nlArchiveReplayPurge=${Date.now()}`);
        await page.evaluate(async () => {
            if ('caches' in window) {
                await Promise.all((await caches.keys()).map(key => caches.delete(key)))
            }

            if ('serviceWorker' in navigator) {
                await Promise.all((await navigator.serviceWorker.getRegistrations()).map(reg => reg.unregister()))
            }
        });
        await page.goto(appUrl);
        await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});

        let app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId).toBeTruthy();

        const pick = res => res?.[0]?.id ?? res?.components?.[0]?.id ?? res?.instances?.[0]?.id ?? res?.id ?? null;

        let containerId = pick(await app.findInstances({ntype: 'viewport'}, ['id']));

        if (!containerId) {
            containerId = pick(await app.findInstances({ntype: 'container'}, ['id']))
        }

        expect(containerId, 'could not resolve a target container id for the archive transaction').toBeTruthy();

        const
            suffix   = Date.now(),
            buttonId = `nl-archive-button-${suffix}`,
            label    = `NL-archive-${suffix}`,
            name     = `archive-${suffix}`;

        const begin = await NeuralLink_InstanceService.beginTransaction({
            sessionId: app.sessionId,
            name
        });

        expect(begin.opened, `begin_transaction returned: ${JSON.stringify(begin)}`).toBe(true);

        const createResult = await app.createInstance({
            ntype   : 'button',
            parentId: containerId,
            config  : {id: buttonId, text: label}
        });

        expect(createResult).toEqual({id: buttonId, className: 'Neo.button.Base', parentId: containerId});

        const commit = await NeuralLink_InstanceService.commitTransaction({sessionId: app.sessionId});
        expect(commit.committed, `commit_transaction returned: ${JSON.stringify(commit)}`).toBe(true);
        expect(commit.txId).toBe(`batch:${name}`);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the built component should exist before save',
            timeout: 15000
        }).toBe(true);
        await expect(page.locator(`#${buttonId}`)).toBeVisible({timeout: 10000});

        const save = await app.saveTransaction({
            name: `Saved ${label}`,
            txId: commit.txId
        });

        expect(save.saved, `save_transaction returned: ${JSON.stringify(save)}`).toBe(true);
        expect(save.archiveId).toBeTruthy();
        expect(save.sourceTxId).toBe(commit.txId);

        const oldSessionId = app.sessionId;

        await page.reload();
        await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});

        app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId).toBeTruthy();

        if (app.sessionId === oldSessionId) {
            console.warn(`[NeuralLinkTransactionArchiveReplay] reload reused session ${app.sessionId}`);
        }

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the built component should not survive reload before archive replay',
            timeout: 15000
        }).toBe(false);
        await expect(page.locator(`#${buttonId}`)).toHaveCount(0);

        const replay = await app.replayTransaction({archiveId: save.archiveId});
        expect(replay.replayed, `replay_transaction returned: ${JSON.stringify(replay)}`).toBe(true);
        expect(replay.sourceArchiveId).toBe(save.archiveId);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the archived component should reappear after replay',
            timeout: 15000
        }).toBe(true);
        await expect(page.locator(`#${buttonId}`)).toBeVisible({timeout: 10000});

        const props = await app.getComponent(buttonId, ['className', 'text']);

        expect(props).toMatchObject({
            className: 'Neo.button.Base',
            text     : label
        });

        const undo = await NeuralLink_InstanceService.undo({sessionId: app.sessionId});
        expect(undo.undone, `undo returned: ${JSON.stringify(undo)}`).toBe(true);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the replayed component should be undoable',
            timeout: 15000
        }).toBe(false);
        await expect(page.locator(`#${buttonId}`)).toHaveCount(0)
    });
});
