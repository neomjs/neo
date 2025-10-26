---
id: 7656
title: Auto-start ChromaDB on MCP Server Startup - Implementation Summary
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T22:09:55Z'
updatedAt: '2025-10-25T22:21:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7656'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T22:21:03Z'
---
# Auto-start ChromaDB on MCP Server Startup - Implementation Summary

**Reported by:** @tobiu on 2025-10-25

## Servers Affected
- `ai/mcp/server/memory-core/`
- `ai/mcp/server/knowledge-base/`

## Changes Implemented

### 1. ChromaManager.mjs (both servers)
- **Changed `connect()` to return boolean instead of throwing**
  ```javascript
  async connect() {
      try {
          await this.client.heartbeat();
          this.connected = true;
          return true;
      } catch (e) {
          this.connected = false;
          logger.debug('[ChromaManager] ChromaDB not accessible:', e.message);
          return false;  // Don't throw - graceful degradation
      }
  }
  ```

### 2. DatabaseLifecycleService.mjs (both servers)
- **Added `initAsync()` method for auto-start**
  ```javascript
  async initAsync() {
      await super.initAsync();
      await ChromaManager.ready();     // Initialize ChromaManager
      await this.startDatabase();      // Auto-start ChromaDB if needed
  }
  ```
- Auto-start respects existing ChromaDB instances (service-managed or external)
- No changes needed to `startDatabase()` - already handles all scenarios

### 3. SessionService.mjs (memory-core only)
- **Removed duplicate ChromaDB client** - now uses `ChromaManager` singleton
- **Removed `dbClient` property** from `construct()`
- **Added dependency wait** in `initAsync()`:
  ```javascript
  async initAsync() {
      await super.initAsync();
      await DatabaseLifecycleService.ready();  // Ensure ChromaDB available
      
      // Use ChromaManager instead of direct client
      this.memoryCollection   = await ChromaManager.getMemoryCollection();
      this.sessionsCollection = await ChromaManager.getSummaryCollection();
  }
  ```

### 4. mcp-stdio.mjs (both servers)
- **Changed startup sequence**:
  ```javascript
  // Before
  await ChromaManager.ready();
  
  // After
  await DatabaseLifecycleService.ready();  // Auto-starts ChromaDB
  ```
- Removed race condition workaround comment (no longer needed)

### 5. config.mjs
**knowledge-base:**
- **Fixed ChromaDB data path**:
  ```javascript
  // Before
  path: path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl'),  // ❌ Wrong - JSONL file
  
  // After
  path: path.resolve(process.cwd(), 'chroma'),  // ✅ ChromaDB data directory
  dataPath: path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl'),  // ✅ JSONL path renamed
  ```
- Set `debug: true` (temporary, will be reverted)

**memory-core:**
- Cleaned up path: `'./chroma-memory'` → `'chroma-memory'` (removed unnecessary `./`)
- Set `debug: true` (temporary, will be reverted)

### 6. logger.mjs (all 3 servers)
- **Added `logger.log` method** to github-workflow, knowledge-base, and memory-core:
  ```javascript
  logger.log = createLogMethod('log');
  ```

### 7. DatabaseService.mjs (knowledge-base only)
- **Updated to use new config property**:
  ```javascript
  // In createKnowledgeBase() and embedKnowledgeBase()
  const outputPath = aiConfig.dataPath;  // Was: aiConfig.path
  ```

### 8. DatabaseLifecycleService.mjs (memory-core only)
- **Added debug logging**:
  ```javascript
  logger.error('Starting ChromaDB (Memory Core) process...');
  ```
- **Removed Observable import** (now imported globally in mcp-stdio.mjs)

### 9. mcp-stdio.mjs (memory-core only)
- **Added Observable import at top level**:
  ```javascript
  import Observable from '../../../../src/core/Observable.mjs';
  ```
  This ensures the Observable mixin is loaded globally, so services using `static observable = true` don't need to import it individually
- **Updated comment**: Removed "fixes race condition" since initialization order is now explicit

## Benefits Achieved
- ✅ ChromaDB automatically starts on server initialization
- ✅ Respects external/existing ChromaDB instances (no duplicates)
- ✅ Services properly wait for dependencies via `.ready()` pattern
- ✅ Single source of truth for ChromaDB access (ChromaManager)
- ✅ Graceful degradation preserved (server starts even if auto-start fails)
- ✅ Fixed config bug in knowledge-base (wrong path type)

## Verification
Both servers now start successfully without manual ChromaDB startup:
- **memory-core**: Port 8001, 205 memories, 16 summaries, auto-summarization works
- **knowledge-base**: Port 8000, 0 documents (empty but healthy)

## Comments

### @tobiu - 2025-10-25 22:21

<img width="1045" height="608" alt="Image" src="https://github.com/user-attachments/assets/3e221f98-843f-4ba1-8ae2-c813ea50eab8" />

