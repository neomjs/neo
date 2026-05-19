import aiConfig          from '../../../mcp/server/knowledge-base/config.mjs';
import SourceRegistry    from './SourceRegistry.mjs';
import AdrSource         from './AdrSource.mjs';
import ApiSource         from './ApiSource.mjs';
import ConceptSource     from './ConceptSource.mjs';
import DiscussionSource  from './DiscussionSource.mjs';
import LearningSource    from './LearningSource.mjs';
import PullRequestSource from './PullRequestSource.mjs';
import ReleaseNotesSource from './ReleaseNotesSource.mjs';
import SkillSource       from './SkillSource.mjs';
import TestSource        from './TestSource.mjs';
import TicketSource      from './TicketSource.mjs';

/**
 * @module Neo.ai.services.knowledge-base.source._export
 * @summary Auto-registers Neo's default Source classes into {@link SourceRegistry} at import time.
 *
 * **Auto-registration contract:**
 *
 * - When `aiConfig.useDefaultSources !== false` (the zero-config default for any Neo
 *   deployment), all 10 default Source classes register in deterministic insertion order.
 *   That order matches the pre-Phase-0/1B hardcoded array at `DatabaseService.mjs:470-481`,
 *   ensuring byte-equivalence with the prior KB generation pipeline.
 * - When `aiConfig.useDefaultSources === false` (cloud deployments opting out of Neo's
 *   curated content), no default registration occurs. The registry only contains whatever
 *   tenant-supplied sources are registered programmatically.
 *
 * **Declarative custom-source registration:**
 *
 * Tenants can also declare custom sources via `aiConfig.customSources = [{className, sourceName, ...}, ...]`.
 * Programmatic registration via `SourceRegistry.registerSource(MySourceClass)` after import
 * remains the runtime-extensible path; the config array is the boot-time declarative path.
 *
 * **Order discipline:**
 *
 * The 10 default sources MUST appear in the registry in the same order as the pre-#11658
 * hardcoded array — alphabetic by class identifier with PullRequestSource between
 * LearningSource and ReleaseNotesSource:
 *
 * `AdrSource`, `ApiSource`, `ConceptSource`, `DiscussionSource`, `LearningSource`,
 * `PullRequestSource`, `ReleaseNotesSource`, `SkillSource`, `TicketSource`, `TestSource`
 *
 * The byte-equivalence test asserts this ordering survives the registry refactor.
 *
 * @see https://github.com/neomjs/neo/issues/11658
 * @see https://github.com/neomjs/neo/issues/11625
 */

const DEFAULT_SOURCES = [
    AdrSource,
    ApiSource,
    ConceptSource,
    DiscussionSource,
    LearningSource,
    PullRequestSource,
    ReleaseNotesSource,
    SkillSource,
    TicketSource,
    TestSource
];

if (aiConfig.useDefaultSources !== false) {
    for (const SourceClass of DEFAULT_SOURCES) {
        SourceRegistry.registerSource(SourceClass);
    }
}

// Declarative custom-source registration via aiConfig.customSources (Phase 0/1B contract).
// Each entry is a {SourceClass, sourceName?} pair; consumers pre-import their classes and
// reference them in the config array. Programmatic post-import registration via
// `SourceRegistry.registerSource(...)` remains supported for hot-reload scenarios.
if (Array.isArray(aiConfig.customSources)) {
    for (const entry of aiConfig.customSources) {
        if (entry?.SourceClass) {
            SourceRegistry.registerSource(entry.SourceClass, {sourceName: entry.sourceName});
        }
    }
}

if (Array.isArray(aiConfig.customParsers)) {
    for (const entry of aiConfig.customParsers) {
        if (entry?.ParserClass) {
            SourceRegistry.registerParser(entry.ParserClass, {parserId: entry.parserId});
        }
    }
}

export default SourceRegistry;
export {
    AdrSource,
    ApiSource,
    ConceptSource,
    DEFAULT_SOURCES,
    DiscussionSource,
    LearningSource,
    PullRequestSource,
    ReleaseNotesSource,
    SkillSource,
    TestSource,
    TicketSource
};
