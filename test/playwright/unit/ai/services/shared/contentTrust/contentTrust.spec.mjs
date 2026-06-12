import {test, expect}                       from '@playwright/test';
import {TRUST_TIERS}                        from '../../../../../../../ai/graph/identityRoots.mjs';
import {classifyAuthorTrust, isExternalTier, isTrustedTier, normalizeLogin} from '../../../../../../../ai/services/shared/contentTrust/authorTrustClassifier.mjs';
import {sanitizeContent}                    from '../../../../../../../ai/services/shared/contentTrust/astroturfSanitizer.mjs';

/**
 * @summary Fixtures for the pure content-trust helpers — author-tier classifier + astroturf sanitizer.
 *
 * Covers the branch-ready first slice: a pure author-tier classifier plus a pure sanitizer/defanger
 * with fixtures for both documented attack variants (link-bearing marketing URL, link-free
 * product-name seeding) and the engagement-bait / external-endpoint variant — plus the load-bearing
 * negatives (trusted authors untouched, clean content not over-redacted).
 */
test.describe('Neo.ai.services.shared.contentTrust.authorTrustClassifier', () => {
    test('normalizeLogin strips @, trims, lowercases; non-strings → empty', () => {
        expect(normalizeLogin('@Neo-Opus-Ada')).toBe('neo-opus-ada');
        expect(normalizeLogin('  octocat ')).toBe('octocat');
        expect(normalizeLogin(null)).toBe('');
        expect(normalizeLogin(42)).toBe('')
    });

    test('a canonical roster login resolves to its seeded tier (@-prefix + case agnostic)', () => {
        expect(classifyAuthorTrust('@neo-opus-ada')).toBe(TRUST_TIERS.PEER_TRUSTED);
        expect(classifyAuthorTrust('neo-opus-ada')).toBe(TRUST_TIERS.PEER_TRUSTED);
        expect(classifyAuthorTrust('Neo-GPT')).toBe(TRUST_TIERS.PEER_TRUSTED);
        expect(classifyAuthorTrust('tobiu')).toBe(TRUST_TIERS.OWNER)
    });

    test('an unknown login is EXTERNAL — never inferred up from being plausible', () => {
        expect(classifyAuthorTrust('desiorac')).toBe(TRUST_TIERS.EXTERNAL);
        expect(classifyAuthorTrust('kehansama')).toBe(TRUST_TIERS.EXTERNAL);
        expect(classifyAuthorTrust('ankitzm')).toBe(TRUST_TIERS.EXTERNAL)
    });

    test('empty / missing author → UNCLASSIFIED (no info, still untrusted)', () => {
        expect(classifyAuthorTrust('')).toBe(TRUST_TIERS.UNCLASSIFIED);
        expect(classifyAuthorTrust(null)).toBe(TRUST_TIERS.UNCLASSIFIED);
        expect(classifyAuthorTrust(undefined)).toBe(TRUST_TIERS.UNCLASSIFIED)
    });

    test('injected collaborators (array or Set) classify REPO_TRUSTED — roster still wins', () => {
        expect(classifyAuthorTrust('outside-maintainer', {collaborators: ['outside-maintainer']})).toBe(TRUST_TIERS.REPO_TRUSTED);
        expect(classifyAuthorTrust('@Outside-Maintainer', {collaborators: new Set(['outside-maintainer'])})).toBe(TRUST_TIERS.REPO_TRUSTED);
        // A roster identity is not downgraded just because it is absent from the collaborator set.
        expect(classifyAuthorTrust('neo-opus-ada', {collaborators: ['someone-else']})).toBe(TRUST_TIERS.PEER_TRUSTED)
    });

    test('isExternalTier: external + unclassified are untrusted; roster tiers are not', () => {
        expect(isExternalTier(TRUST_TIERS.EXTERNAL)).toBe(true);
        expect(isExternalTier(TRUST_TIERS.UNCLASSIFIED)).toBe(true);
        expect(isExternalTier(TRUST_TIERS.PEER_TRUSTED)).toBe(false);
        expect(isExternalTier(TRUST_TIERS.OWNER)).toBe(false);
        expect(isExternalTier(TRUST_TIERS.REPO_TRUSTED)).toBe(false)
    });

    test('collaborator Set entries are normalized (@-prefix + case) like the array path', () => {
        // Boundary: a Set carrying an un-normalized login must still match (the array path already did).
        expect(classifyAuthorTrust('outside-maintainer', {collaborators: new Set(['@Outside-Maintainer'])})).toBe(TRUST_TIERS.REPO_TRUSTED);
        expect(classifyAuthorTrust('@Outside-Maintainer', {collaborators: new Set(['  Outside-Maintainer '])})).toBe(TRUST_TIERS.REPO_TRUSTED)
    });

    test('isTrustedTier: recognized non-external tiers only; missing/unknown → false (fail-closed)', () => {
        expect(isTrustedTier(TRUST_TIERS.PEER_TRUSTED)).toBe(true);
        expect(isTrustedTier(TRUST_TIERS.OWNER)).toBe(true);
        expect(isTrustedTier(TRUST_TIERS.REPO_TRUSTED)).toBe(true);
        expect(isTrustedTier(TRUST_TIERS.EXTERNAL)).toBe(false);
        expect(isTrustedTier(TRUST_TIERS.UNCLASSIFIED)).toBe(false);
        expect(isTrustedTier(undefined)).toBe(false);
        expect(isTrustedTier('made-up-tier')).toBe(false)
    });
});

test.describe('Neo.ai.services.shared.contentTrust.astroturfSanitizer', () => {
    test('link-bearing variant: a trailing marketing URL from an external author is defanged', () => {
        const content = 'Two structural observations on the worker topology. Great work. See https://arkforge.tech/neo for more.';
        const result  = sanitizeContent(content, {tier: TRUST_TIERS.EXTERNAL});

        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.sanitized).not.toContain('https://arkforge.tech');
        expect(result.sanitized).toContain('Two structural observations'); // technical signal preserved
        expect(result.redactions.some(r => r.type === 'url' && r.domain === 'arkforge.tech')).toBe(true)
    });

    test('markdown links keep their text and quarantine only the target', () => {
        const result = sanitizeContent('You should really [check this out](https://evil.example.com/payload?x=1).', {tier: TRUST_TIERS.UNCLASSIFIED});

        expect(result.sanitized).toContain('check this out [QUARANTINED_URL: evil.example.com]');
        expect(result.sanitized).not.toContain('evil.example.com/payload');
        expect(result.redactions.some(r => r.type === 'markdown-link')).toBe(true)
    });

    test('link-free variant: a denylisted bare product name (no link) is redacted', () => {
        const content = 'Solid points. Memorly is the write-side counterpart to your Memory Core, worth a look.';
        const result  = sanitizeContent(content, {tier: TRUST_TIERS.EXTERNAL, productNameDenylist: ['Memorly']});

        expect(result.sanitized).toContain('[external product name redacted]');
        expect(result.sanitized).not.toContain('Memorly');
        expect(result.sanitized).toContain('write-side counterpart'); // signal preserved
        expect(result.redactions.some(r => r.type === 'product-name')).toBe(true)
    });

    test('vendor-pitch variant: engagement-bait + external-endpoint offer are FLAGGED, not redacted', () => {
        const content = 'Nice project. If this gets 15+ 👍 I\'ll index neo and stand up a hosted MCP endpoint for it. Repo: https://bytebell.example/openir';
        const result  = sanitizeContent(content, {tier: TRUST_TIERS.EXTERNAL});

        // The URL is quarantined...
        expect(result.sanitized).toContain('[QUARANTINED_URL: bytebell.example]');
        // ...but the bait prose stays (signal preserved for the human), and the signals are surfaced.
        expect(result.sanitized).toContain('If this gets 15+');
        const signalIds = result.signals.map(s => s.id);
        expect(signalIds).toContain('engagement-bait-reward-conditional');
        expect(signalIds).toContain('external-endpoint-offer')
    });

    test('TRUST GATE: identical hostile content from a TRUSTED author passes through untouched', () => {
        const content = 'If this gets 15+ 👍 I\'ll stand up a hosted MCP endpoint. https://arkforge.tech';
        const result  = sanitizeContent(content, {tier: TRUST_TIERS.PEER_TRUSTED, productNameDenylist: ['arkforge']});

        expect(result.wasModified).toBe(false);
        expect(result.sanitized).toBe(content);
        expect(result.redactions).toEqual([]);
        expect(result.signals).toEqual([])
    });

    test('FAIL CLOSED: missing or unrecognized tier sanitizes (absent provenance is not trusted)', () => {
        const content = 'see https://payload.example/offer';

        // Omitted tier — the `{}` case (no positive trusted provenance supplied).
        const missing = sanitizeContent(content, {});
        expect(missing.wasModified, 'omitted tier must not pass URL-bearing content through').toBe(true);
        expect(missing.sanitized).toContain('[QUARANTINED_URL: payload.example]');

        // Unrecognized / malformed tier string.
        const unknown = sanitizeContent(content, {tier: 'totally-made-up-tier'});
        expect(unknown.wasModified, 'unrecognized tier must fail closed').toBe(true);
        expect(unknown.sanitized).toContain('[QUARANTINED_URL: payload.example]')
    });

    test('NO FALSE POSITIVE: clean external content is not modified or flagged', () => {
        const content = 'I think the App Worker should debounce the resize event before re-partitioning columns.';
        const result  = sanitizeContent(content, {tier: TRUST_TIERS.EXTERNAL, productNameDenylist: ['arkforge']});

        expect(result.wasModified).toBe(false);
        expect(result.sanitized).toBe(content);
        expect(result.redactions).toEqual([]);
        expect(result.signals).toEqual([])
    });

    test('empty / non-string content is handled without throwing', () => {
        expect(sanitizeContent('', {tier: TRUST_TIERS.EXTERNAL})).toEqual({sanitized: '', redactions: [], signals: [], wasModified: false});
        expect(sanitizeContent(null, {tier: TRUST_TIERS.EXTERNAL}).sanitized).toBe('');
        expect(sanitizeContent(undefined, {tier: TRUST_TIERS.EXTERNAL}).wasModified).toBe(false)
    });
});
