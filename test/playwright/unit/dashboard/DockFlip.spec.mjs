import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockFlipTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockFlip       from '../../../../src/main/addon/DockFlip.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';

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
                schema: 'neo.dock.zone.v1',
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
            // a duck-typed host borrowing the engine class's projection loop: the members the
            // loop consults are supplied explicitly, the marker stamp rides the class default
            context = {
                applyDockZoneOperation() {},
                decorateFlipMarker      : DockWorkspace.prototype.decorateFlipMarker,
                dockModel               : model,
                dockProjectionConfig    : null,
                flipMarkerPrefix        : 'dock-flip-item-',
                getDockProjectionOptions: () => ({}),
                getPaneHeaderText       : DockWorkspace.prototype.getPaneHeaderText,
                onDockActiveIndexChange() {},
                onDockHeaderAction() {},
                onDockCrossZoneDrop() {},
                onDockZoneDocumentChange() {},
                resolvePane         : DockWorkspace.prototype.resolvePane,
                resolveProjectedPane: DockWorkspace.prototype.resolveProjectedPane,
                resolveRevealPane   : DockWorkspace.prototype.resolveRevealPane
            },
            projected = DockWorkspace.prototype.projectDockModel.call(context),
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

    test('skips the detach poll when an exact marker keeps its direct parent but crosses an ancestor boundary', async () => {
        const
            markerClass         = 'dock-flip-item-alpha',
            marker              = createMarker(markerClass, {height: 100, left: 0, top: 0, width: 100}),
            markerParent        = {parentElement: null},
            sourceAncestor      = {parentElement: null},
            destinationAncestor = {parentElement: null},
            host                = {
                classList    : createClassList(),
                parentElement: null,
                querySelector() {
                    return null
                },
                querySelectorAll() {
                    return [marker]
                }
            };

        sourceAncestor.parentElement      = host;
        destinationAncestor.parentElement = host;
        markerParent.parentElement        = sourceAncestor;
        marker.parentElement              = markerParent;

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
        markerParent.parentElement = destinationAncestor;
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

        expect(marker.parentElement, 'the marker direct parent remains identical').toBe(markerParent);
        expect(frame, 'the changed ancestor lineage bypasses the detach poll').toBe(1)
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

    test('bypasses the bounded wait for a landed-in-place set when the consumer declares a geometry-only projection', async () => {
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

        // The committed resize: same node, same lineage, moved geometry — landed-in-place.
        marker.setRect({height: 100, left: 80, top: 40, width: 140});

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            frame++;
            callback()
        };

        await expect(dockFlip.play({
            geometryOnly: true,
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-',
            maxFrames   : 2
        })).resolves.toBe(true);

        expect(frame, 'no detach poll and no replacement settle: only the post-invert frame remains').toBe(1)
    });

    test('keeps the bounded wait under a geometry-only declaration while the projection geometry is unchanged', async () => {
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

        let frame = 0;

        globalThis.requestAnimationFrame = callback => {
            frame++;
            callback()
        };

        // Unchanged geometry is the outgoing-tree case even under the hint: the swap has not
        // observably landed, so the poll and the settle frame stay — and with zero geometry
        // delta there is nothing to animate.
        await expect(dockFlip.play({
            geometryOnly: true,
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-',
            maxFrames   : 2
        })).resolves.toBe(false);

        expect(frame, 'two detach polls and one replacement settle; nothing to animate').toBe(3)
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
            defaultClass    = 'dock-flip-item-beta',
            effectiveClass  = 'dock-flip-item-gamma',
            marker          = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            defaultMarker   = createMarker(defaultClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            effectiveMarker = createMarker(effectiveClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
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
                    return [marker, defaultMarker, effectiveMarker]
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
        defaultMarker.parentElement   = sourceBody;
        effectiveMarker.parentElement = sourceBody;
        marker.style.position         = 'relative';
        marker.style.zIndex           = '7';

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = element => {
            if (element === destinationBody) {
                return {...visibleStyle, overflowX: 'hidden', overflowY: 'hidden'}
            }

            return element === effectiveMarker ? {...visibleStyle, zIndex: '13'} : visibleStyle
        };

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement = destinationBody;
        defaultMarker.parentElement = destinationBody;
        effectiveMarker.parentElement = destinationBody;
        marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});
        defaultMarker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});
        effectiveMarker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});

        const stageSamples = [];

        globalThis.requestAnimationFrame = callback => {
            stageSamples.push({
                defaultZIndex  : defaultMarker.style.zIndex,
                effectiveZIndex: effectiveMarker.style.zIndex,
                position       : marker.style.position,
                staged         : marker.classList.contains('neo-dock-flip-fixed-stage'),
                zIndex         : marker.style.zIndex
            });
            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(true);

        expect(stageSamples).toEqual([{
            defaultZIndex  : '2',
            effectiveZIndex: '13',
            position       : 'fixed',
            staged         : true,
            zIndex         : '7'
        }]);
        expect(marker.parentElement, 'the live pane remains the destination body child').toBe(destinationBody);
        expect(defaultMarker.parentElement).toBe(destinationBody);
        expect(effectiveMarker.parentElement).toBe(destinationBody);
        expect(destinationBody.style.overflow, 'the real tab-body clip is never mutated').toBeUndefined();
        expect(marker.style.position).toBe('relative');
        expect(marker.style.zIndex).toBe('7');
        expect(defaultMarker.style.zIndex, 'default stacking restores its exact empty inline value').toBe('');
        expect(effectiveMarker.style.zIndex, 'computed stacking never leaks into the inline style').toBe('');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false)
    });

    test('classifies a zero-area First as entering: no fixed stage, no zero-scale inverse (#16356)', async () => {
        const
            markerClass     = 'dock-flip-item-alpha',
            movingClass     = 'dock-flip-item-beta',
            marker          = createMarker(markerClass, {bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0}),
            movingMarker    = createMarker(movingClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
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
                    return [marker, movingMarker]
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
        movingMarker.parentElement    = sourceBody;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = element => element === destinationBody
            ? {...visibleStyle, overflowX: 'hidden', overflowY: 'hidden'}
            : visibleStyle;

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement       = destinationBody;
        movingMarker.parentElement = destinationBody;
        marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});
        movingMarker.setRect({bottom: 150, height: 50, left: 210, right: 290, top: 100, width: 80});

        const commitSamples = [];

        globalThis.requestAnimationFrame = callback => {
            commitSamples.push({
                opacity  : marker.style.opacity,
                staged   : marker.classList.contains('neo-dock-flip-fixed-stage'),
                transform: marker.style.transform
            });
            callback()
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(true);

        expect(commitSamples).toEqual([{
            opacity  : '0.001',
            staged   : false,
            transform: 'scale(0.92)'
        }]);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage'),
            'a never-presented element leaves no stage residue').toBe(false);
        expect(marker.style.transform ?? '', 'no zero-scale inverse is ever installed').not.toContain('scale(0,');
        expect(marker.style.opacity ?? '', 'the entering fade releases and restores').not.toBe('0.001')
    });

    test('skips a zero-area Last: nothing presents at the destination, the committed layout owns it (#16356)', async () => {
        const
            markerClass     = 'dock-flip-item-alpha',
            marker          = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            sourceBody      = {parentElement: null},
            destinationBody = {parentElement: null, style: {}},
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
        globalThis.getComputedStyle    = () => visibleStyle;
        globalThis.requestAnimationFrame = callback => callback();

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.parentElement = destinationBody;
        marker.setRect({bottom: 100, height: 0, left: 200, right: 200, top: 100, width: 0});

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(marker.style.transform, 'no motion is installed toward a non-presenting destination').toBeUndefined();
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
        marker.style.zIndex           = '9';

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
        expect(marker.style.zIndex).toBe('9');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);

        dockFlip.destroy();
        dockFlip = null;

        expect(marker.style.position).toBe('');
        expect(marker.style.transform).toBe('');
        expect(marker.style.zIndex).toBe('9');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);

        releaseFrame();

        await expect(playPromise).resolves.toBe(false)
    });

    test('land retires a captured First before a later play can arm presentation', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            marker      = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            host        = {
                classList: createClassList(),
                querySelector() {
                    return null
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

        let frames = 0;

        globalThis.requestAnimationFrame = () => ++frames;

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

        expect(dockFlip.landFromPath([{id: 'splitter'}, {id: 'foreign-host'}])).toBe(false);
        expect(dockFlip.landFromPath([{id: 'splitter'}, {id: 'dock-host'}])).toBe(true);
        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);
        expect(frames, 'a retired snapshot cannot open a pending frame wait').toBe(0)
    });

    test('land interrupts an active fixed stage without destroying the addon', async () => {
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
            host = {
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
        marker.style.zIndex           = '9';

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
        expect(DockFlip.config.remote.app).toContain('land');

        expect(dockFlip.land(), 'the public remote refuses an unscoped all-host landing').toBe(false);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);
        expect(dockFlip.land({hostId: 'other-host'}), 'a foreign host cannot land this presentation').toBe(false);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);
        expect(dockFlip.land({hostId: 'dock-host'}), 'the owning host lands its active presentation').toBe(true);
        expect(dockFlip.land({hostId: 'dock-host'}), 'landing is idempotent once no presentation remains').toBe(false);
        expect(dockFlip.isDestroyed).toBeFalsy();
        expect(marker.style.position).toBe('');
        expect(marker.style.transform).toBe('');
        expect(marker.style.zIndex).toBe('9');
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);

        releaseFrame();

        await expect(playPromise).resolves.toBe(false)
    });

    test('land invalidates a pending play before it can arm fixed-stage presentation', async () => {
        const
            markerClass     = 'dock-flip-item-alpha',
            marker          = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            sourceBody      = {parentElement: null},
            destinationBody = {parentElement: null},
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
                    return name === '--dock-transition-duration' ? '260ms' : 'linear'
                }
            },
            frames = [];

        sourceBody.parentElement      = host;
        destinationBody.parentElement = host;
        marker.parentElement          = sourceBody;

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle      = () => visibleStyle;
        globalThis.requestAnimationFrame = callback => {
            frames.push(callback);
            return frames.length
        };

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

        const playPromise = dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-',
            maxFrames   : 1
        });

        expect(frames).toHaveLength(1); // play is pending in stage A, before #activeCleanups

        marker.parentElement = destinationBody;
        marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});

        expect(dockFlip.land({hostId: 'dock-host'}), 'pending host play is an admitted landing target').toBe(true);
        await expect(playPromise).resolves.toBe(false);
        expect(frames, 'settlement does not need the held frame carrier to run').toHaveLength(1);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);
        expect(marker.style.position).toBeUndefined();
        expect(dockFlip.land({hostId: 'dock-host'}), 'the pending registration retires on settle').toBe(false)
    });

    test('a same-host successor lands its active predecessor before capturing inline authority', async () => {
        const
            markerClass = 'dock-flip-item-alpha',
            marker      = createMarker(markerClass, {bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100}),
            sourceBody  = {parentElement: null},
            middleBody  = {
                parentElement        : null,
                getBoundingClientRect: () => ({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100})
            },
            targetBody  = {
                parentElement        : null,
                getBoundingClientRect: () => ({bottom: 300, height: 100, left: 400, right: 500, top: 200, width: 100})
            },
            host = {
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
                    return name === '--dock-transition-duration' ? '260ms' : 'linear'
                }
            },
            inlineProperties = [
                'bottom', 'boxSizing', 'height', 'left', 'margin', 'maxHeight', 'maxWidth',
                'minHeight', 'minWidth', 'opacity', 'position', 'right', 'top', 'transform',
                'transformOrigin', 'transition', 'width', 'zIndex'
            ],
            frames = new Map();

        let frameId = 0;

        sourceBody.parentElement = middleBody.parentElement = targetBody.parentElement = host;
        marker.parentElement = sourceBody;
        Object.assign(marker.style, {
            position : 'relative',
            transform: 'rotate(1deg)',
            width    : '17%',
            zIndex   : '9'
        });

        const originalInline = Object.fromEntries(inlineProperties.map(property => [
            property,
            marker.style[property] ?? ''
        ]));

        globalThis.document = {
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = element => [middleBody, targetBody].includes(element)
            ? {...visibleStyle, overflowX: 'hidden', overflowY: 'hidden'}
            : visibleStyle;

        const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

        globalThis.requestAnimationFrame = callback => {
            const id = ++frameId;

            frames.set(id, callback);

            return id
        };
        globalThis.cancelAnimationFrame = id => frames.delete(id);

        try {
            dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
            marker.parentElement = middleBody;
            marker.setRect({bottom: 200, height: 100, left: 200, right: 300, top: 100, width: 100});

            const firstPlay = dockFlip.play({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

            expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);

            // The successor capture overlaps the active predecessor. It must land the old stage
            // before recording First, otherwise its cleanup snapshot canonizes temporary fixed px.
            dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
            await expect(firstPlay).resolves.toBe(false);
            expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);

            marker.parentElement = targetBody;
            marker.setRect({bottom: 300, height: 100, left: 400, right: 500, top: 200, width: 100});

            const secondPlay = dockFlip.play({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});

            expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(true);
            expect(dockFlip.land({hostId: 'dock-host'})).toBe(true);
            await expect(secondPlay).resolves.toBe(false)
        } finally {
            originalCancelAnimationFrame === undefined
                ? delete globalThis.cancelAnimationFrame
                : globalThis.cancelAnimationFrame = originalCancelAnimationFrame
        }

        expect(Object.fromEntries(inlineProperties.map(property => [
            property,
            marker.style[property] ?? ''
        ]))).toEqual(originalInline);
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false);
        expect(frames.size, 'both interrupted frame carriers are retired').toBe(0)
    });

    test('instant-lands at entry in a hidden document without arming a single wait (#16425)', async () => {
        // A hidden document cannot present motion, services no rAF, and visibility-clamps
        // main-thread timers (>=1s per tick, ~1 wake/min intensive) — so neither frame waits
        // nor the timer dam stay bounded there. The entry discriminator must land instantly
        // before any wait is armed.
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
            hidden: true,
            getElementById(id) {
                return id === 'dock-host' ? host : null
            }
        };
        globalThis.getComputedStyle = () => ({
            getPropertyValue(name) {
                return name === '--dock-transition-duration' ? '260ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.setRect({height: 100, left: 80, top: 40, width: 100});

        let frameRequests = 0;

        globalThis.requestAnimationFrame = () => ++frameRequests;

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(frameRequests, 'no frame wait is ever armed in a hidden document').toBe(0);
        expect(marker.style, 'no presentation state is touched').toEqual({})
    });

    test('lands instantly when rendering starvation never services the release frame (#16425)', async () => {
        // Rendering-starved documents (hidden panes, occluded windows) request frames that are
        // never serviced. Pre-dam, play() awaited the raw rAF promise here and never resolved,
        // wedging every awaiting consumer (the workstation tour hung in refreshDockWorkspace).
        // The timer dam bounds the wait; a starved release tick lands instantly with a full
        // presentation cleanup.
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
                    return name === '--dock-transition-duration' ? '260ms' : 'linear'
                }
            };

        sourceBody.parentElement      = host;
        destinationBody.parentElement = host;
        marker.parentElement          = sourceBody;
        marker.style.position         = 'relative';
        marker.style.zIndex           = '11';

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

        let frameRequests = 0;

        globalThis.requestAnimationFrame = () => ++frameRequests;

        const startedAt = Date.now();

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(Date.now() - startedAt, 'the dam bounds the starved wait in time').toBeLessThan(5000);
        expect(frameRequests, 'exactly the release frame was requested on the preserved path').toBe(1);
        expect(host.classList.contains('dock-animating')).toBe(false);
        expect(marker.style).toMatchObject({
            opacity        : '',
            position       : 'relative',
            transform      : '',
            transformOrigin: '',
            transition     : '',
            zIndex         : '11'
        });
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false)
    });

    test('bounds the detach and settle polls in time when no frame is ever serviced (#16425)', async () => {
        // The same ambiguous same-parent fixture the presenting-mode test animates (frame
        // stub invoking callbacks) resolves to an instant landing under starvation: the polls
        // tick on the dam instead of frames, stay count-bounded, and the starved release tick
        // skips the transition.
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
                return name === '--dock-transition-duration' ? '260ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.setRect({height: 100, left: 80, top: 40, width: 100});

        let frameRequests = 0;

        globalThis.requestAnimationFrame = () => ++frameRequests;

        const startedAt = Date.now();

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-',
            maxFrames   : 2
        })).resolves.toBe(false);

        expect(Date.now() - startedAt, 'the dam bounds every starved poll in time').toBeLessThan(5000);
        expect(frameRequests, 'two detach polls, one replacement settle, and one starved release tick').toBe(4);
        expect(host.classList.contains('dock-animating')).toBe(false);
        expect(marker.style).toMatchObject({
            opacity        : '',
            transform      : '',
            transformOrigin: '',
            transition     : ''
        })
    });

    test('cancels the losing rAF arm on every timer-won wait — no late frame callback stays queued (#16425)', async () => {
        // The race must dispose BOTH arms (the ResizeObserver dam contract). Without the
        // cancellation, each timer-won wait in a frame-starved-but-visible window leaves its
        // callback queued; dock operations accumulate them unboundedly and they all fire in
        // one burst when the window presents again.
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
                return name === '--dock-transition-duration' ? '260ms' : 'linear'
            }
        });

        dockFlip.captureFirst({hostId: 'dock-host', markerPrefix: 'dock-flip-item-'});
        marker.setRect({height: 100, left: 80, top: 40, width: 100});

        // Black-holed rAF with id bookkeeping: callbacks register but are never invoked.
        const
            registered          = new Set(),
            cancelled           = new Set(),
            originalCancelFrame = globalThis.cancelAnimationFrame;

        let nextFrameId = 0;

        globalThis.requestAnimationFrame = () => {
            const id = ++nextFrameId;
            registered.add(id);
            return id
        };
        globalThis.cancelAnimationFrame = id => cancelled.add(id);

        try {
            await expect(dockFlip.play({
                hostId      : 'dock-host',
                markerPrefix: 'dock-flip-item-',
                maxFrames   : 2
            })).resolves.toBe(false);

            expect(registered.size, 'two detach polls, one replacement settle, and one release tick registered').toBe(4);
            expect([...cancelled].sort(), 'every timer-won wait cancelled exactly its own losing arm')
                .toEqual([...registered].sort());
            expect([...registered].filter(id => !cancelled.has(id)),
                'no frame callback stays queued after the starved run').toEqual([])
        } finally {
            originalCancelFrame === undefined
                ? delete globalThis.cancelAnimationFrame
                : globalThis.cancelAnimationFrame = originalCancelFrame
        }
    });

    test('restores the host class and every temporary style when a post-invert frame fails', async () => {
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
        marker.style.position         = 'relative';
        marker.style.zIndex           = '11';

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

        globalThis.requestAnimationFrame = () => {
            throw new Error('forced post-invert frame failure')
        };

        await expect(dockFlip.play({
            hostId      : 'dock-host',
            markerPrefix: 'dock-flip-item-'
        })).resolves.toBe(false);

        expect(host.classList.contains('dock-animating')).toBe(false);
        expect(marker.style).toMatchObject({
            opacity        : '',
            position       : 'relative',
            transform      : '',
            transformOrigin: '',
            transition     : '',
            zIndex         : '11'
        });
        expect(marker.classList.contains('neo-dock-flip-fixed-stage')).toBe(false)
    })
});
