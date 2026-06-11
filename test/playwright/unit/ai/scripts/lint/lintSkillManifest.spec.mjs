import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'child_process';
import path                      from 'path';

import {
    analyzeMarkdownLinkPathOnlyDiff,
    checkOversizedWorkflowMaps,
    checkPerFileBudgets,
    checkRemovedSkillFileReferences,
    checkSectionTriggers,
    checkSkillReferenceIntegrity,
    classifySizeReportRow,
    formatSkillMarkdownSizeReport,
    parseArgs,
    parseFrontmatter,
    parseSectionTriggers,
    parseUnifiedDiffChangedLines,
    shouldSkipDownstreamDocsTargetForLinkPathOnlyChange,
    validateManifestSchema
} from '../../../../../../ai/scripts/lint/lint-skill-manifest.mjs';

test.describe('ai/scripts/lint/lint-skill-manifest (#11275)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-skill-manifest.mjs');

    test('CLI passes against the repository manifest', () => {
        const result = spawnSync('node', [scriptPath, '--base', 'HEAD'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-skill-manifest] OK');
    });

    test('frontmatter parser preserves colon-bearing description text', () => {
        const parsed = parseFrontmatter(`---\nname: test-skill\ndescription: Short: description\n---\n# Body\n`, 'fixture/SKILL.md');

        expect(parsed.name).toBe('test-skill');
        expect(parsed.description).toBe('Short: description');
    });

    test('parseArgs supports live size reports without changing lint defaults', () => {
        expect(parseArgs(['--report-sizes', '--top', '3'])).toEqual({
            base       : null,
            reportSizes: true,
            top        : 3
        });

        expect(parseArgs(['--base=origin/dev'])).toEqual({
            base       : 'origin/dev',
            reportSizes: false,
            top        : 15
        });
    });

    test('CLI emits a live skill size report on demand', () => {
        const result = spawnSync('node', [scriptPath, '--report-sizes', '--top', '3'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-skill-manifest] Skill Markdown size report (live)');
        expect(result.stdout).toContain('rank\tbytes\tlines\tsignals\tdisposition\tfile');
        expect(result.stdout).toContain('.agents/skills/');
    });

    test('formatSkillMarkdownSizeReport renders current metrics without snapshot prose', () => {
        const report = {
            summary: {
                fileCount : 2,
                totalBytes: 300,
                totalLines: 30
            },
            rows: [{
                file       : '.agents/skills/example/references/a.md',
                bytes      : 200,
                lines      : 20,
                signals    : 8,
                disposition: 'keep'
            }]
        };

        const text = formatSkillMarkdownSizeReport(report);

        expect(text).toContain('files=2 bytes=300 lines=30');
        expect(text).toContain('1\t200\t20\t8\tkeep\t.agents/skills/example/references/a.md');
        expect(text).not.toContain('Created for');
    });

    test('classifySizeReportRow flags stale-history-heavy payloads for rewrite', () => {
        expect(classifySizeReportRow({
            file    : '.agents/skills/example/references/history.md',
            bytes   : 12000,
            signals : 80,
            lineRefs: 2,
            history : 20
        })).toBe('rewrite');

        expect(classifySizeReportRow({
            file    : '.agents/skills/example/SKILL.md',
            bytes   : 40000,
            signals : 250,
            lineRefs: 0,
            history : 0
        })).toBe('keep');
    });

    test('schema validator catches missing required skill fields', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                broken: {
                    name                : 'broken',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toContain('broken missing required key: description');
    });

    test('schema validator catches unsupported manifest fields', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: [],
                extraDefault         : true
            },
            skills: {
                extra: {
                    name                : 'extra',
                    description         : 'has extra key',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: [],
                    extraSkill          : true
                }
            },
            extraRoot: true
        }, schema);

        expect(errors).toContain('manifest has unsupported key: extraRoot');
        expect(errors).toContain('defaults has unsupported key: extraDefault');
        expect(errors).toContain('extra has unsupported key: extraSkill');
    });

    test('schema validator treats relationships as optional future-extension metadata', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                optional: {
                    name                : 'optional',
                    description         : 'relationship field omitted intentionally',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toEqual([]);
    });

    test('argument parser supports --base forms', () => {
        expect(parseArgs(['--base', 'origin/dev']).base).toBe('origin/dev');
        expect(parseArgs(['--base=HEAD']).base).toBe('HEAD');
    });

    test('schema validator accepts perFilePayloadBudget as optional defaults field (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                perFilePayloadBudget: 25000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {}
        }, schema);

        expect(errors).not.toContain('defaults has unsupported key: perFilePayloadBudget');
        expect(errors).not.toContain('defaults.perFilePayloadBudget must be a positive integer when set');
    });

    test('schema validator accepts perFilePayloadBudget as optional per-skill override (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'monolith-skill': {
                    name                : 'monolith-skill',
                    description         : 'temporary override for migration-period monolith',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    perFilePayloadBudget: 66000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).not.toContain('monolith-skill has unsupported key: perFilePayloadBudget');
        expect(errors).not.toContain('monolith-skill.perFilePayloadBudget must be a positive integer when set');
    });

    test('schema validator rejects non-positive perFilePayloadBudget (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errorsZeroDefault = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                perFilePayloadBudget: 0,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {}
        }, schema);

        expect(errorsZeroDefault).toContain('defaults.perFilePayloadBudget must be a positive integer when set');

        const errorsNegativeSkill = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'bad-budget': {
                    name                : 'bad-budget',
                    description         : 'negative budget',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    perFilePayloadBudget: -100,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errorsNegativeSkill).toContain('bad-budget.perFilePayloadBudget must be a positive integer when set');
    });

    test('checkPerFileBudgets returns an error for files exceeding the per-file budget (#11320 AC9)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/over-budget.md'),  bytes: 30000},
            {path: path.join(repoRoot, '.agents/skills/example/references/under-budget.md'), bytes: 10000}
        ];

        const errors = checkPerFileBudgets(files, 25000);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('over-budget.md has 30000 bytes, exceeds perFilePayloadBudget 25000');
        expect(errors[0]).toContain('Map vs World Atlas');
        expect(errors[0]).toContain('skill-authoring-guide.md');
    });

    test('checkPerFileBudgets returns no errors when all files are within budget (#11320 AC9)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/a.md'), bytes: 10000},
            {path: path.join(repoRoot, '.agents/skills/example/references/b.md'), bytes: 24999}
        ];

        expect(checkPerFileBudgets(files, 25000)).toEqual([]);
    });

    test('checkPerFileBudgets treats null/undefined/non-positive budget as disabled per omit-to-disable contract (#11320 AC8)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/huge.md'), bytes: 1000000}
        ];

        expect(checkPerFileBudgets(files, undefined)).toEqual([]);
        expect(checkPerFileBudgets(files, null)).toEqual([]);
        expect(checkPerFileBudgets(files, 0)).toEqual([]);
        expect(checkPerFileBudgets(files, -1)).toEqual([]);
    });

    test('schema validator preserves backwards compatibility when perFilePayloadBudget is omitted (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'legacy-skill': {
                    name                : 'legacy-skill',
                    description         : 'pre-#11320 manifest entry without perFilePayloadBudget',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toEqual([]);
    });

    test('checkSectionTriggers returns no errors for sections without triggers or below size threshold (#11320)', () => {
        const text = `
## §1 Short Section
<!-- trigger: this is an edge-case → read ./sub-rule.md -->
Just a short body, well under 5000 bytes.
        `;
        expect(checkSectionTriggers('test.md', text, ['edge-case']).errors).toEqual([]);
    });

    test('checkSectionTriggers returns no errors for large sections without rare triggers (#11320)', () => {
        const padding = 'A'.repeat(6000);
        const text = `
## §2 Large Common Section
<!-- trigger: always relevant → read ./sub-rule.md -->
${padding}
        `;
        expect(checkSectionTriggers('test.md', text, ['edge-case', 'openapi']).errors).toEqual([]);
    });

    test('checkSectionTriggers returns error for large sections with rare triggers (#11320)', () => {
        const padding = 'B'.repeat(6000);
        const text = `
## §3 OpenAPI Edge Case
<!-- trigger: modifies openapi.yaml → read ./openapi-audit.md -->
${padding}
        `;
        const {errors} = checkSectionTriggers('.agents/skills/example/references/test.md', text, ['edge-case', 'openapi']);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('.agents/skills/example/references/test.md §3 OpenAPI Edge Case is ');
        expect(errors[0]).toContain("bytes with declared trigger 'modifies openapi.yaml' (rare-firing class)");
        expect(errors[0]).toContain("Extract to sub-rule sibling file behind one-line trigger pointer per skill-authoring-guide.md §Map vs World Atlas.");
    });

    test('parseSectionTriggers extracts anchor, trigger, subRulePath, and body size (#11320)', () => {
        const padding = 'C'.repeat(100);
        const text = `
## §4 Test Section
<!-- trigger: test condition → read ./test-rule.md -->
${padding}
        `;
        const index = parseSectionTriggers(text);
        expect(index).toHaveLength(1);
        expect(index[0].anchor).toBe('§4 Test Section');
        expect(index[0].trigger).toBe('test condition');
        expect(index[0].subRulePath).toBe('./test-rule.md');
        expect(index[0].bodySizeBytes).toBeGreaterThan(100);
    });

    test('checkOversizedWorkflowMaps passes when one-line pointer addition is within maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pr-review-guide.md', 'some-other-file.md']);
        const oversizedFiles = ['pr-review-guide.md', 'pull-request-workflow.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => file === 'pr-review-guide.md' ? 1200 : 0;
        const getBaseSizeFn = (file) => file === 'pr-review-guide.md' ? 1000 : 0; // Delta: 200

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toEqual([]);
    });

    test('checkOversizedWorkflowMaps fails when PR #11434-style inline addition exceeds maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pull-request-workflow.md']);
        const oversizedFiles = ['pr-review-guide.md', 'pull-request-workflow.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => 1500;
        const getBaseSizeFn = (file) => 1000; // Delta: 500

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Oversized workflow map pull-request-workflow.md grew by 500 bytes (max allowed delta is 250).');
        expect(errors[0]).toContain('Extract substantive additions to a sibling file behind a one-line trigger pointer.');
    });

    test('checkOversizedWorkflowMaps fails when long pr-review-guide.md anti-pattern row exceeds maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pr-review-guide.md']);
        const oversizedFiles = ['pr-review-guide.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => 2300;
        const getBaseSizeFn = (file) => 1000; // Delta: 1300

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Oversized workflow map pr-review-guide.md grew by 1300 bytes');
    });

    test('checkOversizedWorkflowMaps ignores deleted oversized files', () => {
        const changedFiles = new Set(['pr-review-guide.md']);
        const oversizedFiles = ['pr-review-guide.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => null; // File deleted
        const getBaseSizeFn = (file) => 1000;

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toEqual([]);
    });

    test('checkSkillReferenceIntegrity flags dangling numeric section refs (#12493)', () => {
        const files = [{
            relPath: '.agents/skills/pr-review/references/pr-review-guide.md',
            text   : [
                '## 9. Strategic Fit',
                '### 9.0 Premise Pre-Flight',
                'Valid same-file ref: §9.0.',
                'Invalid same-file ref: §9.2.'
            ].join('\n')
        }, {
            relPath: '.agents/skills/pull-request/references/review-response-protocol.md',
            text   : [
                'Valid: pr-review-guide §9.0.',
                'Invalid: pr-review-guide §10.4.'
            ].join('\n')
        }];

        const errors = checkSkillReferenceIntegrity([
            '.agents/skills/pr-review/references/pr-review-guide.md',
            '.agents/skills/pull-request/references/review-response-protocol.md'
        ], files);

        expect(errors).toHaveLength(2);
        expect(errors[0]).toContain('pr-review-guide.md:4');
        expect(errors[0]).toContain('dangling section ref §9.2');
        expect(errors[1]).toContain('review-response-protocol.md:2');
        expect(errors[1]).toContain('dangling section ref pr-review-guide §10.4');
    });

    test('checkSkillReferenceIntegrity validates targeted named section refs (#12582)', () => {
        const files = [{
            relPath: '.agents/skills/ideation-sandbox/audits/consensus-mandate.md',
            text   : [
                '## §template-block — Graduated-Artifact Required Sections',
                '## §same-family-aggregation — Multi-Identity Family Resolution'
            ].join('\n')
        }, {
            relPath: '.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md',
            text   : [
                'Valid linked ref: [`audits/consensus-mandate.md §template-block`](../audits/consensus-mandate.md).',
                'Valid prose ref: consensus-mandate §same-family-aggregation.',
                'Invalid linked ref: [`audits/consensus-mandate.md §missing-template`](../audits/consensus-mandate.md).',
                'Invalid prose ref: consensus-mandate §missing-aggregation.'
            ].join('\n')
        }];

        const errors = checkSkillReferenceIntegrity([
            '.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md'
        ], files);

        expect(errors).toHaveLength(2);
        expect(errors[0]).toContain('ideation-sandbox-workflow.md:3');
        expect(errors[0]).toContain('dangling section ref ../audits/consensus-mandate.md §missing-template');
        expect(errors[1]).toContain('ideation-sandbox-workflow.md:4');
        expect(errors[1]).toContain('dangling section ref consensus-mandate §missing-aggregation');
    });

    test('parseUnifiedDiffChangedLines maps base diffs to current-file line numbers (#12557)', () => {
        const diffText = [
            'diff --git a/.agents/skills/pr-review/references/pr-review-guide.md b/.agents/skills/pr-review/references/pr-review-guide.md',
            '--- a/.agents/skills/pr-review/references/pr-review-guide.md',
            '+++ b/.agents/skills/pr-review/references/pr-review-guide.md',
            '@@ -1,4 +1,4 @@',
            ' ## 9. Strategic Fit',
            '-Old changed line with §9.2.',
            '+New changed line with §9.0.',
            ' Unchanged line with stale §10.4.'
        ].join('\n');

        const changedLines = parseUnifiedDiffChangedLines(diffText);

        expect([...changedLines.get('.agents/skills/pr-review/references/pr-review-guide.md')]).toEqual([2]);
    });

    test('checkSkillReferenceIntegrity only scans changed lines when base ownership is provided (#12557)', () => {
        const relPath = '.agents/skills/pr-review/references/pr-review-guide.md';
        const files = [{
            relPath,
            text: [
                '## 9. Strategic Fit',
                '### 9.0 Premise Pre-Flight',
                'Changed valid ref: §9.0.',
                'Pre-existing stale ref: §9.2.'
            ].join('\n')
        }];

        expect(checkSkillReferenceIntegrity([relPath], files, {
            changedLinesByRelPath: new Map([[relPath, new Set([3])]])
        })).toEqual([]);

        const errors = checkSkillReferenceIntegrity([relPath], files, {
            changedLinesByRelPath: new Map([[relPath, new Set([4])]])
        });

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('pr-review-guide.md:4');
        expect(errors[0]).toContain('dangling section ref §9.2');
    });

    test('checkSkillReferenceIntegrity only scans changed named section refs when base ownership is provided (#12582)', () => {
        const relPath = '.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md';
        const files = [{
            relPath: '.agents/skills/ideation-sandbox/audits/consensus-mandate.md',
            text   : '## §template-block — Graduated-Artifact Required Sections'
        }, {
            relPath,
            text: [
                'Valid changed ref: consensus-mandate §template-block.',
                'Pre-existing stale ref: consensus-mandate §missing-template.'
            ].join('\n')
        }];

        expect(checkSkillReferenceIntegrity([relPath], files, {
            changedLinesByRelPath: new Map([[relPath, new Set([1])]])
        })).toEqual([]);

        const errors = checkSkillReferenceIntegrity([relPath], files, {
            changedLinesByRelPath: new Map([[relPath, new Set([2])]])
        });

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('ideation-sandbox-workflow.md:2');
        expect(errors[0]).toContain('dangling section ref consensus-mandate §missing-template');
    });

    test('downstream docs skip only applies to link-path-only skill diffs whose docs omit the moved target (#12557)', () => {
        const pathOnlyDiff = [
            'diff --git a/.agents/skills/pull-request/SKILL.md b/.agents/skills/pull-request/SKILL.md',
            '--- a/.agents/skills/pull-request/SKILL.md',
            '+++ b/.agents/skills/pull-request/SKILL.md',
            '@@ -2 +2 @@',
            '-description: Read [evidence-ladder.md](learn/agentos/evidence-ladder.md) before review evidence.',
            '+description: Read [evidence-ladder.md](learn/agentos/process/evidence-ladder.md) before review evidence.'
        ].join('\n');

        const analysis = analyzeMarkdownLinkPathOnlyDiff(pathOnlyDiff);

        expect(analysis.isPathOnly).toBe(true);
        expect([...analysis.changedTargets]).toEqual([
            'learn/agentos/evidence-ladder.md',
            'learn/agentos/process/evidence-ladder.md'
        ]);
        expect(shouldSkipDownstreamDocsTargetForLinkPathOnlyChange(pathOnlyDiff, 'Evidence is described generically here.')).toBe(true);
        expect(shouldSkipDownstreamDocsTargetForLinkPathOnlyChange(pathOnlyDiff, 'Still cites learn/agentos/evidence-ladder.md.')).toBe(false);

        const semanticDiff = pathOnlyDiff.replace(
            '+description: Read [evidence-ladder.md](learn/agentos/process/evidence-ladder.md) before review evidence.',
            '+description: Read [evidence-ladder.md](learn/agentos/process/evidence-ladder.md) before expanded review evidence.'
        );

        expect(analyzeMarkdownLinkPathOnlyDiff(semanticDiff).isPathOnly).toBe(false);
    });

    test('checkSkillReferenceIntegrity scans manifest prose refs as source text (#12493)', () => {
        const files = [{
            relPath: '.agents/skills/pr-review/references/pr-review-guide.md',
            text   : '## 10. A2A Comment-ID Hand-off\n'
        }, {
            relPath: '.agents/skills/skills.manifest.json',
            text   : '{"description":"Review handoff per pr-review-guide §10.5"}'
        }];

        const errors = checkSkillReferenceIntegrity([
            '.agents/skills/skills.manifest.json'
        ], files);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('skills.manifest.json:1');
        expect(errors[0]).toContain('dangling section ref pr-review-guide §10.5');
    });

    test('checkSkillReferenceIntegrity flags broken relative markdown pointers (#12493)', () => {
        const files = [{
            relPath: '.agents/skills/pull-request/references/pull-request-workflow.md',
            text   : [
                'Valid: [response](./review-response-protocol.md).',
                'Broken: [missing](./missing-rule.md).',
                'Broken bare relative pointer: ./also-missing.md',
                'Example fence ignored:',
                '```md',
                '[template](./fenced-missing.md)',
                '```'
            ].join('\n')
        }, {
            relPath: '.agents/skills/pull-request/references/review-response-protocol.md',
            text   : '# Review Response Protocol\n'
        }];

        const errors = checkSkillReferenceIntegrity([
            '.agents/skills/pull-request/references/pull-request-workflow.md'
        ], files);

        expect(errors).toHaveLength(2);
        expect(errors[0]).toContain('pull-request-workflow.md:2');
        expect(errors[0]).toContain('broken file pointer ./missing-rule.md');
        expect(errors[1]).toContain('pull-request-workflow.md:3');
        expect(errors[1]).toContain('broken file pointer ./also-missing.md');
    });

    test('checkSkillReferenceIntegrity ignores external refs, ticket refs, and unresolved prose (#12493)', () => {
        const files = [{
            relPath: '.agents/skills/example/references/example-workflow.md',
            text   : [
                'Ticket #12488 and ADR 0019 §A4 are descriptive refs.',
                'External [doc](https://example.com/a.md) is out of scope.',
                'Wildcard authoring prose like `references/*.md` is not a concrete pointer.',
                'Generic guide §7 wording has no resolvable target and is ignored.',
                'External named anchors like AGENTS.md §verify_before_assert are ignored when the file target is outside skill substrate.',
                'Standalone named prose like §contributions_over_commits stays descriptive without a markdown target.'
            ].join('\n')
        }];

        expect(checkSkillReferenceIntegrity([
            '.agents/skills/example/references/example-workflow.md'
        ], files)).toEqual([]);
    });

    test('checkRemovedSkillFileReferences flags surviving refs to deleted skill files (#12493)', () => {
        const files = [{
            relPath: '.agents/skills/pull-request/references/pull-request-workflow.md',
            text   : [
                'Deleted relative pointer: [old](./removed-rule.md).',
                'Deleted basename section ref: removed-rule §2.1.',
                'Deleted named section ref: removed-rule §legacy-anchor.',
                'Live pointer: [response](./review-response-protocol.md).'
            ].join('\n')
        }, {
            relPath: '.agents/skills/pull-request/references/review-response-protocol.md',
            text   : '# Review Response Protocol\n'
        }];

        const errors = checkRemovedSkillFileReferences([
            '.agents/skills/pull-request/references/removed-rule.md'
        ], files);

        expect(errors).toHaveLength(3);
        expect(errors[0]).toContain('pull-request-workflow.md:1');
        expect(errors[0]).toContain('reference to deleted file ./removed-rule.md');
        expect(errors[1]).toContain('pull-request-workflow.md:2');
        expect(errors[1]).toContain('reference to deleted file removed-rule');
        expect(errors[2]).toContain('pull-request-workflow.md:3');
        expect(errors[2]).toContain('reference to deleted file removed-rule');
    });
});
