/**
 * @summary Names the `askSynthesis` config leaves missing from a config slice.
 *
 * The stale-overlay guard for the knowledge-base server: gitignored `config.mjs` files are
 * MATERIALIZED copies of `config.template.mjs` (reconciled via `ai/scripts/setup/initServerConfigs.mjs
 * --migrate-config`), so a clone that pulled an evolved template without running the migrate
 * resolves the whole `askSynthesis` block — or its newer leaves — as `undefined` at runtime.
 * `SearchService.construct` calls this BEFORE touching the block and degrades loudly with the
 * remediation instead of crashing the server boot on an `undefined.provider` read. Deliberately no
 * hidden fallbacks: fabricating a default provider/model here would silently route synthesis to an
 * unintended endpoint — the config provider owns defaults, via the template.
 *
 * Pure function over a plain slice — unit-testable without reading or mutating the shared
 * AiConfig singleton (the shared-singleton write ban). Mirrors the memory-core
 * `getMissingMemoryWalLeaves` pattern: the same MCP-config-block-missing failure class, the same
 * guard shape, per-server ownership.
 *
 * @param {Object|undefined} askSynthesis The resolved `askSynthesis` config slice (may be absent entirely).
 * @param {String[]} requiredLeaves Leaf names the calling consumer is about to read.
 * @returns {String[]} Missing leaf names; empty array when the slice satisfies the consumer.
 */
export function getMissingAskSynthesisLeaves(askSynthesis, requiredLeaves) {
    if (!askSynthesis) return [...requiredLeaves];

    return requiredLeaves.filter(leaf => askSynthesis[leaf] === undefined || askSynthesis[leaf] === null);
}
