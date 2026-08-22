import {test, expect}                     from '../../fixtures.mjs';
import {createFleetMailboxMirrorSnapshot} from '../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const FILM_HOLD_MS = Math.max(0, Number(process.env.NEO_FILM_HOLD_MS) || 0);

/**
 * @summary Starts a public-safe authenticated Fleet fixture whose second generation visibly
 * refreshes all three panes used by the N-window hold: main activity, detached agent detail and
 * detached operator mailbox. The mutable generation stays test-owned; every application update
 * still travels through the production Fleet bridge and cockpit load methods.
 * @returns {Promise<Object>} Fixture controller, endpoint and close callback.
 */
async function startNWindowFleet() {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs');
    let   generation               = 0;

    const options = authenticatedFleetOptions({
              dispatch: async request => {
                  const refreshed = generation === 1;

                  switch (request.method) {
                      case 'resolveViewerIdentity':
                          return fleetE2ESuccess({ok: true, agentIdentityNodeId: '@e2e-operator'});
                      case 'fleetRoster':
                          return fleetE2ESuccess({
                                  rows: [{
                                      id                 : 'neo-fable',
                                      githubUsername     : 'neo-fable',
                                      displayName        : 'Mnemosyne',
                                      engineTag          : 'fable-5',
                                      family             : 'claude',
                                      participationStatus: 'active',
                                      lifecycle          : {
                                          source    : 'fleet:runtimeStatus',
                                          state     : 'running',
                                          confidence: 'observed'
                                      },
                                      wake: {
                                          source    : 'fleet:wakeState',
                                          state     : refreshed ? 'on' : 'unknown',
                                          confidence: refreshed ? 'observed' : 'none',
                                          ...(!refreshed && {reason: 'film fixture refresh pending'})
                                      },
                                      throttle: {
                                          source    : 'fleet:throttleState',
                                          state     : 'none',
                                          confidence: 'observed'
                                      },
                                      sources: {
                                          roster: {
                                              source    : 'fleet:listAgents',
                                              state     : 'wired',
                                              confidence: 'observed'
                                          },
                                          repoStatus: {
                                              source    : 'fleet:fleetStatus',
                                              state     : 'wired',
                                              confidence: 'observed'
                                          },
                                          runtime: {
                                              source    : 'fleet:runtimeStatus',
                                              state     : 'wired',
                                              confidence: 'observed'
                                          }
                                      }
                                  }]
                              });
                      case 'fleetActivity':
                          return fleetE2ESuccess({
                                  capability: {state: 'wired'},
                                  events    : [{
                                      type      : 'a2a-activity',
                                      agentId   : 'neo-fable',
                                      occurredAt: refreshed ? '2026-08-02T00:00:02.000Z' : '2026-08-02T00:00:01.000Z',
                                      payload   : {text: refreshed ? 'Three-window hold live' : 'Film stage ready'}
                                  }]
                              });
                      case 'fleetMailboxMirror':
                          return fleetE2ESuccess(createFleetMailboxMirrorSnapshot({
                                  messages: [{
                                      messageId: `film-message-${generation}`,
                                      subject  : refreshed ? 'Mailbox vessel live' : 'Mailbox stage ready',
                                      from     : '@neo-fable',
                                      to       : '@e2e-operator',
                                      priority : 'normal',
                                      sentAt   : refreshed ? '2026-08-02T00:00:02.000Z' : '2026-08-02T00:00:01.000Z'
                                  }],
                                  page   : {limit: 50, offset: request.params?.offset ?? 0},
                                  subject: '@e2e-operator',
                                  viewer : '@e2e-operator'
                              }));
                      default:
                          return fleetE2EFailure(`unexpected N-window fixture method: ${request.method}`)
                  }
              }
          }),
          server  = await startFleetBridgeServer(options);

    return {
        advance() {
            generation = 1
        },
        bearerToken: options.bearerToken,
        close      : () => new Promise(resolve => server.close(resolve)),
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`
    }
}

/**
 * @summary Normalizes a one-match Neural Link component query without weakening a missing match.
 * @param {Object|Object[]} value Query result.
 * @returns {Object|null} First component or null.
 */
function first(value) {
    return (Array.isArray(value) ? value : [value]).filter(Boolean)[0] ?? null
}

/**
 * @summary Emits one stable capture cue and optionally holds it for native filming. The default
 * zero delay keeps CI fast; `NEO_FILM_HOLD_MS` changes pacing only, never application semantics.
 * @param {import('@playwright/test').Page} page
 * @param {Object[]} beats
 * @param {String} beat
 * @param {Object} [proof]
 * @returns {Promise<void>}
 */
async function checkpoint(page, beats, beat, proof = {}) {
    const receipt = {beat, ...proof};

    beats.push(receipt);
    console.log(`[FleetCockpitNWindowNL] ${JSON.stringify(receipt)}`);

    FILM_HOLD_MS > 0 && await page.waitForTimeout(FILM_HOLD_MS)
}

/**
 * @summary Builds browser-event coordinates for InteractionService's existing native mouse path.
 * @param {Number} clientX
 * @param {Number} clientY
 * @param {Number} screenX
 * @param {Number} screenY
 * @param {Number} buttons
 * @returns {Object}
 */
function pointerOptions(clientX, clientY, screenX, screenY, buttons) {
    return {bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY}
}

/**
 * @summary Whitebox N-window film gate for the Fleet Cockpit. It composes only landed seams:
 * click-vessel detail, the fixture-exposed InteractionService event bundle for the operator tab,
 * production Fleet refresh methods and each pane's existing reintegration path. The mailbox popup
 * is observed before mouse-up, proving birth mid-gesture rather than post-terminal reconstruction.
 *
 * Headed film run:
 * `NEO_E2E_PORT=8137 NEO_FILM_HOLD_MS=2500 npx playwright test agentos/FleetCockpitNWindowNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1 --headed`
 */
test.describe('AgentOS Fleet Cockpit — N-window mailbox film beat (#15650)', () => {
    test.setTimeout(180000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 1100}
    });

    test('detail vessel + mailbox mid-gesture vessel stay live, update and return as the same instances', async ({page, neuralLink}, testInfo) => {
        const fleet       = await startNWindowFleet(),
              beats       = [],
              pageErrors  = [],
              popupErrors = [];

        page.on('pageerror', error => {
            const value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            const app = await neuralLink.connectToApp('AgentOS');

            await wireAuthenticatedFleetBridge({
                app,
                fleetUrl   : fleet.endpoint,
                bearerToken: fleet.bearerToken
            });

            const cockpit = first(await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id', 'windowId']));

            expect(cockpit?.id, 'the FleetCockpit must exist in the bound App Worker').toBeTruthy();

            const cockpitId = cockpit.id;

            await app.callMethod(cockpitId, 'loadRoster');
            await app.callMethod(cockpitId, 'loadActivity');
            await app.callMethod(cockpitId, 'loadOperatorIdentity');

            // The operator pane is a resident south tab (the navigation model): activating its tab
            // mounts the body through the production tab machinery. The pane stays ordinary dock
            // content; no film-only product control or executor is introduced.
            await page.getByRole('tab', {name: 'Mailbox', exact: true}).click();

            await expect.poll(async () => first(await app.queryComponent(
                {className: 'AgentOS.view.fleet.mailbox.OperatorContainer'},
                ['id', 'mounted', 'windowId', 'snapshot']
            ))?.properties?.mounted, {
                message  : 'the operator mailbox must materialize before its gesture',
                timeout  : 15000,
                intervals: [100, 250]
            }).toBe(true);

            await app.callMethod(cockpitId, 'loadOperatorInbox', [{offset: 0}]);

            const mailboxBefore = first(await app.queryComponent(
                {className: 'AgentOS.view.fleet.mailbox.OperatorContainer'},
                ['id', 'mounted', 'windowId', 'snapshot']
            ));

            expect(mailboxBefore?.properties?.mounted, 'the mailbox instance must be live before capture').toBe(true);
            expect(mailboxBefore?.properties?.snapshot?.rows?.[0]?.subject,
                'the mailbox must render the phase-0 fixture before detaching').toBe('Mailbox stage ready');

            // Drill through the production card control, then detach the detail with its existing
            // click-vessel seam. The operator pane remains a second live dock item in the main tree.
            await page.locator('.fm-card-drill', {hasText: 'Mnemosyne'}).click();

            let detailBefore;

            await expect.poll(async () => {
                detailBefore = first(await app.queryComponent(
                    {className: 'AgentOS.view.fleet.detail.Container'},
                    ['id', 'mounted', 'record', 'windowId']
                ));

                return detailBefore?.properties?.record?.agentId
            }, {
                message  : 'the Mnemosyne detail must be live before pop-out',
                timeout  : 10000,
                intervals: [100, 250]
            }).toBe('neo-fable');

            const detailPopupPromise = page.waitForEvent('popup', {timeout: 30000}),
                  detailResult       = await app.callMethod(cockpitId, 'popOutAgentDetail'),
                  detailPopup        = await detailPopupPromise;

            detailPopup.on('pageerror', error => {
                const value = String(error?.stack || error?.message || error || '');

                value && value !== 'undefined' && popupErrors.push(value)
            });

            expect(detailResult).toMatchObject({detached: true, errors: []});
            await detailPopup.waitForURL(url => String(url).includes('detail='), {timeout: 30000});

            let detailWindowed;

            await expect.poll(async () => {
                detailWindowed = first(await app.queryComponent(
                    {className: 'AgentOS.view.fleet.detail.Container'},
                    ['id', 'mounted', 'record', 'windowId']
                ));

                return {
                    id       : detailWindowed?.id,
                    mounted  : detailWindowed?.properties?.mounted,
                    different: detailWindowed?.properties?.windowId !== cockpit.properties.windowId
                }
            }, {
                message  : 'the same detail instance must mount in its vessel',
                timeout  : 15000,
                intervals: [100, 250]
            }).toEqual({id: detailBefore.id, mounted: true, different: true});

            await checkpoint(page, beats, 'detail-windowed', {windows: 2});

            // Resolve the live operator tab and ITS DockTabSortZone. The cockpit has other
            // dashboard SortZones; selecting a global first match would arm the wrong surface.
            const operatorTab = first(await app.queryComponent(
                {className: 'Neo.tab.header.Button', dockItemId: 'operator'},
                ['id', 'dockItemId', 'mounted', 'parentId', 'windowId']
            ));

            expect(operatorTab?.properties?.mounted, 'the operator tab must be live before the raw gesture').toBe(true);
            expect(operatorTab?.properties?.parentId, 'the operator tab must expose its owning toolbar').toBeTruthy();

            const toolbarState = await app.getComponent(operatorTab.properties.parentId, ['sortZone.id']),
                  sortZoneId   = toolbarState['sortZone.id'],
                  [buttonRect] = await app.getDomRect([operatorTab.id]),
                  boundWindows = (await app.getWindowTopology()).filter(window => window.appWorkerId === app.sessionId),
                  mainWindow   = boundWindows.find(window => window.windowId === cockpit.properties.windowId);

            expect(sortZoneId).toBeTruthy();
            expect(buttonRect).toBeTruthy();
            expect(mainWindow?.innerRect).toBeTruthy();

            const
                windowId = cockpit.properties.windowId,
                startX   = Math.round(buttonRect.x + buttonRect.width / 2),
                startY   = Math.round(buttonRect.y + buttonRect.height / 2),
                startSX  = mainWindow.innerRect.x + startX,
                startSY  = mainWindow.innerRect.y + startY;

            // Phase 1: own the native mouse sensor and clear its delay + distance threshold.
            await app.simulateEvent([{
                targetId: operatorTab.id,
                type    : 'mousedown',
                windowId,
                options : pointerOptions(startX, startY, startSX, startSY, 1)
            }, {
                delay   : 120,
                targetId: operatorTab.id,
                type    : 'mousemove',
                windowId,
                options : pointerOptions(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
            }, {
                delay   : 16,
                targetId: operatorTab.id,
                type    : 'mousemove',
                windowId,
                options : pointerOptions(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
            }]);

            await expect.poll(async () => {
                const state = await app.getComponent(sortZoneId, ['boundaryContainerRect', 'itemRects']);

                return Boolean(state.boundaryContainerRect && state.itemRects?.length)
            }, {
                message  : 'the operator DockTabSortZone must arm before boundary motion',
                timeout  : 10000,
                intervals: [50, 100, 250]
            }).toBe(true);

            const
                armed               = await app.getComponent(sortZoneId, ['boundaryContainerRect']),
                edge                = armed.boundaryContainerRect,
                outX                = Math.round((edge.right ?? edge.x + edge.width) + 120),
                outY                = Math.round((edge.bottom ?? edge.y + edge.height) + 120),
                outSX               = mainWindow.innerRect.x + outX,
                outSY               = mainWindow.innerRect.y + outY,
                existingPages       = new Set(page.context().pages()),
                mailboxPopupPromise = page.context().waitForEvent('page', {
                    predicate: candidate => !existingPages.has(candidate),
                    timeout  : 30000
                });

            // Phase 2: progressive outward samples make the boundary ratio monotonically fall.
            for (let index = 1; index <= 4; index++) {
                const
                    clientX = Math.round(startX + (outX - startX) * index / 4),
                    clientY = Math.round(startY + (outY - startY) * index / 4);

                await app.simulateEvent({
                    delay   : 16,
                    targetId: operatorTab.id,
                    type    : 'mousemove',
                    windowId,
                    options : pointerOptions(
                        clientX,
                        clientY,
                        mainWindow.innerRect.x + clientX,
                        mainWindow.innerRect.y + clientY,
                        1
                    )
                })
            }

            const mailboxPopup = await mailboxPopupPromise;

            mailboxPopup.on('pageerror', error => {
                const value = String(error?.stack || error?.message || error || '');

                value && value !== 'undefined' && popupErrors.push(value)
            });

            await mailboxPopup.waitForURL(url => String(url).includes('tearout=operator'), {timeout: 30000});

            let midGestureWindowId;

            await expect.poll(async () => {
                const state = await app.getComponent(cockpitId, ['tearOutConnects']);

                midGestureWindowId = state.tearOutConnects?.operator?.windowId;
                return midGestureWindowId || null
            }, {
                message  : 'the mailbox vessel must connect before mouse-up',
                timeout  : 15000,
                intervals: [100, 250]
            }).not.toBeNull();

            const midGestureZone = await app.getComponent(sortZoneId, ['isWindowDragging', 'lastIntersectionRatio']);

            expect(midGestureZone.isWindowDragging, 'birth happens while the source gesture is still live').toBe(true);
            expect(midGestureZone.lastIntersectionRatio).toBe(0);
            expect(page.context().pages().filter(candidate => !candidate.isClosed())).toHaveLength(3);

            await checkpoint(page, beats, 'mailbox-born-mid-gesture', {pointerDown: true, windows: 3});

            // Keep moving after birth (newborn-survival falsifier), then release to commit detach.
            await app.simulateEvent([{
                delay   : 16,
                targetId: operatorTab.id,
                type    : 'mousemove',
                windowId,
                options : pointerOptions(outX, outY + 12, outSX, outSY + 12, 1)
            }, {
                delay   : 16,
                targetId: operatorTab.id,
                type    : 'mousemove',
                windowId,
                options : pointerOptions(outX, outY + 24, outSX, outSY + 24, 1)
            }, {
                targetId: operatorTab.id,
                type    : 'mouseup',
                windowId,
                options : pointerOptions(outX, outY, outSX, outSY, 0)
            }]);

            let mailboxWindowed;

            await expect.poll(async () => {
                mailboxWindowed = first(await app.queryComponent(
                    {className: 'AgentOS.view.fleet.mailbox.OperatorContainer'},
                    ['id', 'mounted', 'snapshot', 'windowId']
                ));

                const state = await app.getComponent(cockpitId, ['tearOutPanes']);

                return {
                    id      : mailboxWindowed?.id,
                    mounted : mailboxWindowed?.properties?.mounted,
                    windowId: state.tearOutPanes?.operator?.windowId
                }
            }, {
                message  : 'the same mailbox instance must adopt the committed vessel',
                timeout  : 15000,
                intervals: [100, 250]
            }).toEqual({id: mailboxBefore.id, mounted: true, windowId: midGestureWindowId});

            // The hold is not a static tableau. Advance the safe fixture once, then prove each
            // window applies a production data refresh while retaining its component identity.
            const streamBefore = first(await app.queryComponent(
                {className: 'AgentOS.view.fleet.activity.Container'},
                ['id', 'events', 'windowId']
            ));

            fleet.advance();
            await app.callMethod(cockpitId, 'loadRoster');
            await app.callMethod(cockpitId, 'loadActivity');
            await app.callMethod(cockpitId, 'loadOperatorInbox', [{offset: 0}]);

            await expect.poll(async () => {
                const
                    detail  = first(await app.queryComponent(
                        {className: 'AgentOS.view.fleet.detail.Container'},
                        ['id', 'record', 'windowId']
                    )),
                    mailbox = first(await app.queryComponent(
                        {className: 'AgentOS.view.fleet.mailbox.OperatorContainer'},
                        ['id', 'snapshot', 'windowId']
                    )),
                    stream  = first(await app.queryComponent(
                        {className: 'AgentOS.view.fleet.activity.Container'},
                        ['id', 'events', 'windowId']
                    ));

                return {
                    detail : {
                        id      : detail?.id,
                        wake    : detail?.properties?.record?.wake?.state,
                        windowId: detail?.properties?.windowId
                    },
                    mailbox: {
                        id      : mailbox?.id,
                        subject : mailbox?.properties?.snapshot?.rows?.[0]?.subject,
                        windowId: mailbox?.properties?.windowId
                    },
                    stream: {
                        id      : stream?.id,
                        text    : stream?.properties?.events?.[0]?.payload?.text,
                        windowId: stream?.properties?.windowId
                    }
                }
            }, {
                message  : 'main, detail vessel and mailbox vessel must all apply their live refresh',
                timeout  : 15000,
                intervals: [100, 250]
            }).toEqual({
                detail : {id: detailBefore.id, wake: 'on', windowId: detailWindowed.properties.windowId},
                mailbox: {id: mailboxBefore.id, subject: 'Mailbox vessel live', windowId: midGestureWindowId},
                stream : {id: streamBefore.id, text: 'Three-window hold live', windowId: cockpit.properties.windowId}
            });

            await checkpoint(page, beats, 'three-window-live-refresh', {updated: ['main', 'detail', 'mailbox'], windows: 3});

            // Drive the same App-Worker disconnect seam as the G4 vessel-death contract, while the
            // popup tree is still live (the race-maximizing order pinned by FleetCockpitTearOutNL).
            // Playwright's Page.close() bypasses Neo.Main and therefore is not a product close event.
            await app.callMethod(cockpitId, 'onWindowDisconnect', [{windowId: midGestureWindowId}]);

            await expect.poll(async () => {
                const
                    mailbox = first(await app.queryComponent(
                        {className: 'AgentOS.view.fleet.mailbox.OperatorContainer'},
                        ['id', 'mounted', 'windowId']
                    )),
                    state   = await app.getComponent(cockpitId, ['dockModel', 'tearOutPanes']);

                return {
                    id      : mailbox?.id,
                    mounted : mailbox?.properties?.mounted,
                    reTreed : Object.values(state.dockModel.nodes).some(node => node.items?.includes('operator')),
                    residue : Boolean(state.tearOutPanes?.operator),
                    windowId: mailbox?.properties?.windowId
                }
            }, {
                message  : 'mailbox vessel death must return the same pane to the main tree',
                timeout  : 20000,
                intervals: [100, 250, 500]
            }).toEqual({
                id      : mailboxBefore.id,
                mounted : true,
                reTreed : true,
                residue : false,
                windowId: cockpit.properties.windowId
            });

            const mailboxClose = mailboxPopup.waitForEvent('close', {timeout: 30000});

            await mailboxPopup.evaluate(() => window.close());
            await mailboxClose;

            const detailClose = detailPopup.waitForEvent('close', {timeout: 30000}),
                  reattach    = await app.callMethod(cockpitId, 'reattachAgentDetail');

            expect(reattach).toMatchObject({reattached: true, errors: []});
            await detailClose;

            await expect.poll(async () => {
                const
                    detail = first(await app.queryComponent(
                        {className: 'AgentOS.view.fleet.detail.Container'},
                        ['id', 'mounted', 'windowId']
                    )),
                    state  = await app.getComponent(cockpitId, ['detailVesselState', 'detachedDetail']);

                return {
                    detached: state.detachedDetail,
                    id      : detail?.id,
                    mounted : detail?.properties?.mounted,
                    state   : state.detailVesselState,
                    windowId: detail?.properties?.windowId
                }
            }, {
                message  : 'detail must return as the same instance with zero vessel residue',
                timeout  : 15000,
                intervals: [100, 250]
            }).toEqual({
                detached: null,
                id      : detailBefore.id,
                mounted : true,
                state   : 'docked',
                windowId: cockpit.properties.windowId
            });

            expect(page.context().pages().filter(candidate => !candidate.isClosed())).toHaveLength(1);

            await checkpoint(page, beats, 'both-reintegrated', {sameInstances: true, windows: 1});
            await testInfo.attach('n-window-beat-log.json', {
                body       : Buffer.from(JSON.stringify(beats, null, 2)),
                contentType: 'application/json'
            });

            expect(pageErrors, 'main-window page errors').toEqual([]);
            expect(popupErrors, 'vessel page errors').toEqual([])
        } finally {
            await fleet.close()
        }
    })
});
