# The Orchestrator (CLI & Pipeline)

The DevIndex Data Factory is essentially a collection of specialized micro-services (Spider, Updater, Storage, etc.). To coordinate these services into a cohesive, automated workflow, the system relies on the **Orchestrator** layer.

This layer is comprised of three distinct parts:
1.  **The Entry Point:** `apps/devindex/services/cli.mjs`
2.  **The Command Router:** [`DevIndex.services.Manager`](https://github.com/neomjs/neo/blob/dev/apps/devindex/services/Manager.mjs)
3.  **The Automated Pipeline:** `.github/workflows/devindex-pipeline.yml`

---

## The Entry Point (`cli.mjs`)

The entry point for the backend services is incredibly minimal, leaning entirely on the native Neo.mjs component lifecycle.

```javascript readonly
import Manager from './Manager.mjs';

async function start() {
    await Manager.ready();
}

start().catch(console.error);
```

Because `Manager` is a Neo.mjs singleton (`Neo.setupClass(Manager)`), simply importing the module triggers its instantiation. The `start()` function then simply awaits the native `Manager.ready()` promise, which resolves when the Manager's asynchronous initialization—including executing the requested CLI command—is complete.

---

## The Command Router (`Manager.mjs`)

The `Manager` service uses the `commander` library to parse command-line arguments and `inquirer` to provide interactive prompts for a robust Developer Experience (DX).

Its primary responsibility is mapping high-level commands to specific service executions.

### Available Commands
*   `update`: Triggers the **Updater** to process a batch of pending users.
*   `add [username]`: Manually adds or forces an update for a specific user.
*   `spider`: Triggers the **Spider** to discover new candidates. Offers interactive strategy selection if run without flags.
*   `cleanup`: Manually triggers the **Data Hygiene** routine.
*   `optin` / `optout`: Processes issue-based and star-based privacy requests.

### The "Pre-Run Cleanup" Pattern
A critical architectural pattern enforced by the Manager is the "Pre-Run Cleanup". Before executing any command that reads or modifies the index (like `spider` or `update`), the Manager automatically triggers `Cleanup.run()`.

```javascript readonly
program
    .command('update')
    .action(async (options) => {
        await Cleanup.run(); // Pre-run hygiene
        await this.runUpdate(options.limit);
    });
```
This guarantees that the services always operate on valid, sorted, and pruned data, preventing dirty data from polluting the discovery or enrichment processes.

### Smart Scheduling
When the `update` command is run, the Manager doesn't just blindly pass the whole queue to the Updater. It implements a smart scheduling algorithm:
1.  It filters out any user who has already been successfully updated *today* (based on the `lastUpdate` timestamp).
2.  It sorts the remaining backlog, prioritizing completely new users (`lastUpdate: null`) and the oldest records first.
3.  It slices the queue to the requested batch limit to respect API quotas.

---

## The Automated Pipeline (GitHub Actions)

While a developer can run commands manually via the CLI, the DevIndex is designed to be fully autonomous. The ultimate orchestrator is the GitHub Actions workflow defined in `.github/workflows/devindex-pipeline.yml`.

This workflow runs on an **hourly schedule** and strings the individual services together into a single, atomic "Data Factory" assembly line:

```yaml readonly
jobs:
  run-pipeline:
    steps:
      # 1. Process Privacy Requests First
      - name: Run DevIndex Opt-In
        run: npm run devindex:optin
        
      - name: Run DevIndex Opt-Out
        run: npm run devindex:optout

      # 2. Aggressive Discovery (3x Loop)
      - name: Run DevIndex Spider
        run: |
          for i in 1 2 3; do
            npm run devindex:spider -- --strategy random
          done

      # 3. Enrichment & Processing
      - name: Run DevIndex Updater
        run: npm run devindex:update -- --limit=800

      # 4. Atomic Persistence
      - name: Commit, Rebase and Push
        run: |
          git add apps/devindex/resources/*.json*
          git commit -m "chore(devindex): Hourly pipeline update [skip ci]"
          git pull origin dev --rebase
          git push origin dev
```

### Key Pipeline Concepts:

1.  **Privacy-First Execution:** The `optin` and `optout` services run *before* any discovery or enrichment. This ensures we never accidentally index a user who requested removal in the same hour.
2.  **The 3x Spider Loop:** Because the Spider uses a random-walk algorithm, running it multiple times consecutively (before the Updater) significantly broadens the discovery net while utilizing very little API quota.
3.  **Atomic Commits:** Rather than each service committing its own changes independently (which would cause massive Git conflicts), the services modify the local JSON files on the runner. Only at the very end of the hourly pipeline are all changes bundled into a single, atomic commit containing the fully processed data. The `[skip ci]` flag prevents infinite loops.