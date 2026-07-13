import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import {
    classifyDiscussionRoutingDisposition,
    findLifecycleMarkers,
    normalizeDiscussionRoutingProjection
} from '../../../../../../ai/services/github-workflow/shared/discussionRoutingDisposition.mjs';

test.describe('discussionRoutingDisposition', () => {
    test('classifies explicit trusted convergence and evergreen signals as active', () => {
        for (const marker of ['CONVERGING', 'GRADUATION_PROPOSED', 'OQ_RESOLUTION_PENDING', 'EVERGREEN', 'REVALIDATED']) {
            const result = classifyDiscussionRoutingDisposition({
                author: 'neo-gpt',
                body  : `[${marker}] live scope`,
                closed: false
            });

            expect(result).toMatchObject({
                disposition: 'active',
                reasonCode : 'explicit-active-marker'
            });
            expect(result.evidence).toContain(`marker:${marker}`)
        }
    });

    test('gives explicit terminal state precedence over older active signals', () => {
        const result = classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : [
                '[CONVERGING] prior cycle',
                '[GRADUATED_TO_TICKET: #15100]'
            ].join('\n')
        });

        expect(result).toEqual({
            schemaVersion: 'discussion-routing-disposition.v1',
            disposition  : 'terminal',
            reasonCode   : 'graduated-to-ticket',
            evidence     : ['marker:GRADUATED_TO_TICKET']
        })
    });

    test('ignores terminal markers inside non-authoritative sections while preserving current active authority', () => {
        for (const nonAuthoritativeHeading of [
            '## History',
            '## Historical decisions',
            '## Retrospective',
            '## Archive',
            '## Archived decisions',
            '## Examples',
            '## Instruction',
            '## Instructions',
            '## Instructional syntax',
            '## How-to',
            '## Usage',
            '## Signal Ledger (archived — nothing graduated)'
        ]) {
            const result = classifyDiscussionRoutingDisposition({
                author: 'neo-gpt',
                body  : [
                    nonAuthoritativeHeading,
                    '[SUPERSEDED] prior direction',
                    '### Prior-cycle detail',
                    '[GRADUATED_TO_TICKET: #1] historical result',
                    '## Current status',
                    '[CONVERGING] work continues'
                ].join('\n')
            });

            expect(result, nonAuthoritativeHeading).toEqual({
                schemaVersion: 'discussion-routing-disposition.v1',
                disposition  : 'active',
                reasonCode   : 'explicit-active-marker',
                evidence     : ['marker:CONVERGING']
            })
        }
    });

    test('restores lifecycle authority after leaving a historical section', () => {
        expect(findLifecycleMarkers([
            '## Historical decisions',
            '[SUPERSEDED] prior direction',
            '### Current status inside the historical subtree',
            '[DECLINED] still historical',
            '## Current status',
            '[CONVERGING] current direction'
        ].join('\n'))).toEqual(['CONVERGING']);

        expect(classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : [
                '### Examples',
                '[SUPERSEDED] syntax example',
                '## [SUPERSEDED] current whole-Discussion status'
            ].join('\n')
        })).toMatchObject({
            disposition: 'terminal',
            reasonCode : 'terminal-marker:superseded'
        })
    });

    test('treats Setext historical and instructional subtrees as non-authoritative, then restores authority', () => {
        for (const body of [
            [
                'History',
                '-------',
                '[SUPERSEDED] historical only',
                'Current status',
                '--------------',
                '[CONVERGING] current direction'
            ].join('\n'),
            [
                'Instructions',
                '============',
                '[GRADUATED_TO_TICKET: #1] example only',
                'Current status',
                '==============',
                '[CONVERGING] current direction'
            ].join('\n')
        ]) {
            expect(classifyDiscussionRoutingDisposition({author: 'neo-gpt', body}), body).toEqual({
                schemaVersion: 'discussion-routing-disposition.v1',
                disposition  : 'active',
                reasonCode   : 'explicit-active-marker',
                evidence     : ['marker:CONVERGING']
            })
        }
    });

    test('does not let fenced or quoted headings suppress current terminal authority', () => {
        for (const body of [
            '```md\n## Historical decisions\n```\n[SUPERSEDED] current status',
            '> ## Historical decisions\n[SUPERSEDED] current status',
            '## Current status\n[SUPERSEDED] current status'
        ]) {
            expect(classifyDiscussionRoutingDisposition({author: 'neo-gpt', body}), body).toMatchObject({
                disposition: 'terminal',
                reasonCode : 'terminal-marker:superseded'
            })
        }
    });

    test('keeps partially resolved scope active and never infers whole-Discussion terminal state from one resolved OQ', () => {
        const partial = classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : 'OQ1 [RESOLVED_TO_AC]\nOQ2 [OQ_RESOLUTION_PENDING]'
        });
        const resolved = classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : 'OQ1 [RESOLVED_TO_AC]'
        });

        expect(partial.disposition).toBe('active');
        expect(resolved).toMatchObject({
            disposition: 'undetermined',
            reasonCode : 'resolved-scope-without-terminal-signal'
        })
    });

    test('ignores quoted and fenced marker examples while accepting canonical author update annotations', () => {
        expect(findLifecycleMarkers('> [GRADUATED_TO_TICKET: #1] historical quote')).toEqual([]);
        expect(findLifecycleMarkers('```md\n[GRADUATED_TO_TICKET: #1]\n```')).toEqual([]);
        expect(findLifecycleMarkers('Previously [GRADUATION_PROPOSED], now withdrawn.')).toEqual([]);
        expect(findLifecycleMarkers('> **Update 2026-05-20 (Cycle-4 — `[GRADUATION_PROPOSED]`):** quorum remains open.'))
            .toContain('GRADUATION_PROPOSED');
        expect(classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : '> **Update 2026-07-12:** [GRADUATED_TO_TICKET: #15100]'
        })).toMatchObject({
            disposition: 'terminal',
            reasonCode : 'graduated-to-ticket'
        });
        expect(classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : '> **Update 2026-07-12:** [DECLINED] superseded by evidence.'
        })).toMatchObject({
            disposition: 'terminal',
            reasonCode : 'terminal-marker:declined'
        });
        expect(findLifecycleMarkers('**Status:** [GRADUATED_TO_TICKET: #15100] — shipped.'))
            .toContain('GRADUATED_TO_TICKET')
    });

    test('preserves canonical legacy graduation callouts from the live corpus', () => {
        for (const number of [10289, 14456]) {
            const content = fs.readFileSync(`resources/content/discussions/chunk-1/discussion-${number}.md`, 'utf8');
            const author  = content.match(/^author:\s*([^\n]+)$/m)?.[1]?.trim();
            const body    = content.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n## Comments\s*\n/)[0];
            const result  = classifyDiscussionRoutingDisposition({author, body});

            expect(result, `discussion-${number}`).toMatchObject({
                disposition: 'terminal',
                reasonCode : 'graduated-to-ticket'
            })
        }

        expect(findLifecycleMarkers('> **GRADUATED** is only an example without a dated destination.')).toEqual([])
    });

    test('preserves the canonical partially-open corpus shapes', () => {
        for (const number of [13378, 11690]) {
            const content = fs.readFileSync(`resources/content/discussions/chunk-1/discussion-${number}.md`, 'utf8');
            const author  = content.match(/^author:\s*([^\n]+)$/m)?.[1]?.trim();
            const body    = content.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n## Comments\s*\n/)[0];
            const result  = classifyDiscussionRoutingDisposition({author, body});

            expect(result.disposition, `discussion-${number}`).toBe('active')
        }
    });

    test('does not promote marker syntax examples or untrusted authored markers', () => {
        expect(findLifecycleMarkers('This Discussion graduates when it can emit `[GRADUATED_TO_TICKET]`.')).toEqual([]);
        expect(findLifecycleMarkers([
            '```md',
            '~~~',
            '[GRADUATED_TO_TICKET: #9]',
            '```'
        ].join('\n'))).toEqual([]);

        for (const body of [
            'Do not set [GRADUATION_PROPOSED]; quorum failed.',
            'This is not [EVERGREEN].',
            'Use [REVALIDATED] after rechecking.',
            'Valid lifecycle states include [CONVERGING] and [EVERGREEN].',
            'The marker [GRADUATION_PROPOSED] is recognized by tooling.'
        ]) {
            expect(classifyDiscussionRoutingDisposition({author: 'neo-gpt', body}), body).toMatchObject({
                disposition: 'undetermined',
                reasonCode : 'no-authoritative-lifecycle-marker'
            })
        }

        expect(classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : 'Status: [OQ_RESOLUTION_PENDING].'
        }).disposition).toBe('active');
        expect(classifyDiscussionRoutingDisposition({
            author: 'neo-gpt',
            body  : '[SUPERSEDED] replaced by newer authority.'
        })).toMatchObject({
            disposition: 'terminal',
            reasonCode : 'terminal-marker:superseded'
        });

        const external = classifyDiscussionRoutingDisposition({
            author: 'external-contributor',
            body  : '[GRADUATION_PROPOSED]\n[GRADUATED_TO_TICKET: #9]'
        });

        expect(external).toMatchObject({
            disposition: 'undetermined',
            reasonCode : 'untrusted-or-unclassified-root-author'
        })
    });

    test('treats GitHub closure as terminal even when marker provenance is unavailable', () => {
        const result = classifyDiscussionRoutingDisposition({closed: true});

        expect(result).toEqual({
            schemaVersion: 'discussion-routing-disposition.v1',
            disposition  : 'terminal',
            reasonCode   : 'github-closed',
            evidence     : ['github:closed']
        })
    });

    test('leaves comment touches and marker-free open Discussions undetermined', () => {
        const result = classifyDiscussionRoutingDisposition({
            author   : 'neo-gpt',
            body     : 'Open-ended exploration without a lifecycle marker.',
            closed   : false,
            updatedAt: '2099-01-01T00:00:00Z'
        });

        expect(result).toMatchObject({
            disposition: 'undetermined',
            reasonCode : 'no-authoritative-lifecycle-marker'
        })
    });

    test('normalizes type-valid but contradictory persisted tuples to legacy undetermined', () => {
        expect(normalizeDiscussionRoutingProjection({
            schemaVersion: 'discussion-routing-disposition.v1',
            disposition  : 'active',
            reasonCode   : 'github-closed',
            evidence     : ['marker:GRADUATED_TO_TICKET']
        })).toEqual({
            schemaVersion: 'discussion-routing-disposition.legacy',
            disposition  : 'undetermined',
            reasonCode   : 'legacy-or-invalid-projection',
            evidence     : []
        })
    })
});
