import process       from 'node:process';
import isEntryModule from './isEntryModule.mjs';

/**
 * @module buildScripts/util/agentsMdPointer
 * @summary The text git keeps in `AGENTS.md`, and the clean filter that keeps it there.
 *
 * `prepare` and `seat:start` write the generated agent rules into `AGENTS.md`, the path every coding agent
 * reads. Git keeps only this pointer: `.gitattributes` routes `AGENTS.md` through the {@link AGENTS_MD_FILTER}
 * clean filter, which the `agents-md` stage registers as required, and the filter answers any working copy with
 * the pointer. Required means a filter that cannot run makes git refuse to store the file, never store it raw.
 * `git status` stays clean, and a clone that never installed shows the pointer, which tells its reader where the
 * rules come from. It is Git LFS's pattern: a pointer in git, the content in the working copy.
 */

/**
 * @summary The committed content of `AGENTS.md`. The first line marks it as the pointer, so a tool can tell it
 * from the generated rules.
 * @member {String} AGENTS_MD_POINTER
 */
export const AGENTS_MD_POINTER = [
    '<!-- neo-agents-md: pointer -->',
    'IMPORTANT: this file is generated. `npm install` writes the agent rules here and materializes the agent skills into `.agents/skills/`.',
    'Contributing from a fork without installing? `npx -p neo-agent-skills neo-agent-skills-agents-md --repo neo --audience contributor` prints the rules you follow.',
    ''
].join('\n');

/**
 * @summary The git filter driver that `.gitattributes` names for `AGENTS.md`.
 * @member {String} AGENTS_MD_FILTER
 */
export const AGENTS_MD_FILTER = 'neo-agents-md';

/**
 * @summary The filtered path, relative to the top of the working tree.
 * @member {String} AGENTS_MD_PATH
 */
export const AGENTS_MD_PATH = 'AGENTS.md';

/**
 * @summary The filter's `clean` command, run by git from the top of the working tree.
 * @member {String} AGENTS_MD_CLEAN_COMMAND
 */
export const AGENTS_MD_CLEAN_COMMAND = 'node buildScripts/util/agentsMdPointer.mjs';

/**
 * @summary The filter's `smudge` command: a checkout writes the stored pointer unchanged. Git holds a required filter
 * to both directions, so without it every checkout that writes `AGENTS.md` fails.
 * @member {String} AGENTS_MD_SMUDGE_COMMAND
 */
export const AGENTS_MD_SMUDGE_COMMAND = 'cat';

if (isEntryModule(import.meta.url)) {
    // Git writes the working copy to stdin. Drain it, so git never meets a closed pipe, then answer the pointer.
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write(AGENTS_MD_POINTER))
}
