import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockFlipTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import MainContainer  from '../../../../examples/dashboard/dock/MainContainer.mjs';
import DockFlip       from '../../../../src/main/addon/DockFlip.mjs';

/**
 * Creates the iterable class-list surface consumed by DockFlip.
 * @param {String[]} values
 * @returns {Object}
 */
function createClassList(...values) {
    const classes = new Set(values);

    return {
        add   : value => classes.add(value),
        remove: value => classes.delete(value),
        contains(value) {
            return classes.has(value)
        },
        [Symbol.iterator]() {
            return classes[Symbol.iterator]()
        }
    }
}

/**
 * Creates one marker element with mutable connection state and geometry.
 * @param {String} markerClass
 * @param {Object} rect
 * @returns {Object}
 */
function createMarker(markerClass, rect) {
    return {
        classList: createClassList(markerClass),
        getBoundingClientRect() {
            return rect
        },
        isConnected: true,
        style      : {}
    }
}

test.describe('Neo.main.addon.DockFlip', () => {
    let dockFlip,
        originalDocument,
        originalGetComputedStyle,
        originalMatchMedia,
        originalRequestAnimationFrame;

    test.beforeEach(async () => {
        originalDocument              = globalThis.document;
        originalGetComputedStyle      = globalThis.getComputedStyle;
        originalMatchMedia            = globalThis.matchMedia;
        originalRequestAnimationFrame = globalThis.requestAnimationFrame;
        dockFlip                      = Neo.create(DockFlip, {preloadFilesDelay: false});

        await dockFlip.ready()
    });

    test.afterEach(() => {
        dockFlip?.destroy();
        dockFlip = null;

        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalGetComputedStyle === undefined
            ? delete globalThis.getComputedStyle
            : globalThis.getComputedStyle = originalGetComputedStyle;
        originalMatchMedia === undefined ? delete globalThis.matchMedia : globalThis.matchMedia = originalMatchMedia;
        originalRequestAnimationFrame === undefined
            ? delete globalThis.requestAnimationFrame
            : globalThis.requestAnimationFrame = originalRequestAnimationFrame
    });

    test('uses dock item ids rather than component refs for projection marker identity', () => {
        const
            model = {
                schema: 'neo.harness.dockZone.v1',
                root  : 'root-tabs',
                items : {
                    'alpha pane': {componentRef: 'shared-ref', title: 'Alpha'},
                    'beta/pane' : {componentRef: 'shared-ref', title: 'Beta'}
                },
                nodes: {
                    'root-tabs': {
                        type        : 'tabs',
                        items       : ['alpha pane', 'beta/pane'],
                        activeItemId: 'alpha pane'
                    }
                }
            },
            context = {
                applyDockZoneOperation() {},
                dockModel: model,
                onDockCrossZoneDrop() {},
                onDockZoneDocumentChange() {}
            },
            projected = MainContainer.prototype.projectDockModel.call(context),
            markers   = projected.items.map(item => item.cls.find(cls => cls.startsWith('dock-flip-item-')));

        expect(markers).toEqual([
            'dock-flip-item-alpha%20pane',
            'dock-flip-item-beta%2Fpane'
        ])
    });

    test('reads the descendant dashboard token scope and preserves exact zero plus seconds', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            marker      = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            dashboard   = {},
            host        = {
                classList: createClassList(),
                querySelector(selector) {
                    return selector === '.neo-dashboard' ? dashboard : null
                },
                querySelectorAll() {
                    return [marker]
                }
            };

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.matchMedia = () => ({matches: false});

        let tokenOwner;

        globalThis.getComputedStyle = element => {
            tokenOwner = element;

            return {
                getPropertyValue(name) {
                    return name === '--dock-transition-duration' ? '0ms' : 'linear'
                }
            }
        };

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(tokenOwner).toBe(dashboard);
        expect(dockFlip.parseDurationToken('0ms')).toBe(0);
        expect(dockFlip.parseDurationToken('0.26s')).toBe(260);
        expect(dockFlip.parseDurationToken('bogus')).toBe(280)
    });

    test('restores the host class and every temporary style when a post-invert frame fails', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            outgoing    = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            incoming    = createMarker(markerClass, {height: 100, left: 80, top: 40, width: 100}),
            host        = {
                classList: createClassList(),
                markers  : [outgoing],
                querySelectorAll() {
                    return this.markers
                }
            };

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.matchMedia = () => ({matches: false});

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

        outgoing.isConnected = false;
        host.markers          = [incoming];

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            if (++frame === 2) {
                throw new Error('forced post-invert frame failure')
            }

            callback()
        };

        await expect(dockFlip.play({
            duration    : 1,
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(host.classList.contains('dock-animating')).toBe(false);
        expect(incoming.style).toMatchObject({
            opacity        : '',
            transform      : '',
            transformOrigin: '',
            transition     : ''
        })
    })
});
