# Skill Runtime Baggage Inventory

Created for #11902 as the #11605 AC3 inventory slice.

## Measurement

Scope: `.agents/skills/**/*.md`

Method: recursive Markdown scan, counting UTF-8 bytes, lines, Markdown headings,
normative keywords, ticket/discussion anchors, provenance terms, trigger terms,
and brittle source line references.

Summary:

| Metric | Value |
|---|---:|
| Markdown files | 82 |
| Total bytes | 492,671 |
| Total lines | 5,998 |
| `SKILL.md` router bytes | 25,426 |
| `references/` bytes | 406,187 |
| `audits/` bytes | 42,094 |
| `assets/` bytes | 18,117 |
| Top 10 files share | 48.1% |
| Top 15 files share | 63.8% |

The issue is not router size. The load is concentrated in workflow references
and review lifecycle assets.

## Ranked Hotspots

| Rank | File | Bytes | Lines | Baggage signals | Disposition |
|---:|---|---:|---:|---:|---|
| 1 | `.agents/skills/pr-review/references/pr-review-guide.md` | 56,962 | 530 | 307 | `compress-to-trigger` |
| 2 | `.agents/skills/pull-request/references/pull-request-workflow.md` | 36,694 | 414 | 217 | `compress-to-trigger` |
| 3 | `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` | 24,903 | 192 | 156 | `rewrite` |
| 4 | `.agents/skills/peer-role/references/peer-role-mode.md` | 20,390 | 211 | 140 | `compress-to-trigger` |
| 5 | `.agents/skills/epic-resolution/references/epic-resolution-workflow.md` | 14,785 | 187 | 106 | `compress-to-trigger` |
| 6 | `.agents/skills/session-sunset/references/session-sunset-workflow.md` | 19,007 | 205 | 100 | `compress-to-trigger` |
| 7 | `.agents/skills/lead-role/references/lead-role-mode.md` | 17,416 | 188 | 100 | `compress-to-trigger` |
| 8 | `.agents/skills/ideation-sandbox/audits/consensus-mandate.md` | 11,189 | 109 | 93 | `move` |
| 9 | `.agents/skills/structural-pre-flight/references/structural-pre-flight-workflow.md` | 18,968 | 223 | 90 | `keep` |
| 10 | `.agents/skills/ticket-create/references/ticket-create-workflow.md` | 16,719 | 168 | 74 | `rewrite` |
| 11 | `.agents/skills/pull-request/references/review-response-protocol.md` | 14,176 | 149 | 73 | `compress-to-trigger` |
| 12 | `.agents/skills/ticket-intake/references/ticket-intake-workflow.md` | 16,749 | 133 | 64 | `rewrite` |
| 13 | `.agents/skills/epic-review/references/epic-review-workflow.md` | 18,822 | 224 | 60 | `keep` |
| 14 | `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` | 14,342 | 220 | 57 | `rewrite` |
| 15 | `.agents/skills/create-skill/references/skill-authoring-guide.md` | 13,193 | 174 | 47 | `keep` |

`Baggage signals` is a ranking heuristic, not a correctness score. It weights
size, heading count, historical anchors, provenance terms, line-reference
patterns, and excessive normative keywords. It identifies where human review
should look first.

## Disposition Notes

`pr-review` is the first pilot candidate. It is the largest file and also owns
the most visible operator friction: full-review-per-cycle bloat, redundant CI
sections, and contract-ledger ceremony appearing in routine reviews. The pilot
should preserve the merge gate and evidence discipline while replacing repeated
review-body payload with a cycle-aware full-review versus micro-delta contract.

`pull-request` is the second pilot candidate. It is large, hot-path, and carries
stale empirical anchors and lifecycle archaeology. The pilot should keep PR body
lint compatibility, target-branch rules, and cross-family review requirements,
but move incident stories behind trigger pointers.

`ideation-sandbox` should be rewritten after the review/PR pilots. Its current
workflow mixes discussion shaping, graduation mechanics, consensus policy, and
incident-derived guardrails in one file. The safer shape is a small graduation
map plus targeted audit payloads.

`ticket-create`, `ticket-intake`, and `post-review-pickup` need rewrite passes,
not simple moves. They are operationally load-bearing, but the current form
blends gates, examples, exception history, and routing tables. The rewrite goal
is a compact decision map with atlas files for rare branches.

`structural-pre-flight`, `epic-review`, and `create-skill` should stay mostly
intact for now. They are sizable, but their payload is closer to core procedure
than historical baggage. Revisit them after the first two pilots prove the atom.

## Child Topology Recommendation

Recommended #11605 follow-up children:

| Parent AC | Ticket shape |
|---|---|
| AC4 | Pilot `pr-review`: cycle-aware review density and micro-delta re-review contract |
| AC5 | Pilot `pull-request`: compress workflow archaeology and stale empirical anchors |
| AC6 | Batch rollout plan from this inventory after AC4/AC5 land |
| AC7 | Incident/provenance destination contract, preferably a small atlas convention |
| AC8 | Link or disposition #11604 as codify-deferral sibling/child after pilot evidence |

Do not open one all-skills migration PR. The inventory supports two hot-path
pilots first, then a batch plan.

## Reproduction

Run this from the repository root:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() && file.endsWith('.md') ? [file] : [];
});

const rows = walk('.agents/skills').map(file => {
    const text        = fs.readFileSync(file, 'utf8');
    const bytes       = Buffer.byteLength(text);
    const lines       = text.split('\n').length;
    const headings    = (text.match(/^#{1,6}\s+/gm) || []).length;
    const musts       = (text.match(/\bMUST\b|\bMANDATORY\b|\bFORBIDDEN\b/g) || []).length;
    const history     = (text.match(/\b(PR|Issue|Discussion)\s+#\d+|#\d{4,}|empirical anchor|lineage|histor/ig) || []).length;
    const lineRefs    = (text.match(/[A-Za-z0-9_.\/-]+\.(mjs|md|js|json):\d+/g) || []).length;
    const archaeology = (text.match(/archaeolog|provenance|incident|origin|lineage|empirical anchor/ig) || []).length;
    const trigger     = (text.match(/trigger|when to read|read .* before|<!--\s*trigger:/ig) || []).length;
    const score       = Math.round(bytes / 1000) + headings + history * 2 + lineRefs * 3 + archaeology * 2 + Math.max(0, musts - 10);

    return {file, bytes, lines, headings, musts, history, lineRefs, archaeology, trigger, score};
}).sort((a, b) => b.score - a.score || b.bytes - a.bytes);

console.table(rows.slice(0, 15));
console.log({
    fileCount : rows.length,
    totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    totalLines: rows.reduce((sum, row) => sum + row.lines, 0)
});
NODE
```
