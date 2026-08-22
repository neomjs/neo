import {setup} from '../../../../setup.mjs'

const appName = 'ActivityStreamTextTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import ActivityStream from '../../../../../../apps/agentos/view/fleet/activity/Container.mjs'

// Text-derivation logic only — exercised via prototype calls (no component lifecycle, no stores,
// no timers): the methods read nothing off the instance beyond each other.
const {eventText, stallText} = ActivityStream.prototype,
      host                   = {stallText}

test.describe('ActivityStream — row text derivation (two payload vocabularies, one string contract)', () => {
    test('an A2A row keeps its string subject — the message-subject vocabulary is untouched', () => {
        expect(eventText.call(host, {payload: {subject: 'PR #16368 approved'}})).toBe('PR #16368 approved')
    })

    test('a work-stall subject ENTITY renders the stall text — never [object Object]', () => {
        const text = eventText.call(host, {
            type   : 'work-stall',
            agentId: '@neo-opus-grace',
            payload: {
                kind        : 'work-stall',
                findingClass: 'ownership-gap',
                subject     : {number: 16310, title: 'Nothing arms a wake route at boot'}
            }
        })

        expect(text).toBe('stalled · #16310 · Nothing arms a wake route at boot')
        expect(text).not.toContain('object Object')
    })

    test('a stall without a describable subject still reads as a stall via its finding class', () => {
        expect(eventText.call(host, {type: 'work-stall', payload: {kind: 'work-stall', findingClass: 'ownership-gap', subject: {}}}))
            .toBe('stalled · ownership-gap')

        expect(eventText.call(host, {type: 'work-stall', payload: {kind: 'work-stall', subject: null}}))
            .toBe('stalled · work item')
    })

    test('an id-anchored subject without a number still yields a reference', () => {
        expect(stallText.call(host, {subject: {id: 'LANE:fm-week', title: null}})).toBe('stalled · LANE:fm-week')
    })

    test('a non-stall OBJECT subject degrades to the agent+type fallback — the string guard holds for every vocabulary', () => {
        expect(eventText.call(host, {type: 'a2a', agentId: '@neo-gpt', payload: {subject: {weird: true}}}))
            .toBe('@neo-gpt · a2a')
    })

    test('empty payloads keep the named fallback', () => {
        expect(eventText.call(host, {})).toBe('fleet · event')
    })
})
