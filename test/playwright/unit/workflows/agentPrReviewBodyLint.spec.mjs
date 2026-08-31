import {test, expect} from '@playwright/test';

import fs        from 'node:fs';
import path      from 'node:path';
import vm        from 'node:vm';
import * as yaml from 'js-yaml';

/**
 * @summary Contract coverage for the `Agent PR Review Body Lint` workflow's inline gate script.
 *
 * The gate lives at `.github/workflows/agent-pr-review-body-lint.yml` as ~586 lines of inline
 * `actions/github-script@v9` source — premise coherence, the Micro-Delta circuit breaker, origin-session
 * provenance, the review-budget activation cutover, and Drop+Supersede validation. It is repository
 * configuration, not a module, so nothing imports it and nothing executed it here.
 *
 * These specs previously lived in `neomjs/neo-agent-brain`, where the same extractor read this path from
 * `process.cwd()`. After the split the workflow stayed in this repository and the tests did not, so they
 * failed on `ENOENT` there and covered nothing here. `.github/` is not published in the `neo.mjs` package,
 * so a Brain-side spec cannot reach this file through the published Engine either — the spec has to live
 * beside its subject, which is here.
 *
 * The script is extracted by JOB NAME and STEP NAME rather than by offset, so an edit above it cannot
 * silently retarget the spec, and `test.describe('extraction guard')` reds loudly on either rename.
 */

const WORKFLOW_PATH = path.resolve(process.cwd(), '.github/workflows/agent-pr-review-body-lint.yml'),
      JOB_NAME      = 'lint-pr-review-body',
      STEP_NAME     = 'Validate PR Review Body';

/**
 * @summary Returns the inline GitHub Script used by the agent PR review-body lint workflow.
 * @returns {String} The workflow script source.
 */
function getAgentPrReviewBodyLintScript() {
    const
        workflow = yaml.load(fs.readFileSync(WORKFLOW_PATH, 'utf8')),
        step     = workflow.jobs[JOB_NAME].steps.find(item => item.name === STEP_NAME);

    return step.with.script;
}

/**
 * @summary Executes the review-body lint workflow script with stubbed GitHub Actions services.
 * @param {Object} options Execution options.
 * @param {String} options.body Review body to validate.
 * @param {Object|null} [options.activationIssue] Activation issue GraphQL projection.
 * @param {String} [options.createdAt='2026-07-16T13:57:02Z'] Reviewed PR creation timestamp.
 * @param {String} [options.reviewer='neo-gpt'] GitHub login for the simulated reviewer.
 * @param {String} [options.state='approved'] GitHub webhook review state.
 * @returns {Promise<Object>} Captured workflow comments, failures, and log lines.
 */
async function runAgentPrReviewBodyLintWorkflow({
    activationIssue,
    body,
    createdAt = '2026-07-16T13:57:02Z',
    reviewer = 'neo-gpt',
    state = 'approved'
} = {}) {
    const
        comments = [],
        failures = [],
        logs     = [],
        context  = {
            repo   : {owner: 'neomjs', repo: 'neo'},
            payload: {
                review: {
                    id  : 1391001,
                    user: {login: reviewer},
                    body,
                    state
                },
                pull_request: {created_at: createdAt, number: 13910}
            }
        },
        coreStub = {
            setFailed: message => failures.push(message)
        },
        defaultActivationIssue = {
            id                            : 'I_kwDOABcD15257',
            closedByPullRequestsReferences: {
                totalCount: 1,
                nodes     : [{
                    number     : 15310,
                    state      : 'MERGED',
                    mergedAt   : '2026-07-16T13:57:03Z',
                    baseRefName: 'dev'
                }],
                pageInfo: {hasNextPage: false}
            }
        },
        githubStub = {
            graphql: async () => ({
                repository: {
                    activationIssue: activationIssue === undefined ? defaultActivationIssue : activationIssue
                }
            }),
            rest: {
                issues: {
                    createComment: async payload => comments.push(payload)
                }
            }
        },
        consoleStub = {
            log: message => logs.push(message)
        };

    await vm.runInNewContext(
        `(async () => {\n${getAgentPrReviewBodyLintScript()}\n})()`,
        {
            console: consoleStub,
            context,
            core   : coreStub,
            github : githubStub
        },
        {timeout: 1000}
    );

    return {comments, failures, logs};
}

const REVIEW_BUDGET_ACTIVATED_AT = '2026-07-16T13:57:03Z',
      REVIEW_ORIGIN_SESSION_ID   = '8c622ae9-0ef1-4bf1-9a27-5dfe228b4fac';

const VALID_REVIEW_BODY = [
    '# PR Review Summary',
    '',
    '**Status:** Approved',
    '',
    '### 🪜 Strategic-Fit Decision',
    '- Decision: Approve',
    '',
    '### 🧭 Patch-Blind Premise Snapshot',
    '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
    '* **Expected Solution Shape:** preserve the selected review template skeleton.',
    '* **Patch Verdict:** matches the expected shape.',
    '* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.',
    '',
    '### 🕸️ Context & Graph Linking',
    '* **Target Epic / Issue ID:** Resolves #11273',
    '* **Related Graph Nodes:** #11491',
    `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
    '',
    '### 🔬 Depth Floor',
    '- Documented search: scanned all relevant surfaces.',
    '',
    '### 🧠 Graph Ingestion Notes',
    '* **`[KB_GAP]`**: N/A.',
    '* **`[TOOLING_GAP]`**: N/A.',
    '* **`[RETROSPECTIVE]`**: Template validator fixture.',
    '',
    '### 📋 Required Actions',
    'No required actions — eligible for human merge.',
    '',
    '### 📊 Evaluation Metrics',
    '[ARCH_ALIGNMENT]: 80 - structural fit',
    '[CONTENT_COMPLETENESS]: 80 - covers AC matrix',
    '[EXECUTION_QUALITY]: 80 - tests pass',
    '[PRODUCTIVITY]: 70 - bounded scope',
    '[IMPACT]: 60 - localized substrate fix',
    '[COMPLEXITY]: 40 - mechanical change',
    '[EFFORT_PROFILE]: Quick Win'
].join('\n');

const VALID_FOLLOWUP_REVIEW_BODY = [
    '# PR Review Follow-Up — exceptional verdicts only',
    '',
    '**Status:** Approved',
    '',
    '**Opening:** Re-checking the addressed delta.',
    '',
    '### 🧭 Patch-Blind Premise Snapshot',
    '* **Inputs Read Before Patch:** prior review, author response, changed-file list.',
    '* **Expected Solution Shape:** narrow delta preserves prior approval anchors.',
    '* **Patch Verdict:** matches the expected delta.',
    '* **Premise Coherence:** coheres: a narrow delta; no value-surface change.',
    '',
    '### 🪜 Strategic-Fit Decision',
    '- **Decision**: Approve',
    '- **Rationale**: The delta resolves the prior blocker.',
    '',
    '### ⚓ Prior Review Anchor',
    '* **PR:** #11273',
    '* **Target Issue:** #11491',
    '* **Prior Review Comment ID:** PRR_123',
    '* **Author Response Comment ID:** IC_456',
    '* **Latest Head SHA:** abc1234',
    `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
    '',
    '### 🔁 Delta Scope',
    '* **Files changed:** PR body only',
    '* **PR body / close-target changes:** pass',
    '* **Branch freshness / merge state:** clean',
    '',
    '### ✅ Previous Required Actions Audit',
    '* **Addressed:** prior template miss — current body keeps canonical headings.',
    '',
    '### 🔬 Delta Depth Floor',
    '* **Documented search:** I actively checked changed metadata, the prior blocker, and close-target state and found no new concerns.',
    '',
    '### 🔬 Premise Falsifiers',
    '* **Source-coordinate falsifiers:** N/A — this fixture is not a Drop+Supersede.',
    '* **What survives:** the whole diff; nothing is being retired.',
    '',
    '### 📊 Metrics Delta',
    '* **`[ARCH_ALIGNMENT]`**: unchanged from prior review',
    '* **`[CONTENT_COMPLETENESS]`**: unchanged from prior review',
    '* **`[EXECUTION_QUALITY]`**: unchanged from prior review',
    '* **`[PRODUCTIVITY]`**: unchanged from prior review',
    '* **`[IMPACT]`**: unchanged from prior review',
    '* **`[COMPLEXITY]`**: unchanged from prior review',
    '* **`[EFFORT_PROFILE]`**: unchanged from prior review',
    '',
    '### 📋 Required Actions',
    '',
    'No required actions — eligible for human merge.'
].join('\n');

// An ATTEMPTED SECOND ORDINARY RC, which is a different body class from a Round-2 disposition and is the
// vehicle the provenance cases need. A second RC raises a fresh action packet, so its valid shape is the
// canonical full Round-1 review — the budget still sees it and still refuses it.
const VALID_ORDINARY_REQUEST_CHANGES_BODY = VALID_REVIEW_BODY
    .replace('**Status:** Approved', '**Status:** Request Changes')
    .replace('- Decision: Approve', '- Decision: Request Changes')
    .replace(
        '### 📋 Required Actions\nNo required actions — eligible for human merge.',
        '### 📋 Required Actions\n\n- [ ] name the boundary this must not hardcode'
    );

const VALID_MICRO_DELTA_REVIEW_BODY = [
    '# Pull Request Micro-Delta Review',
    '',
    '> **Context:** This review uses the Micro-Delta format because prior semantic review is complete and only mechanical-hygiene or metadata-drift remains.',
    '',
    '### State Vector',
    '- **Target SHA:** abc1234',
    `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
    '- **Current reviewDecision:** CHANGES_REQUESTED',
    '- **Semantic Status:** APPROVED',
    '- **CI Status:** GREEN',
    '- **Remaining Blocker Class:** mechanical-hygiene',
    '- **Measured Discussion Cost:** > 24KB',
    '',
    '### Micro-Delta Focus',
    '*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*',
    '',
    '- `[x]` **Issue 1:** ai/config.template.mjs - stale wording repaired.',
    '',
    '### Verdict',
    '- [ ] **APPROVED** (All mechanical-hygiene cleared. Merge-ready.)',
    '- [x] **COMMENTED CLOSURE** (RC2 budget spent; record the closure packet without creating another ordinary RC.)',
    '- [ ] **MAINTAINER POLISH FAST PATH APPLIED** (Reviewer unilaterally patched and pushed fixes. Approved.)',
    '',
    '### RC2 Closure Packet',
    '- **Consumer sweep:** Fleet card and detail consumers checked.',
    '- **Falsifier/property matrix:** Existing RA properties all pass.',
    '- **Carried-vs-new census:** two carried, zero new.',
    '- **Truth-fold:** ticket and PR body now match the exact head.',
    '- **Semantic-surface freeze:** only the existing roster capability may receive property refinements.'
].join('\n');

const VALID_DROP_SUPERSEDE_REVIEW_BODY = VALID_FOLLOWUP_REVIEW_BODY
    .replace('**Status:** Approved', '**Status:** Drop+Supersede')
    .replace('- **Decision**: Approve', '- **Decision**: Drop+Supersede') + [
        '',
        '- **Disposition:** ticket-prescription-off',
        '- **Source-coordinate falsifiers:** `src/owner.mjs:42` contradicts the ticket-owned boundary.',
        '- **Salvage map:** Preserve the parser fixture; discard the stale adapter.',
        '- **Successor landing pad:** Amend issue #15257 in place.',
        '- **Successor map citation:** https://github.com/neomjs/neo/issues/15257#issuecomment-1'
    ].join('\n');

/**
 * @summary Wraps a review body in the managed-path provenance block the post-cutover gate requires.
 * @param {String} body The review body to wrap.
 * @param {String} [outcome='within-budget'] Recorded budget outcome.
 * @param {String[]} [extraAudit=[]] Additional audit lines.
 * @returns {String} The wrapped review body.
 */
const managedReviewBody = (body, outcome='within-budget', extraAudit=[]) => [
    body,
    '',
    '---',
    '[review-budget-managed]',
    `- outcome: ${outcome}`,
    '- ordinary-limit: 2',
    '- activation-issue: 15257',
    '- activation-pr: 15310',
    `- activated-at: ${REVIEW_BUDGET_ACTIVATED_AT}`,
    ...extraAudit
].join('\n');

/**
 * The non-vacuity control for every spec below. Each ported test reaches the gate through
 * `getAgentPrReviewBodyLintScript()`, which locates its subject by two names. If either name changes, the
 * lookup yields `undefined` and the ported assertions stop witnessing the workflow — some would error, but
 * the failure would read as a broken harness rather than "the gate moved". These three assertions make the
 * rename itself the reported defect.
 */
test.describe('agent-pr-review-body-lint — extraction guard (#17913)', () => {
    test('the workflow declares the job and step this spec extracts by name', () => {
        const workflow = yaml.load(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

        expect(workflow.jobs[JOB_NAME], `job '${JOB_NAME}' renamed or removed`).toBeTruthy();

        const step = workflow.jobs[JOB_NAME].steps.find(item => item.name === STEP_NAME);

        expect(step, `step '${STEP_NAME}' renamed or removed`).toBeTruthy();
        expect(step.uses).toContain('actions/github-script');
    });

    test('the extracted script is substantial inline source, not an empty or file-backed step', () => {
        const script = getAgentPrReviewBodyLintScript();

        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(1000);
        expect(script).toContain('core.setFailed');
    });

    test('a body the gate must reject still reaches it — the harness is wired, not stubbed green', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({body: 'not a review body at all'});

        expect(result.failures).toHaveLength(1);
    });
});

test.describe('agent-pr-review-body-lint — the gate script (#13910, #15257, #16148)', () => {
    test('#13910: workflow lint accepts documented Micro-Delta review bodies', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            state: 'commented'
        });

        expect(result.failures).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.logs).toContain('✅ Micro-Delta body matches the documented circuit-breaker shape.');
    });

    test('#16148: workflow lint accepts concrete origin sessions in every documented review format', async () => {
        const formats = [{
            body : VALID_REVIEW_BODY,
            state: 'approved'
        }, {
            body : VALID_FOLLOWUP_REVIEW_BODY,
            state: 'approved'
        }, {
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            state: 'commented'
        }];

        for (const format of formats) {
            const result = await runAgentPrReviewBodyLintWorkflow(format);

            expect(result.failures).toEqual([]);
            expect(result.comments).toEqual([]);
        }
    });

    test('#16148: workflow lint rejects missing, placeholder, or malformed origin sessions in every documented review format', async () => {
        const formats = [{
            body : VALID_REVIEW_BODY,
            field: `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'full',
            state: 'approved'
        }, {
            body : VALID_FOLLOWUP_REVIEW_BODY,
            field: `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'follow-up',
            state: 'approved'
        }, {
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            field: `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'micro-delta',
            state: 'commented'
        }];
        const invalidValues = [{
            name : 'missing',
            value: null
        }, {
            name : 'placeholder',
            value: '[Neo Memory Core session UUID]'
        }, {
            name : 'malformed',
            value: 'codex-task-019fac51'
        }];

        for (const format of formats) {
            for (const invalid of invalidValues) {
                const body = invalid.value === null
                    ? format.body.replace(`${format.field}\n`, '')
                    : format.body.replace(REVIEW_ORIGIN_SESSION_ID, invalid.value);
                const result = await runAgentPrReviewBodyLintWorkflow({
                    body,
                    state: format.state
                });

                expect(result.failures, `${format.name} ${invalid.name}`).toHaveLength(1);
                expect(result.comments, `${format.name} ${invalid.name}`).toHaveLength(1);
                expect(result.comments[0].body, `${format.name} ${invalid.name}`).toContain('Origin Session');
            }
        }
    });

    test('#13910: workflow lint rejects incomplete Micro-Delta bodies before canonical fallback', async () => {
        const incompleteBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Measured Discussion Cost:** > 24KB\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body : incompleteBody,
            state: 'commented'
        });

        expect(result.failures).toEqual([
            'Agent micro-delta review body missing required circuit-breaker anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent Micro-Delta Review Body Lint Violation');
        expect(result.comments[0].body).toContain('.agents/skills/pr-review/assets/pr-review-micro-delta-template.md');
        expect(result.comments[0].body).not.toContain('Visible anchors missing');
    });

    test('#13910: workflow lint rejects Micro-Delta semantic blocker shortcuts', async () => {
        const semanticShortcutBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Remaining Blocker Class:** mechanical-hygiene', '- **Remaining Blocker Class:** semantic-blocker');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body : semanticShortcutBody,
            state: 'commented'
        });

        expect(result.failures[0]).toContain('micro-delta review body missing required circuit-breaker anchors');
        expect(result.comments[0].body).toContain('mechanical-hygiene or metadata-drift');
        expect(result.comments[0].body).toContain('full follow-up review template instead');
    });

    test('#15257: workflow provenance applies only after the activation issue closing-PR cutover', async () => {
        const body          = VALID_ORDINARY_REQUEST_CHANGES_BODY;
        const grandfathered = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:02Z',
            state    : 'changes_requested'
        });
        const postCutover = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(grandfathered.failures).toEqual([]);
        expect(postCutover.failures).toEqual([
            'Post-activation agent REQUEST_CHANGES review lacks managed-path provenance or `[review-budget-bypass] reason: ...` disclosure. Use manage_pr_review or disclose the direct gh/UI bypass.'
        ])
    });

    test('#15257: workflow treats zero merged dev closers as pre-activation', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 2,
                    nodes     : [{number: 15311, state: 'OPEN', mergedAt: null, baseRefName: 'dev'}, {
                        number     : 15312,
                        state      : 'MERGED',
                        mergedAt   : '2026-07-16T13:50:00Z',
                        baseRefName: 'main'
                    }],
                    pageInfo: {hasNextPage: false}
                }
            },
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY,
            createdAt: '2026-07-16T14:00:00Z',
            state    : 'changes_requested'
        });

        expect(result.failures).toEqual([])
    });

    test('#15257: workflow fails closed on missing, truncated, or malformed activation relations', async () => {
        const body  = VALID_ORDINARY_REQUEST_CHANGES_BODY;
        const cases = [{
            name           : 'missing issue',
            activationIssue: null,
            message        : 'Cannot resolve review-budget activation issue #15257.'
        }, {
            name           : 'truncated relation',
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 1,
                    nodes     : [],
                    pageInfo  : {hasNextPage: true}
                }
            },
            message: 'Cannot prove the complete closing-PR history for review-budget activation issue #15257.'
        }, {
            name           : 'invalid mergedAt',
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 1,
                    nodes     : [{number: 15312, state: 'MERGED', mergedAt: null, baseRefName: 'dev'}],
                    pageInfo  : {hasNextPage: false}
                }
            },
            message: 'Review-budget activation issue #15257 has a merged dev closer without a valid mergedAt.'
        }];

        for (const item of cases) {
            const result = await runAgentPrReviewBodyLintWorkflow({
                activationIssue: item.activationIssue,
                body,
                createdAt      : '2026-07-16T14:00:00Z',
                state          : 'changes_requested'
            });

            expect(result.failures, item.name).toEqual([item.message])
        }
    });

    test('#15257: workflow never lets bypass or COMMENTED weaken Drop+Supersede validation', async () => {
        const commented = await runAgentPrReviewBodyLintWorkflow({
            body : VALID_DROP_SUPERSEDE_REVIEW_BODY,
            state: 'commented'
        });
        const malformedBypass = await runAgentPrReviewBodyLintWorkflow({
            body: [
                VALID_FOLLOWUP_REVIEW_BODY
                    .replace('**Status:** Approved', '**Status:** Drop+Supersede')
                    .replace('- **Decision**: Approve', '- **Decision**: Drop+Supersede'),
                '[review-budget-bypass] reason: emergency direct review'
            ].join('\n'),
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(commented.failures).toEqual([
            'A terminal Drop+Supersede verdict must use GitHub review state CHANGES_REQUESTED.'
        ]);
        expect(malformedBypass.failures[0]).toContain('Drop+Supersede body is incomplete')
    });

    test('#15257: workflow rejects either one-sided Drop+Supersede contradiction', async () => {
        const cases = [
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('**Status:** Drop+Supersede', '**Status:** Request Changes'),
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('- **Decision**: Drop+Supersede', '- **Decision**: Request Changes')
        ];

        for (const body of cases) {
            const result = await runAgentPrReviewBodyLintWorkflow({body, state: 'changes_requested'});

            expect(result.failures).toHaveLength(1);
            expect(result.failures[0]).toContain('Drop+Supersede body is incomplete');
            expect(result.failures[0]).toContain('Status + Decision')
        }
    });

    test('#15257: workflow rejects override-only provenance after cutover', async () => {
        const body = managedReviewBody(
            VALID_ORDINARY_REQUEST_CHANGES_BODY
        ).replace('[review-budget-managed]\n', '[review-budget-override]\n');
        const result = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(result.failures).toEqual([
            '`[review-budget-override]` is valid only with managed-path provenance.'
        ])
    });

    test('#13910: workflow lint requires Premise Coherence for canonical reviews', async () => {
        const bodyWithoutPremiseCoherence = VALID_REVIEW_BODY
            .replace('* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body: bodyWithoutPremiseCoherence
        });

        expect(result.failures).toEqual([
            'Agent review body missing required template anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent PR Review Body Lint Violation');
        expect(result.comments[0].body).toContain('Premise Coherence');
        expect(result.comments[0].body).toContain('all four premise fields');
    });
});
