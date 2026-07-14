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
    let currentRect = rect;

    return {
        classList: createClassList(markerClass),
        getBoundingClientRect() {
            return currentRect
        },
        isConnected  : true,
        parentElement: null,
        setRect(value) {
            currentRect = value
        },
        style: {}
    }
}

test.describe('Neo.main.addon.DockFlip', () => {
    let dockFlip,
        originalDocument,
        originalGetComputedStyle,
        originalRequestAnimationFrame;

    test.beforeEach(async () => {
        originalDocument              = globalThis.document;
        originalGetComputedStyle      = globalThis.getComputedStyle;
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
        expect(dockFlip.parseDurationToken('260ms')).toBe(260);
        expect(dockFlip.parseDurationToken('0.26s')).toBe(260);
        expect(dockFlip.parseDurationToken('bogus')).toBe(0);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);
        expect(marker.style).toEqual({})
    });

    test('skips the detach poll when the complete marker set keeps the same connected identities', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            marker      = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            sourceBody  = {parentElement: null},
            targetBody  = {parentElement: null},
            host        = {
                classList    : createClassList(),
                parentElement: null,
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return [marker]
                }
            };

        sourceBody.parentElement = host;
        targetBody.parentElement = host;
        marker.parentElement     = sourceBody;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = () => ({
            getPropertyValue(name) {
                return name === '--dock-transition-duration' ? '1ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement = targetBody;
        marker.setRect({height: 100, left: 80, top: 40, width: 100});

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            frame++;
            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(true);

        expect(frame, 'only the post-invert frame remains on the preserved-identity path').toBe(1)
    });

    test('retains the bounded wait for an exact same-parent set whose projection is still ambiguous', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            marker      = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            host        = {
                classList    : createClassList(),
                parentElement: null,
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return [marker]
                }
            };

        marker.parentElement = host;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = () => ({
            getPropertyValue(name) {
                return name === '--dock-transition-duration' ? '1ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.setRect({height: 100, left: 80, top: 40, width: 100});

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            frame++;
            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-',
            maxFrames   : 2
        })).resolves.toBe(true);

        expect(frame, 'two detach polls, one replacement settle, and one post-invert frame').toBe(4)
    });

    test('retains the bounded detach wait when replacement markers take over', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            outgoing    = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            incoming    = createMarker(markerClass, {height: 100, left: 80, top: 40, width: 100}),
            host        = {
                classList: createClassList(),
                markers  : [outgoing],
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return this.markers
                }
            };

        outgoing.parentElement = host;
        incoming.parentElement = host;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = () => ({
            getPropertyValue(name) {
                return name === '--dock-transition-duration' ? '1ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            frame++;

            if (frame === 3) {
                outgoing.isConnected = false;
                host.markers          = [incoming]
            }

            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(true);

        expect(frame, 'three detach polls, one replacement settle, and one post-invert frame').toBe(5)
    });

    test('fixed-stages a preserved cross-parent move without changing the destination clip', async () => {
        const
            markerClass     = 'dock-flip-item-alpha',
            marker          = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            sourceBody      = {parentElement: null},
            destinationBody = {
                parentElement: null,
                style        : {},
                getBoundingClientRect() {
                    return {bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100}
                }
            },
            host            = {
                classList    : createClassList(),
                parentElement: null,
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return [marker]
                }
            },
            visibleStyle = {
                contain    : 'none',
                filter     : 'none',
                overflowX  : 'visible',
                overflowY  : 'visible',
                perspective: 'none',
                transform  : 'none',
                willChange : 'auto',
                getPropertyValue(name) {
                    return name === '--dock-transition-duration' ? '1ms' : 'linear'
                }
            };

        sourceBody.parentElement      = host;
        destinationBody.parentElement = host;
        marker.parentElement          = sourceBody;
        marker.style.position         = 'relative';
        marker.style.zIndex           = '7';

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = element => element === destinationBody
            ? {...visibleStyle, overflowX: 'hidden', overflowY: 'hidden'}
            : visibleStyle;

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement = destinationBody;
        marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});

        const stageSamples = [];

        globalThis.requestAnimationFrame = callback => {
            stageSamples.push({
                position: marker.style.position,
                staged  : marker.classList.contains('neo-dock-flip-fixed-stage')
            });
            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(true);

        expect(stageSamples).toEqual([{position: 'fixed', staged: true}]);
        expect(marker.parentElement, 'the live pane remains the destination body child').toBe(destinationBody);
        expect(destinationBody.style.overflow, 'the real tab-body clip is never mutated').toBeUndefined();
        expect(marker.style.position).toBe('relative');
        expect(marker.style.zIndex).toBe('7');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false)
    });

    test('destroy interrupts an active fixed stage and restores its presentation state', async () => {
        const
            markerClass     = 'dock-flip-item-alpha',
            marker          = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            sourceBody      = {parentElement: null},
            destinationBody = {
                parentElement: null,
                getBoundingClientRect() {
                    return {bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100}
                }
            },
            host            = {
                classList    : createClassList(),
                parentElement: null,
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return [marker]
                }
            },
            visibleStyle = {
                contain    : 'none',
                filter     : 'none',
                overflowX  : 'visible',
                overflowY  : 'visible',
                perspective: 'none',
                transform  : 'none',
                willChange : 'auto',
                getPropertyValue(name) {
                    return name === '--dock-transition-duration' ? '1ms' : 'linear'
                }
            };

        sourceBody.parentElement      = host;
        destinationBody.parentElement = host;
        marker.parentElement          = sourceBody;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = element => element === destinationBody
            ? {...visibleStyle, overflowX: 'hidden', overflowY: 'hidden'}
            : visibleStyle;

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement = destinationBody;
        marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});

        let releaseFrame;

        globalThis.requestAnimationFrame = callback => {
            releaseFrame = callback
        };

        const playPromise = dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        });

        expect(marker.style.position).toBe('fixed');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);

        dockFlip.destroy();
        dockFlip = null;

        expect(marker.style.position).toBe('');
        expect(marker.style.transform).toBe('');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);

        releaseFrame();

        await expect(playPromise).resolves.toBe(false)
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
        globalThis.getComputedStyle = () => ({
            getPropertyValue(name) {
                return name === '--dock-transition-duration' ? '1ms' : 'linear'
            }
        });

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
