import {expect, test}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../'),
    SEAMS    = [
        {
            file : 'ai/daemons/wake/localWakeAdapters.mjs',
            emits: 'breakdown.sent_to_me.count'
        }, {
            file : 'ai/daemons/wake/wakeDigestBuilder.mjs',
            emits: 'messages.length'
        }
    ];

/**
 * @summary The wake digest's message count is labelled as what it measures: queued events.
 *
 * **The defect.** Both renderers emitted `N new messages` for a number produced by counting **queued
 * events**. Neither seam consults read-state — grep both files for `readAt` / `unread` / `markRead`
 * and the answer is zero in each. So a message delivered, read and acted on hours ago still
 * contributes its queued event to that number, and the label named something the code cannot compute.
 *
 * The consequence is not cosmetic. A count that says "messages" and means "events" is why seats stop
 * trusting wakes: several maintainers spent real turns hunting for messages that were never missing,
 * because the digest told them a number about their mailbox that was actually a number about a queue.
 *
 * **This is the rename half only.** The ticket's other half — reconciling the count against the
 * recipient's unread set, or resolving the `latest` pointer at render time — is untouched here and
 * remains open. Renaming does not make the digest accurate; it makes it *honest about what it is*,
 * which is the smaller repair the AC explicitly permits: *"unread-accurate OR renamed to what it
 * measures."*
 *
 * **Why both seams, asserted independently.** The AC requires a spec that fails against a tree where
 * only one is fixed. Two renderers producing the same wake with different words for the same number
 * is worse than the original defect — a reader comparing two wakes would reasonably conclude the
 * counts measure different things.
 *
 * **A deliberate future failure.** If someone later reconciles a seam against read-state, the
 * `no-read-state` arm below will go red. That is intended, not a bug: at that moment the count really
 * would be a message count, and the label should be revisited *as part of that change* rather than
 * silently diverging from it again. The arm exists to force that conversation.
 */

/**
 * @summary Reads a seam's source with comments stripped, so a label assertion cannot be satisfied —
 * or broken — by prose. The renaming comment quotes the old label to explain the removal.
 * @param {String} relativePath
 * @returns {String}
 */
function readCode(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
}

test.describe('wake digest labels its count as events, not messages', () => {
    for (const seam of SEAMS) {
        test(`${path.basename(seam.file)} does not call an event count "new messages"`, () => {
            expect(readCode(seam.file), `${seam.file} still labels queued events as messages`)
                .not.toContain('new messages')
        });

        test(`${path.basename(seam.file)} emits the count under an honest label`, () => {
            const code = readCode(seam.file);

            // Non-vacuity: the arm above passes trivially if the line were deleted rather than
            // relabelled, which would remove information from the wake instead of correcting it.
            expect(code, `${seam.file} must still render the count`).toContain('message events');
            expect(code, `${seam.file} must still compute it from ${seam.emits}`)
                .toContain(seam.emits)
        })
    }

    test('BOTH seams moved together — a half-repair is a worse state than the defect', () => {
        // THE arm the ticket asks for by name: "a spec must fail against a tree where only one is
        // fixed". Asserted as a set rather than per-file so the failure names the divergence itself.
        const labelled = SEAMS.filter(seam => readCode(seam.file).includes('message events'));

        expect(labelled.length,
            'both renderers must use the same words for the same number; two wakes disagreeing ' +
            'about what a count means is worse than one wake being wrong').toBe(SEAMS.length)
    });

    test('neither seam consults read-state — the fact that makes the rename correct', () => {
        // The justification, asserted rather than asserted-about. If this goes red because a seam
        // gained real read-state reconciliation, revisit the LABEL as part of that change: the count
        // would then genuinely be a message count and "message events" would understate it.
        for (const seam of SEAMS) {
            expect(readCode(seam.file), `${seam.file} now reads read-state — revisit the label`)
                .not.toMatch(/\b(readAt|isUnread|markRead)\b/)
        }
    })
});
