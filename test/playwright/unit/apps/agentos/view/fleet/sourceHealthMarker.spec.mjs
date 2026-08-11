import {setup} from '../../../../../setup.mjs';

const appName = 'FleetSourceHealthMarkerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                                                                            from '@playwright/test';
import Neo                                                                                       from '../../../../../../../src/Neo.mjs';
import * as core                                                                                 from '../../../../../../../src/core/_export.mjs';
import SourceHealthMarker, {sourceMarkerView}                                                    from '../../../../../../../apps/agentos/view/fleet/SourceHealthMarker.mjs';
import {mapFleetSessionHealth, mapFleetSessionState, normalizeFleetSources, normalizeSourceFact} from '../../../../../../../apps/agentos/view/fleet/sourceHealth.mjs';

test.describe('Fleet source-health honesty (#14643)', () => {
    test('renders every source-state × confidence combination without a placeholder-as-fact path', () => {
        const
            states      = ['wired', 'missing', 'not-wired'],
            confidences = ['observed', 'inferred', 'none'];

        for (const state of states) {
            for (const confidence of confidences) {
                const
                    health        = {source: 'fleet:runtimeStatus', state, confidence},
                    normalized    = normalizeSourceFact(health),
                    // impossible pairs are PRESENT contradictory facts → rejected evidence
                    // (`invalid`), never silently accepted: wired needs a usable confidence;
                    // missing/not-wired cannot CARRY one — only their explicit `none` pairing is
                    // the declared shape
                    expectedState = state === 'wired'
                        ? (confidence !== 'none' ? 'wired' : 'invalid')
                        : confidence === 'none'
                            ? state
                            : 'invalid',
                    expectedConfidence   = expectedState === 'wired' ? confidence : 'none',
                    expectedReason       = expectedState === 'invalid' ? 'source fact failed contract validation' : null,
                    expectedTreatment    = expectedState === 'wired'
                        ? expectedConfidence.toUpperCase()
                        : expectedState === 'missing'
                            ? 'MISSING'
                            : expectedState === 'invalid'
                                ? 'INVALID'
                                : 'NOT WIRED',
                    view                 = sourceMarkerView('runtime', health),
                    marker               = Neo.create(SourceHealthMarker, {appName, sourceKey: 'runtime', health});

                expect(normalized).toEqual({source: 'fleet:runtimeStatus', state: expectedState, confidence: expectedConfidence, reason: expectedReason});
                expect(view).toMatchObject({
                    stateClass     : `fm-source-${expectedState}`,
                    confidenceClass: `fm-confidence-${expectedConfidence}`,
                    text           : `RUN ${expectedTreatment}`,
                    ariaLabel      : `Runtime source: ${expectedState.replace('-', ' ')}, confidence ${expectedConfidence}.`
                });
                expect(marker.cls).toContain(view.stateClass);
                expect(marker.cls).toContain(view.confidenceClass);
                expect(marker.text).toBe(view.text);
                expect(marker.getVdomRoot()['aria-label']).toBe(view.ariaLabel);

                marker.destroy()
            }
        }
    });

    test('rejected evidence reads `invalid` — only GENUINE absence fails closed to the calm `not-wired`', () => {
        // absence: no fact was supplied at all — the one calm shape
        for (const value of [null, undefined]) {
            expect(normalizeSourceFact(value)).toEqual({source: null, state: 'not-wired', confidence: 'none', reason: null})
        }

        // present but malformed (non-plain / prototype-shaped): rejected evidence, operator-visible —
        // an invalid answer must never normalize into the same green surface as no producer
        for (const value of [[], 'wired', Object.create({state: 'wired', confidence: 'observed'})]) {
            expect(normalizeSourceFact(value)).toEqual({source: null, state: 'invalid', confidence: 'none', reason: 'malformed source fact'})
        }

        // present plain objects failing producer validation (no/blank/non-string source)
        expect(normalizeSourceFact({})).toEqual({source: null, state: 'invalid', confidence: 'none', reason: 'source fact failed producer validation'});
        expect(normalizeSourceFact({state: 'unknown', confidence: 'observed'})).toEqual({source: null, state: 'invalid', confidence: 'none', reason: 'source fact failed producer validation'});

        // inherited keys are refused as ABSENT (own-key discipline): the axis reads not-wired
        const polluted = Object.create({runtime: {state: 'wired', confidence: 'observed'}});
        expect(normalizeFleetSources(polluted).runtime).toEqual({source: null, state: 'not-wired', confidence: 'none', reason: null});

        for (const source of [undefined, '', '   ', 42]) {
            expect(normalizeSourceFact({source, state: 'wired', confidence: 'observed'}))
                .toEqual({source: null, state: 'invalid', confidence: 'none', reason: 'source fact failed producer validation'})

            expect(normalizeSourceFact({source, state: 'missing', confidence: 'none'}))
                .toEqual({source: null, state: 'invalid', confidence: 'none', reason: 'source fact failed producer validation'})
        }
    });

    test('running state is trusted only behind a wired runtime source', () => {
        const observed = {
            lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'},
            sources  : {runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}}
        };

        expect(mapFleetSessionState(observed.lifecycle, observed.sources)).toBe('ok');
        expect(mapFleetSessionState(
            {...observed.lifecycle, confidence: 'inferred'},
            {runtime: {...observed.sources.runtime, confidence: 'inferred'}}
        )).toBe('ok');
        expect(mapFleetSessionState(observed.lifecycle, {runtime: {...observed.sources.runtime, state: 'not-wired', confidence: 'none'}})).toBe('off');
        expect(mapFleetSessionState(observed.lifecycle, {runtime: {...observed.sources.runtime, state: 'missing', confidence: 'none'}})).toBe('off');
        expect(mapFleetSessionState({...observed.lifecycle, source: ''}, observed.sources)).toBe('off');
        expect(mapFleetSessionState({...observed.lifecycle, confidence: 'none'}, observed.sources)).toBe('off');
        expect(mapFleetSessionState({...observed.lifecycle, confidence: 'inferred'}, observed.sources)).toBe('off');
        expect(mapFleetSessionState(observed.lifecycle, {})).toBe('off')
    });

    test('source axes and lifecycle fields require canonical own-key facts', () => {
        const
            inheritedFact = new Proxy({source: 'fleet:runtimeStatus'}, {
                get(target, key, receiver) {
                    if (key === 'state') return 'wired'
                    if (key === 'confidence') return 'observed'
                    return Reflect.get(target, key, receiver)
                }
            }),
            inheritedSources = new Proxy({}, {
                get(target, key, receiver) {
                    return key === 'runtime'
                        ? {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
                        : Reflect.get(target, key, receiver)
                }
            }),
            inheritedLifecycle = new Proxy({source: 'fleet:runtimeStatus', state: 'running'}, {
                get(target, key, receiver) {
                    return key === 'confidence' ? 'observed' : Reflect.get(target, key, receiver)
                }
            }),
            runtime = {runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}};

        // a fact whose state/confidence live only on the prototype chain is a PRESENT answer this
        // contract rejects — invalid, never silently calm
        expect(normalizeSourceFact(inheritedFact)).toEqual({source: 'fleet:runtimeStatus', state: 'invalid', confidence: 'none', reason: 'source fact failed contract validation'});
        // an inherited AXIS key is refused as absent (own-key discipline) — genuinely calm
        expect(normalizeFleetSources(inheritedSources).runtime).toEqual({source: null, state: 'not-wired', confidence: 'none', reason: null});
        expect(mapFleetSessionState(inheritedLifecycle, runtime)).toBe('off');
        // a cross-axis producer literal is rejected evidence: invalid, operator-visible
        expect(mapFleetSessionHealth(
            {source: 'fleet:listAgents', state: 'running', confidence: 'observed'},
            {runtime: {source: 'fleet:listAgents', state: 'wired', confidence: 'observed'}}
        )).toMatchObject({state: 'off', sources: {runtime: {state: 'invalid', confidence: 'none'}}})
    });

    test('lifecycle/source contradictions downgrade runtime provenance atomically', () => {
        const sources = {runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}};

        // a contradiction is rejected evidence — the downgrade names it and stays operator-visible
        expect(mapFleetSessionHealth(null, sources)).toEqual({
            sources: {
                roster    : {source: null, state: 'not-wired', confidence: 'none', reason: null},
                repoStatus: {source: null, state: 'not-wired', confidence: 'none', reason: null},
                runtime   : {source: 'fleet:runtimeStatus', state: 'invalid', confidence: 'none', reason: 'lifecycle and runtime facts contradict'}
            },
            state: 'off'
        });
        expect(mapFleetSessionHealth(
            {source: 'fleet:runtimeStatus', state: 'running', confidence: 'inferred'},
            sources
        )).toMatchObject({state: 'off', sources: {runtime: {state: 'invalid', confidence: 'none'}}});
        expect(mapFleetSessionHealth(
            {source: 'fleet:runtimeStatus', state: 'stopped', confidence: 'observed'},
            sources
        )).toMatchObject({state: 'off', sources: {runtime: {state: 'wired', confidence: 'observed'}}})
    });

    test('presentation carries both axes in classes, visible text, and ARIA', () => {
        const inferred = sourceMarkerView('runtime', {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'inferred'});
        expect(inferred).toMatchObject({
            stateClass     : 'fm-source-wired',
            confidenceClass: 'fm-confidence-inferred',
            text           : 'RUN INFERRED',
            ariaLabel      : 'Runtime source: wired, confidence inferred.'
        });

        const absent = sourceMarkerView('repoStatus', null);
        expect(absent).toMatchObject({
            stateClass     : 'fm-source-not-wired',
            confidenceClass: 'fm-confidence-none',
            text           : 'REP NOT WIRED'
        })
    });

    test('component swaps state + confidence treatments in place with zero inline token writes', () => {
        const marker = Neo.create(SourceHealthMarker, {
            appName,
            sourceKey: 'runtime',
            health   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        });

        expect(marker.cls).toContain('fm-source-wired');
        expect(marker.cls).toContain('fm-confidence-observed');
        expect(marker.text).toBe('RUN OBSERVED');
        expect(marker.getVdomRoot()['aria-label']).toBe('Runtime source: wired, confidence observed.');
        expect(marker.style?.['--fm-source-mark']).toBeUndefined();

        marker.health = {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'};
        expect(marker.cls).toContain('fm-source-not-wired');
        expect(marker.cls).toContain('fm-confidence-none');
        expect(marker.cls).not.toContain('fm-source-wired');
        expect(marker.text).toBe('RUN NOT WIRED');

        marker.destroy()
    })

    test('publishes class and text changes as one coherent reactive batch', () => {
        const
            marker = Neo.create(SourceHealthMarker, {
                appName,
                sourceKey: 'runtime',
                health   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
            }),
            observed = [];

        const cleanup = marker.observeConfig(marker, 'cls', cls => {
            observed.push({cls, text: marker.text})
        });

        marker.health = {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'};

        expect(observed).toHaveLength(1);
        expect(observed[0].cls).toContain('fm-source-not-wired');
        expect(observed[0].cls).not.toContain('fm-source-wired');
        expect(observed[0].text).toBe('RUN NOT WIRED');

        cleanup();
        marker.destroy()
    })
});
