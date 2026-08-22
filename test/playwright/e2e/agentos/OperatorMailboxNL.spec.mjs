import {test, expect}                     from '../../fixtures.mjs';
import {createFleetMailboxMirrorSnapshot} from '../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const rosterRows = [
    {id: 'review-a', githubUsername: 'review-peer-a', displayName: 'Review Peer A', engineTag: 'fixture', family: 'gpt'},
    {id: 'review-b', githubUsername: 'review-peer-b', displayName: 'Review Peer B', engineTag: 'fixture', family: 'claude'}
];

async function startOperatorMailboxFleet() {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
          requests                 = [],
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  switch (request.method) {
                      case 'resolveViewerIdentity':
                          return fleetE2ESuccess({ok: true, agentIdentityNodeId: '@e2e-operator'});
                      case 'fleetRoster':
                          return fleetE2ESuccess({rows: rosterRows});
                      case 'fleetActivity':
                          return fleetE2ESuccess({capability: {state: 'wired'}, events: []});
                      case 'fleetMailboxMirror':
                          return fleetE2ESuccess(createFleetMailboxMirrorSnapshot({
                                  messages: [],
                                  page    : {limit: 50, offset: request.params?.offset ?? 0},
                                  subject : '@e2e-operator',
                                  viewer  : '@e2e-operator'
                              }));
                      case 'composeOperatorMessage':
                          return request.params?.to === '@review-peer-b'
                              ? fleetE2ESuccess({status: 'rejected', reason: 'fixture rejection'})
                              : fleetE2ESuccess({messageId: `fixture-${requests.length}`, sentAt: new Date().toISOString()});
                      default:
                          return fleetE2EFailure(`unexpected operator-mailbox method: ${request.method}`)
                  }
              }
          }),
          server                   = await startFleetBridgeServer(options);

    return {
        requests,
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

test.describe('AgentOS operator mailbox mounted delivery journey (#15377)', () => {
    test.setTimeout(120000);

    test('mounted named + several + broadcast compose and both-theme reachable outcomes', async ({page, neuralLink}, testInfo) => {
        const fleet = await startOperatorMailboxFleet();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            const [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']);
            expect(cockpit?.properties?.id).toBeTruthy();
            await app.callMethod(cockpit.properties.id, 'loadRoster');
            await app.callMethod(cockpit.properties.id, 'loadOperatorIdentity');

            // resident south tab titled "Mailbox" (the navigation model): activate the tab and the
            // pane renders in the strip's body — no rail reveal, no overlay
            const mailboxTab = page.getByRole('tab', {name: 'Mailbox', exact: true});
            await expect(mailboxTab).toHaveCount(1);
            await mailboxTab.click();
            const mailboxPane = page.locator('.fm-operator-mailbox');
            await expect(mailboxPane).toBeVisible({timeout: 10000});
            await expect(mailboxPane).toContainText('No active messages for @e2e-operator');

            const [mailbox] = await app.queryComponent({className: 'AgentOS.view.fleet.mailbox.OperatorContainer'}, ['id', 'record', 'snapshot']),
                  [form]    = await app.queryComponent({className: 'AgentOS.view.fleet.mailbox.ComposeForm'}, ['id', 'recipientOptions', 'composeOutcome']),
                  [list]    = await app.queryComponent({reference: 'compose-recipients'}, ['id', 'selectionModel']);

            expect(mailbox.properties.record).toEqual({agentIdentityNodeId: '@e2e-operator', githubUsername: 'e2e-operator'});
            expect(mailbox.properties.snapshot.admission).toMatchObject({state: 'granted', subjectAgentId: '@e2e-operator'});
            expect(form.properties.recipientOptions.map(row => row.id)).toEqual(['AGENT:*', '@review-peer-a', '@review-peer-b']);

            const listState        = await app.getComponent(list.properties.id, ['selectionModel']),
                  selectionModelId = listState.selectionModel.id,
                  subject          = page.getByRole('textbox', {name: 'Subject'}),
                  message          = page.getByRole('textbox', {name: 'Message'}),
                  send             = page.getByRole('button', {name: 'Send'}),
                  choose           = async name => {
                      const row = mailboxPane
                          .locator('.fm-operator-compose-recipients-list')
                          .getByRole('listitem')
                          .filter({hasText: name});
                      await expect(row).toHaveCount(1);
                      await expect(row).toHaveText(name);
                      await row.click()
                  },
                  clearRecipients = () => app.callMethod(selectionModelId, 'deselectAll');

            await choose('review-peer-a');
            await subject.fill('Named path');
            await message.fill('One recipient');
            await send.click();
            await expect.poll(async () => (await app.getComponent(form.properties.id, ['composeOutcome'])).composeOutcome)
                .toEqual({results: [{to: '@review-peer-a', outcome: expect.objectContaining({messageId: expect.any(String)})}]});

            await clearRecipients();
            await choose('review-peer-a');
            await choose('review-peer-b');
            await subject.fill('Several path');
            await message.fill('Two recipients');
            await send.click();
            await expect.poll(async () => (await app.getComponent(form.properties.id, ['composeOutcome'])).composeOutcome)
                .toEqual({results: [
                    {to: '@review-peer-a', outcome: expect.objectContaining({messageId: expect.any(String)})},
                    {to: '@review-peer-b', outcome: {status: 'rejected', reason: 'fixture rejection'}}
                ]});
            await expect(mailboxPane).toContainText('@review-peer-a — sent');
            await expect(mailboxPane).toContainText('@review-peer-b — fixture rejection');

            await clearRecipients();
            await choose('All agents (broadcast)');
            await subject.fill('Broadcast path');
            await message.fill('One server-expanded call');
            await send.click();
            await expect.poll(async () => (await app.getComponent(form.properties.id, ['composeOutcome'])).composeOutcome)
                .toEqual({results: [{to: 'AGENT:*', outcome: expect.objectContaining({messageId: expect.any(String)})}]});

            const composeRequests = fleet.requests.filter(request => request.method === 'composeOperatorMessage');
            expect(composeRequests.map(request => request.params.to)).toEqual([
                '@review-peer-a', '@review-peer-a', '@review-peer-b', 'AGENT:*'
            ]);
            expect(composeRequests.every(request => request.params.from === undefined)).toBe(true);
            expect(composeRequests.at(-1).params).toMatchObject({priority: 'high', wakeSuppressed: true});

            const mailboxDom = page.locator('.fm-operator-mailbox');
            await expect(mailboxDom).toHaveCount(1);
            const fit = await mailboxDom.evaluate(element => {
                const style = getComputedStyle(element);
                return {
                    clientHeight: element.clientHeight,
                    scrollHeight: element.scrollHeight,
                    overflowY   : style.overflowY
                }
            });
            expect(fit.overflowY).toBe('auto');
            // The reachability contract: the scroll MECHANIC is armed (overflowY above) and the
            // final outcome is reachable below. The old rail overlay was short enough that this
            // fixture always overflowed; the resident south-tab body is taller, so content may
            // legitimately FIT — never assert overflow itself, only that nothing is clipped away.
            expect(fit.scrollHeight).toBeGreaterThanOrEqual(fit.clientHeight);
            const finalOutcome = mailboxPane.getByText('AGENT:* — sent', {exact: true});
            await finalOutcome.scrollIntoViewIfNeeded();
            await expect(finalOutcome).toBeVisible();

            const [viewport]    = await app.queryComponent({className: 'AgentOS.view.Viewport'}, ['id', 'theme']),
                  viewportState = await app.getComponent(viewport.properties.id, ['controller']),
                  controllerId  = viewportState.controller.id;
            const viewportDom = page.locator('.agent-os-viewport');

            for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
                await app.callMethod(controllerId, 'setTheme', [theme, false]);
                await expect.poll(async () => (await app.getComponent(viewport.properties.id, ['theme'])).theme).toBe(theme);
                await expect(viewportDom).toHaveClass(new RegExp(`\\b${theme}\\b`));
                await page.screenshot({path: testInfo.outputPath(`operator-${theme}.png`)})
            }

            const listStyles = await app.getComputedStyles(list.properties.id, ['border-top-color', 'background-color']);
            expect(listStyles['border-top-color']).not.toBe('rgba(0, 0, 0, 0)')
        } finally {
            await fleet.close()
        }
    })
});
