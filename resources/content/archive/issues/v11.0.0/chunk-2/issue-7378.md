---
id: 7378
title: Enhance Knowledge Base to Include GitHub Comments
state: CLOSED
labels:
  - enhancement
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-10-05T13:11:43Z'
updatedAt: '2025-10-24T09:41:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7378'
author: tobiu
commentsCount: 10
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:41:35Z'
---
# Enhance Knowledge Base to Include GitHub Comments

The comments on GitHub issues and PRs contain invaluable context, debates, and decision-making history. To make this information discoverable by the agent, we need to ingest these comments into our local knowledge base (ChromaDB). This ticket is to enhance the knowledge base creation process to include comments.

## Acceptance Criteria

1.  The `buildScripts/ai/createKnowledgeBase.mjs` script, or a new supplementary script, is updated.
2.  The script will use the `gh` CLI to fetch comments for each issue/PR being ingested (e.g., `gh issue view <ID> --comments`).
3.  Each comment should be processed into a new, separate "chunk" for the knowledge base JSONL file.
4.  Each comment chunk must be linked to its parent issue/PR chunk to maintain context (e.g., via a `parentId` field).
5.  This ensures that a semantic search for a topic will return not only the original ticket but also the relevant discussion from the comments.

## Timeline

- 2025-10-05T13:11:44Z @tobiu added the `enhancement` label
- 2025-10-05T13:11:44Z @tobiu added parent issue #7364
### @kart-u - 2025-10-05T13:20:46Z

@tobiu I would like to  work on this, can you assign it to me??

- 2025-10-05T14:21:52Z @tobiu assigned to @kart-u
### @tobiu - 2025-10-05T14:21:56Z

sure. Gemini input on this one (more and more ai native workflows^^):

> ✦ This ticket, ticket-add-github-comments-to-kb.md, is an implementation task, not just documentation. The contributor will need to write and test a script that actively 
>   fetches data from GitHub.
> 
>   Blocker Analysis
> 
>    1. Core Requirement: The script must execute gh commands like gh issue view <ID> --comments to fetch the comment data.
>    2. Environment Dependency: Executing these commands requires a functioning and authenticated GitHub CLI environment.
> 
>   This puts it in the same category as the ticket-sync-gh-issues-to-local.md script.
> 
>   Conclusion
> 
>    - Formally Blocked: The task is dependent on the completion of the Phase 1 ticket, ticket-setup-github-cli-authentication.md, which will provide the official instructions for setting up the required environment.
> 
>    - Practically Available: A proactive contributor can start on this now, provided they are willing to independently install and authenticate the gh CLI on their machine without waiting for our guide.
> 
>   Recommendation:
>   The same guidance applies. The contributor can proceed, but they should be made aware that they will need to handle the gh CLI setup themselves as a prerequisite to working on and testing their solution.

- 2025-10-06T20:06:54Z @kart-u referenced in commit `620ab3d` - "Enhance Knowledge Base to Include GitHub Comments #7378"
### @kart-u - 2025-10-06T20:21:07Z

@tobiu had one doubt 
do we need to look into comment for .github/ISSUE_ARCHIVE only or .github/ISSUE too

- 2025-10-06T20:52:25Z @tobiu added the `hacktoberfest` label
### @tobiu - 2025-10-06T20:54:05Z

The current idea was to drop md files into an archive, whenever we do a new npm release. Rationale: keeping items grouped. Fairly new as you can see: it literally started with the last release (v10.8).

So currently, we have issues for the next release and the backlog combined inside the ISSUE folder, which is not ideal.

I do agree that we should create a new sub to this epic, which deals with how and where we want to store comments (as md files for each? inside their parent ticket md files?), since this sub is "one step ahead" => to get the new structure into chromaDB (the ai knowledge base). Feel free to create the new ticket, and I can assign it to you, in case you would like to work on it.

The part which is intense: v10.9 was 2 weeks ago. Now the ISSUE folder already contains 120 items (tickets) and this is still growing. I am becoming a bottleneck.

### @kart-u - 2025-10-08T16:53:27Z

Oh but I was thinking the current format is fine. I mean, keeping a comment for every issue would make the repository needlessly bulky. If we’re using a retrieval based method where we retrieve comments when needed and then save them in a format to develop context ,it would be the same as the current method, since we’ll eventually need to create a JSONL file for ChromaDB anyway. If I’m missing something here, please correct me.

### @tobiu - 2025-10-08T17:00:49Z

@kart-u I already used AI to brainstorm about it. more like a v2 idea (e.g. new epic?), unless we want to change the current scope a lot.

Claude:

Looking at your epic structure, I'll create a bidirectional sync script that fits your workflow. Let me enhance it to handle your specific needs:I've enhanced the script with **bidirectional sync**. Key improvements:

## New Features

**1. Local → GitHub sync:**
- Scans all `.md` files in `ISSUES/` and `ISSUE_ARCHIVE/`
- Detects files modified since last sync
- Pushes changes back to GitHub via `gh issue edit`

**2. Proper frontmatter parsing:**
- Uses `gray-matter` library for YAML frontmatter
- Preserves metadata structure

**3. Smart conflict handling:**
- Local changes pushed **first** (before GitHub pull)
- Only pushes if file modified after last sync
- Respects the "no reopening" rule

## Setup

```bash
npm install gray-matter
```

**Add to package.json:**
```json
{
  "type": "module",
  "scripts": {
    "sync:issues": "node sync-issues.mjs",
    "sync:push": "node sync-issues.mjs --push-only",
    "sync:pull": "node sync-issues.mjs --pull-only"
  },
  "dependencies": {
    "gray-matter": "^4.0.3"
  }
}
```

## Usage

```bash
# Full bidirectional sync
npm run sync:issues

# Add to cron for automated sync
0 */4 * * * cd /path/to/repo && npm run sync:issues
```

## How It Works

1. **Scans local files** for changes (checks mtime vs last_sync)
2. **Pushes changes** to GitHub (updates issue title/body)
3. **Pulls from GitHub** (fetches all issues + comments)
4. **Writes markdown files** with frontmatter + inline comments
5. **Updates metadata.json** for next sync

## Limitations

- Comments are **read-only** from GitHub (local comment edits won't sync back)
- Only syncs issue body/title to GitHub
- Assumes `gh` CLI is authenticated

This fits your epic structure perfectly - agents can work on local `.md` files, and changes automatically flow to GitHub!

```javascript
#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

// Configuration
const CONFIG = {
  issuesDir: '.github/ISSUES',
  archiveDir: '.github/ISSUE_ARCHIVE',
  metadataFile: '.github/.github-sync/metadata.json',
  droppedLabels: ['dropped', 'wontfix', 'duplicate'],
  // Define your release schedule (newest first)
  releases: [
    { version: 'v11.0', cutoffDate: '2025-11-01' },
    { version: 'v10.9', cutoffDate: '2025-08-01' },
    { version: 'v10.8', cutoffDate: '2025-05-01' },
  ]
};

/**
 * Execute gh CLI command and return JSON result
 */
function ghCommand(cmd) {
  try {
    const result = execSync(`gh ${cmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(result);
  } catch (error) {
    console.error(`Error executing: gh ${cmd}`);
    console.error(error.stderr || error.message);
    throw error;
  }
}

/**
 * Determine release version based on closed date
 */
function determineRelease(closedAt, milestone) {
  // Use milestone if available
  if (milestone?.title) {
    return milestone.title;
  }

  // Otherwise, use closed date to assign to release
  const closed = new Date(closedAt);
  
  for (const release of CONFIG.releases) {
    if (closed >= new Date(release.cutoffDate)) {
      return release.version;
    }
  }
  
  // Default to oldest release or 'unknown'
  return CONFIG.releases[CONFIG.releases.length - 1]?.version || 'unknown';
}

/**
 * Determine target path for an issue
 */
function getIssuePath(issue) {
  const number = String(issue.number).padStart(4, '0');
  const labels = issue.labels.map(l => l.name.toLowerCase());
  
  // Check if dropped
  const isDropped = CONFIG.droppedLabels.some(label => labels.includes(label));
  if (isDropped) {
    return null; // Don't store dropped issues
  }
  
  // Open issues go to ISSUES/
  if (issue.state === 'open') {
    return path.join(CONFIG.issuesDir, `${number}.md`);
  }
  
  // Closed issues go to archive by release
  if (issue.state === 'closed') {
    const version = determineRelease(issue.closed_at, issue.milestone);
    return path.join(CONFIG.archiveDir, version, `${number}.md`);
  }
  
  return null;
}

/**
 * Format issue as markdown with frontmatter
 */
function formatIssueMarkdown(issue, comments) {
  const labels = issue.labels.map(l => l.name);
  const assignees = issue.assignees.map(a => a.login);
  
  // Frontmatter
  const frontmatter = {
    id: issue.number,
    title: issue.title,
    state: issue.state,
    labels,
    assignees,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    github_url: issue.html_url,
    author: issue.user.login,
    comments_count: comments.length
  };
  
  if (issue.closed_at) {
    frontmatter.closed_at = issue.closed_at;
  }
  if (issue.milestone) {
    frontmatter.milestone = issue.milestone.title;
  }
  
  // Issue body
  let body = `# ${issue.title}\n\n`;
  body += `**Reported by:** @${issue.user.login} on ${issue.created_at.split('T')[0]}\n\n`;
  body += issue.body || '*(No description provided)*';
  body += '\n\n';
  
  // Comments section
  if (comments.length > 0) {
    body += '## Comments\n\n';
    for (const comment of comments) {
      const date = comment.created_at.split('T')[0];
      const time = comment.created_at.split('T')[1].substring(0, 5);
      body += `### @${comment.user.login} - ${date} ${time}\n\n`;
      body += comment.body;
      body += '\n\n';
    }
  }
  
  return matter.stringify(body, frontmatter);
}

/**
 * Load metadata from disk
 */
async function loadMetadata() {
  try {
    const data = await fs.readFile(CONFIG.metadataFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      issues: {},
      dropped_ids: [],
      last_sync: null
    };
  }
}

/**
 * Save metadata to disk
 */
async function saveMetadata(metadata) {
  const dir = path.dirname(CONFIG.metadataFile);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    CONFIG.metadataFile,
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Scan local markdown files for changes
 */
async function scanLocalFiles() {
  const localFiles = [];
  
  async function scanDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          localFiles.push(fullPath);
        }
      }
    } catch (e) {
      // Directory doesn't exist yet
    }
  }
  
  await scanDir(CONFIG.issuesDir);
  await scanDir(CONFIG.archiveDir);
  
  return localFiles;
}

/**
 * Parse markdown file with frontmatter
 */
async function parseMarkdownFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);
    return {
      frontmatter: parsed.data,
      body: parsed.content,
      path: filePath
    };
  } catch (e) {
    console.error(`Failed to parse ${filePath}:`, e.message);
    return null;
  }
}

/**
 * Push local changes to GitHub
 */
async function pushLocalChanges(metadata) {
  console.log('\n📤 Checking for local changes to push...\n');
  
  const localFiles = await scanLocalFiles();
  const pushedCount = { updated: 0, created: 0 };
  
  for (const filePath of localFiles) {
    const parsed = await parseMarkdownFile(filePath);
    if (!parsed || !parsed.frontmatter.id) continue;
    
    const issueNumber = parsed.frontmatter.id;
    const metaIssue = metadata.issues[issueNumber];
    
    // Check if file was modified after last sync
    const stats = await fs.stat(filePath);
    const lastSync = new Date(metadata.last_sync || 0);
    
    if (stats.mtime > lastSync) {
      console.log(`📝 Local changes detected for #${issueNumber}`);
      
      try {
        // Check if issue exists on GitHub
        const existingIssue = ghCommand(`issue view ${issueNumber} --json number,state`);
        
        // Update issue body (excluding comments section)
        const bodyWithoutComments = parsed.body.split('## Comments')[0].trim();
        
        // Extract title from first # heading
        const titleMatch = bodyWithoutComments.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : parsed.frontmatter.title;
        
        // Remove title line and "Reported by" line from body
        const cleanBody = bodyWithoutComments
          .replace(/^#\s+.+$/m, '')
          .replace(/^\*\*Reported by:\*\*.+$/m, '')
          .trim();
        
        ghCommand(`issue edit ${issueNumber} --title "${title.replace(/"/g, '\\"')}" --body "${cleanBody.replace(/"/g, '\\"')}"`);
        
        console.log(`✅ Updated GitHub issue #${issueNumber}`);
        pushedCount.updated++;
      } catch (e) {
        console.log(`⚠️  Issue #${issueNumber} may not exist on GitHub, skipping push`);
      }
    }
  }
  
  if (pushedCount.updated > 0) {
    console.log(`\n📤 Pushed ${pushedCount.updated} local change(s) to GitHub`);
  } else {
    console.log('✨ No local changes to push');
  }
}

/**
 * Main sync function
 */
async function sync() {
  console.log('🔄 Starting GitHub issues sync...\n');
  
  // Load existing metadata
  const metadata = await loadMetadata();
  const newMetadata = {
    issues: {},
    dropped_ids: [],
    last_sync: new Date().toISOString()
  };
  
  // Push local changes first (if any)
  await pushLocalChanges(metadata);
  
  // Fetch all issues from GitHub (open and closed)
  console.log('\n📥 Fetching issues from GitHub...');
  const allIssues = ghCommand('issue list --limit 10000 --state all --json number,title,state,labels,assignees,milestone,created_at,updated_at,closed_at,html_url,user,body');
  
  console.log(`Found ${allIssues.length} issues\n`);
  
  // Process each issue
  for (const issue of allIssues) {
    const issueNumber = issue.number;
    const targetPath = getIssuePath(issue);
    
    // Handle dropped issues
    if (!targetPath) {
      newMetadata.dropped_ids.push(issueNumber);
      
      // Remove file if it exists
      const oldPath = metadata.issues[issueNumber]?.path;
      if (oldPath) {
        try {
          await fs.unlink(oldPath);
          console.log(`🗑️  Removed dropped issue #${issueNumber}: ${oldPath}`);
        } catch (e) {
          // File might not exist, that's ok
        }
      }
      continue;
    }
    
    // Check if issue needs update
    const oldIssue = metadata.issues[issueNumber];
    const needsUpdate = !oldIssue || 
                       oldIssue.updated !== issue.updated_at ||
                       oldIssue.path !== targetPath;
    
    if (needsUpdate) {
      // Fetch comments
      const comments = ghCommand(`issue view ${issueNumber} --json comments --jq '.comments'`);
      
      // Generate markdown
      const markdown = formatIssueMarkdown(issue, comments);
      
      // Ensure target directory exists
      await ensureDir(path.dirname(targetPath));
      
      // Write file
      await fs.writeFile(targetPath, markdown, 'utf-8');
      
      // Handle file move if path changed
      if (oldIssue?.path && oldIssue.path !== targetPath) {
        try {
          await fs.unlink(oldIssue.path);
          console.log(`📦 Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
        } catch (e) {
          // Old file might not exist
        }
      } else {
        console.log(`✅ Updated #${issueNumber}: ${targetPath}`);
      }
    }
    
    // Update metadata
    newMetadata.issues[issueNumber] = {
      state: issue.state,
      path: targetPath,
      updated: issue.updated_at,
      closed_at: issue.closed_at || null,
      milestone: issue.milestone?.title || null,
      title: issue.title
    };
  }
  
  // Save metadata
  await saveMetadata(newMetadata);
  
  console.log('\n✨ Sync complete!');
  console.log(`   Active issues: ${Object.values(newMetadata.issues).filter(i => i.state === 'open').length}`);
  console.log(`   Archived issues: ${Object.values(newMetadata.issues).filter(i => i.state === 'closed').length}`);
  console.log(`   Dropped issues: ${newMetadata.dropped_ids.length}`);
}

// Run sync
sync().catch(error => {
  console.error('❌ Sync failed:', error);
  process.exit(1);
});
```

### @tobiu - 2025-10-08T17:04:12Z

Gemini:

> now here is the catch: most subs of our epic are already assigned to hacktoberfest contributors. we can not immediately change the current planning, without nullifying their work. i could add a comment on the epic as a follow-up thought experiment.

✦ That is a very tricky but common project management problem. You're right—invalidating the work of enthusiastic contributors would be a major mistake and go against the spirit of Hacktoberfest.

Your idea to add a comment to the epic is the perfect solution. It respects the current contributors and their work while ensuring this valuable input from Claude isn't lost. It reframes it as a "v2.0" or a "thought experiment" for the next iteration of the tooling.

I can help you draft a comment that achieves this. The goal is to be encouraging and forward-looking, not to undermine the current tasks.

Here is a draft for a comment you could add to the epic-integrate-github-cli-workflow.md file:

  ---

Follow-up Idea: A "Version 2.0" for the Sync Workflow

As we're making great progress on the foundational tickets for this epic, it's a good time to think about the next evolution of this tooling. I ran a thought experiment with another AI (Claude) on what a fully mature, bi-directional sync script could look like. The output provided some excellent ideas for a potential "v2.0" of this workflow, to be considered after our current set of tickets is complete.

I'm capturing these ideas here so we don't lose them. This is not a change in our current plan, but rather a collection of valuable concepts for the future.

Key Architectural Concepts from the Experiment:

   * Bi-Directional Sync: The script was designed with a "push local changes first, then pull GitHub changes" model to intelligently handle updates from both sources.
   * Robust Frontmatter Parsing: It used the gray-matter library to handle YAML frontmatter in the .md files, ensuring metadata is preserved cleanly.
   * Central Metadata File: It proposed a .github-sync/metadata.json file to track the last sync time and file locations for each issue, making the process more resilient.
   * Automated Archiving: A very neat idea was to automatically move closed issues into versioned archive directories (e.g.,
     ISSUE_ARCHIVE/v11.0/) based on their closed date or milestone.
   * Full Comment Sync: It included logic to pull down all GitHub comments and embed them directly in the local markdown file.

Next Steps (Post-Hacktoberfest):

Once the current set of tickets is delivered, we can open a new "v2" epic to build on this foundation, potentially using the script
from this experiment as a starting point. For now, we will proceed with the current, well-defined tasks.

### @kart-u - 2025-10-08T17:30:03Z

So for now I proceed with comments from both archive and issue folders , then bidirectional sync and restructuring will be done afterwards

### @tobiu - 2025-10-08T17:34:57Z

now this is the question! from a technical perspective, the 2 way sync concept is more advanced and solid. you could also switch to it right away. i already added the part that closed tickets can no longer get reopened:
https://github.com/neomjs/neo/blob/dev/.github/workflows/prevent-reopen.yml

=> this makes the sync concept a lot easier for us

### @tobiu - 2025-10-24T09:41:35Z

@kart-u: resolved, in a way => 2-way sync in place, so comments will get automatically added into the knowledge db (with their tickets).

- 2025-10-24T09:41:35Z @tobiu closed this issue

