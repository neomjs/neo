import {test, expect} from '@playwright/test';
import {
    BUSINESS_EDGE_TYPES,
    BUSINESS_GOAL_LIFECYCLE,
    BUSINESS_ID_PREFIXES,
    BUSINESS_NODE_TYPES,
    METRIC_CLAIM_CLASSES,
    REQUIRED_BUSINESS_PROPERTIES,
    RETIRED_GOAL_EDGE_WEIGHT,
    createBusinessGoalId,
    createMetricId,
    isClosedPeriodViolation,
    planRetiredGoalEdgeReweight,
    slugifyIdPart,
    validateBusinessGoalProperties,
    validateBusinessProperties,
    validateMetricProperties
} from '../../../../ai/graph/businessSchema.mjs';

// Pure schema module — imported directly (no Neo globals, no connect-on-init side effects),
// mirroring parseAgentEnvelope.spec. Covers the business-layer schema contract: the 5-field
// property gate, falsifyingQuery-or-invalid, deterministic identity, append-only periods,
// and the zombie-priority reweight planner.

const VALID_SHARED = {
    claimClass        : 'measured',
    falsifyingQuery   : 'SELECT COUNT(*) FROM Nodes WHERE label = "METRIC" AND json_extract(data, "$.properties.source") = "github"',
    windowSemantics   : 'day:utc',
    confoundDisclaimer: 'cannot isolate organic vs referral-driven traffic',
    publicFlag        : true
};

const VALID_METRIC = {
    ...VALID_SHARED,
    source      : 'github',
    metricName  : 'stars-total',
    periodStart : '2026-07-01',
    periodClosed: false,
    value       : 12345
};

const VALID_GOAL = {
    ...VALID_SHARED,
    slug     : 'category-correct-search-share',
    lifecycle: 'active'
};

test.describe('businessSchema — family registry shape', () => {
    test('node/edge label registries carry exactly the graduated families and are frozen', () => {
        expect(BUSINESS_NODE_TYPES).toEqual(['BUSINESS_GOAL', 'METRIC']);
        expect(BUSINESS_EDGE_TYPES).toEqual(['ADVANCED_BY']);
        expect(Object.isFrozen(BUSINESS_NODE_TYPES)).toBe(true);
        expect(Object.isFrozen(BUSINESS_EDGE_TYPES)).toBe(true);
        expect(Object.isFrozen(REQUIRED_BUSINESS_PROPERTIES)).toBe(true);
        expect(Object.isFrozen(METRIC_CLAIM_CLASSES)).toBe(true);
        expect(Object.isFrozen(BUSINESS_GOAL_LIFECYCLE)).toBe(true);
        expect(Object.isFrozen(BUSINESS_ID_PREFIXES)).toBe(true)
    });

    test('RETIRED_GOAL_EDGE_WEIGHT sits on the GraphService decay floor (0.1), keeping history walkable', () => {
        expect(RETIRED_GOAL_EDGE_WEIGHT).toBe(0.1)
    });
});

test.describe('businessSchema — five-field property contract (both labels)', () => {
    test('a fully-populated property set passes', () => {
        expect(validateBusinessProperties(VALID_SHARED)).toEqual({valid: true, errors: []})
    });

    test('every one of the five required fields is individually enforced', () => {
        for (const field of REQUIRED_BUSINESS_PROPERTIES) {
            const props = {...VALID_SHARED};
            delete props[field];
            const {valid, errors} = validateBusinessProperties(props);
            expect(valid, `missing ${field} must fail`).toBe(false);
            expect(errors.join(' ')).toContain(field)
        }
    });

    test('falsifyingQuery-or-invalid: empty / whitespace / non-string falsifiers are refused', () => {
        for (const bad of ['', '   ', 42, null, {}]) {
            const {valid, errors} = validateBusinessProperties({...VALID_SHARED, falsifyingQuery: bad});
            expect(valid).toBe(false);
            expect(errors.join(' ')).toContain('falsifyingQuery')
        }
    });

    test('claimClass is a closed taxonomy — extending it is a decision, not a write', () => {
        for (const claimClass of METRIC_CLAIM_CLASSES) {
            expect(validateBusinessProperties({...VALID_SHARED, claimClass}).valid).toBe(true)
        }
        const {valid, errors} = validateBusinessProperties({...VALID_SHARED, claimClass: 'vibes'});
        expect(valid).toBe(false);
        expect(errors.join(' ')).toContain('claimClass')
    });

    test('publicFlag is a strict boolean — truthy strings are a redaction hazard, refused', () => {
        for (const bad of ['true', 1, 0, null]) {
            expect(validateBusinessProperties({...VALID_SHARED, publicFlag: bad}).valid).toBe(false)
        }
        expect(validateBusinessProperties({...VALID_SHARED, publicFlag: false}).valid).toBe(true)
    });

    test('windowSemantics and confoundDisclaimer must be non-empty strings', () => {
        expect(validateBusinessProperties({...VALID_SHARED, windowSemantics: ' '}).valid).toBe(false);
        expect(validateBusinessProperties({...VALID_SHARED, confoundDisclaimer: ''}).valid).toBe(false)
    });
});

test.describe('businessSchema — METRIC node contract', () => {
    test('a fully-populated METRIC passes', () => {
        expect(validateMetricProperties(VALID_METRIC)).toEqual({valid: true, errors: []})
    });

    test('identity fields (source, metricName, periodStart) are individually enforced', () => {
        for (const field of ['source', 'metricName', 'periodStart']) {
            const props           = {...VALID_METRIC, [field]: ''};
            const {valid, errors} = validateMetricProperties(props);
            expect(valid, `empty ${field} must fail`).toBe(false);
            expect(errors.join(' ')).toContain(field)
        }
    });

    test('periodClosed must be a strict boolean and value a finite number', () => {
        expect(validateMetricProperties({...VALID_METRIC, periodClosed: 'false'}).valid).toBe(false);
        expect(validateMetricProperties({...VALID_METRIC, value: 'many'}).valid).toBe(false);
        expect(validateMetricProperties({...VALID_METRIC, value: Infinity}).valid).toBe(false);
        expect(validateMetricProperties({...VALID_METRIC, value: NaN}).valid).toBe(false)
    });

    test('shared five-field violations surface through the METRIC validator too', () => {
        const {valid, errors} = validateMetricProperties({...VALID_METRIC, falsifyingQuery: ''});
        expect(valid).toBe(false);
        expect(errors.join(' ')).toContain('falsifyingQuery')
    });
});

test.describe('businessSchema — BUSINESS_GOAL node contract', () => {
    test('a fully-populated goal passes; lifecycle is a closed set', () => {
        expect(validateBusinessGoalProperties(VALID_GOAL)).toEqual({valid: true, errors: []});
        for (const lifecycle of BUSINESS_GOAL_LIFECYCLE) {
            expect(validateBusinessGoalProperties({...VALID_GOAL, lifecycle}).valid).toBe(true)
        }
        expect(validateBusinessGoalProperties({...VALID_GOAL, lifecycle: 'paused'}).valid).toBe(false)
    });

    test('slug is required — a goal without a stable operator slug has no identity', () => {
        for (const bad of [undefined, '', '   ', '---']) {
            expect(validateBusinessGoalProperties({...VALID_GOAL, slug: bad}).valid).toBe(false)
        }
    });
});

test.describe('businessSchema — deterministic identity', () => {
    test('createMetricId is deterministic: the same identity yields the same id (idempotent upsert anchor)', () => {
        const identity = {source: 'GitHub', metricName: 'Stars Total', windowSemantics: 'day:utc', periodStart: '2026-07-01'};
        const first    = createMetricId(identity);
        const second   = createMetricId({...identity});
        expect(first).toBe(second);
        expect(first).toBe('metric-github--stars-total--day-utc--2026-07-01')
    });

    test('createMetricId is injective: distinct identities yield distinct ids (regression: single-dash join collision)', () => {
        // The cross-family-verified falsifier pairs: with a single-`-` join, each pair collided
        // onto one id because parts themselves contain `-`. The `--` join keeps part boundaries
        // unambiguous (slugified parts can never contain `--` or edge dashes).
        const pairs = [
            [
                {source: 'x',          metricName: 'y-z',            windowSemantics: 'w', periodStart: 'p'},
                {source: 'x-y',        metricName: 'z',              windowSemantics: 'w', periodStart: 'p'}
            ],
            [
                {source: 'git',        metricName: 'review-latency', windowSemantics: 'day:utc', periodStart: '2026-07-01'},
                {source: 'git-review', metricName: 'latency',        windowSemantics: 'day:utc', periodStart: '2026-07-01'}
            ]
        ];
        for (const [left, right] of pairs) {
            expect(createMetricId(left), `${left.source}/${left.metricName} must not collide with ${right.source}/${right.metricName}`)
                .not.toBe(createMetricId(right))
        }
    });

    test('createMetricId throws on every missing identity part — incomplete identity cannot exist even transiently', () => {
        const identity = {source: 'github', metricName: 'stars', windowSemantics: 'day:utc', periodStart: '2026-07-01'};
        for (const key of Object.keys(identity)) {
            expect(() => createMetricId({...identity, [key]: ''}), `empty ${key} must throw`).toThrow(key)
        }
    });

    test('createBusinessGoalId keys on the slug only — display-title renames never re-mint the node', () => {
        expect(createBusinessGoalId('Category-Correct Search Share')).toBe('business-goal-category-correct-search-share');
        expect(createBusinessGoalId('category-correct-search-share')).toBe('business-goal-category-correct-search-share');
        expect(() => createBusinessGoalId('')).toThrow('slug')
    });

    test('slugifyIdPart collapses non-alphanumeric runs and never emits leading/trailing dashes', () => {
        expect(slugifyIdPart('  Week: ISO / 2026 ')).toBe('week-iso-2026');
        expect(slugifyIdPart('***')).toBe('')
    });
});

test.describe('businessSchema — append-only period guard', () => {
    const CLOSED = {...VALID_METRIC, periodClosed: true};

    test('new nodes and open periods are writable', () => {
        expect(isClosedPeriodViolation(null, VALID_METRIC).violation).toBe(false);
        expect(isClosedPeriodViolation(undefined, VALID_METRIC).violation).toBe(false);
        expect(isClosedPeriodViolation(VALID_METRIC, {...VALID_METRIC, value: 99999}).violation).toBe(false)
    });

    test('mutating any field of a closed period is refused, naming the fields', () => {
        const {violation, reason} = isClosedPeriodViolation(CLOSED, {...CLOSED, value: 1, confoundDisclaimer: 'rewritten'});
        expect(violation).toBe(true);
        expect(reason).toContain('value');
        expect(reason).toContain('confoundDisclaimer')
    });

    test('an identical re-write of a closed period is a no-op, not a violation (idempotent re-ingest)', () => {
        expect(isClosedPeriodViolation(CLOSED, {...CLOSED}).violation).toBe(false)
    });

    test('a closed period never reopens — periodClosed true → false is refused (regression: reopen hole)', () => {
        const {violation, reason} = isClosedPeriodViolation(CLOSED, {...CLOSED, periodClosed: false});
        expect(violation).toBe(true);
        expect(reason).toContain('never reopens')
    });

    test('re-asserting periodClosed: true on a closed period stays legal', () => {
        expect(isClosedPeriodViolation(CLOSED, {periodClosed: true}).violation).toBe(false)
    });
});

test.describe('businessSchema — zombie-priority reweight planner', () => {
    test('retiring a goal plans ADVANCED_BY edges down to the retirement weight, nothing else', () => {
        const plan = planRetiredGoalEdgeReweight([
            {id: 'e-1', type: 'ADVANCED_BY', properties: {weight: 1}},
            {id: 'e-2', type: 'ADVANCED_BY', properties: {weight: 0.7}},
            {id: 'e-3', type: 'RESOLVES',    properties: {weight: 1}}
        ]);
        expect(plan).toEqual([
            {id: 'e-1', weight: RETIRED_GOAL_EDGE_WEIGHT},
            {id: 'e-2', weight: RETIRED_GOAL_EDGE_WEIGHT}
        ])
    });

    test('the planner never plans deletion and tolerates malformed input fail-closed', () => {
        expect(planRetiredGoalEdgeReweight([])).toEqual([]);
        expect(planRetiredGoalEdgeReweight(null)).toEqual([]);
        expect(planRetiredGoalEdgeReweight([null, {type: 'ADVANCED_BY'}, {id: 'e-9', type: 'OTHER'}])).toEqual([])
    });
});
