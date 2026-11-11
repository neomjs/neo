import {pointerFor} from 'neo-agent-skills/agents-md/pointer';
import isEntryModule from './isEntryModule.mjs';

/**
 * @module buildScripts/util/agentsMdPointer
 * @summary The `AGENTS.md` clean command of commits that still carried the Engine's own pointer mechanism, answered
 * by the package that owns the pointer now. Git keeps filter settings per clone, so an install in a worktree of such a
 * commit registers this command for every worktree, this one included. Retire it once no such worktree is in use.
 */

if (isEntryModule(import.meta.url)) {
    // Git writes the working copy to stdin. Drain it, so git never meets a closed pipe, then answer the pointer.
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write(pointerFor('neo')))
}
