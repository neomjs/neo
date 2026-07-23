# The Orchestrator (CLI & Pipeline)

The DevIndex Data Factory is essentially a collection of specialized micro-services (Spider, Updater, Storage, etc.). To coordinate these services into a cohesive, automated workflow, the system relies on the **Orchestrator** layer.

This layer is comprised of three distinct parts:
1.  **The Entry Point:** `apps/devindex/services/cli.mjs`
2.  **The Command Router:** [`DevIndex.services.Manager`](https://github.com/neomjs/neo/blob/dev/apps/devindex/services/Manager.mjs)
3.  **The Automated Pipeline:** `.github/workflows/data-sync-pipeline.yml`

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
3.  It slices the queue to the requested candidate limit. The Updater then applies GraphQL cost admission, so the limit remains a hard ceiling rather than a promise to process every candidate.

---

## The Automated Pipeline (GitHub Actions)

While a developer can run commands manually via the CLI, the DevIndex is designed to be fully autonomous. The ultimate orchestrator is the GitHub Actions workflow defined in `.github/workflows/data-sync-pipeline.yml`. The workflow delegates the mutation-sensitive part to `buildScripts/dataSyncPipeline.mjs`, keeping the bounded Git state machine executable and testable outside YAML.

This workflow runs on an **hourly schedule**, checks out the complete `dev` history, and invokes one bounded publisher:

```yaml readonly
jobs:
  run-pipeline:
    steps:
      - uses: actions/checkout@v6
        with:
          ref: dev
          fetch-depth: 0

      - name: Run bounded Data Sync emission and publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node ./buildScripts/dataSyncPipeline.mjs
```

For each emission attempt, the publisher installs dependencies and runs `optin`, `optout`, the random Spider strategy, the Updater, and the shared content-index/SEO rebuild in that order. The Updater's 200-candidate rollout ceiling is an upper bound; GraphQL budget admission may stop earlier. The pipeline may perform the complete sequence twice only when `dev` advances during the first attempt.

### Key Pipeline Concepts

1.  **Privacy-First Execution:** The `optin` and `optout` services run *before* discovery or enrichment. This ensures we never accidentally index a user who requested removal in the same hour.
2.  **Cost-Bounded Enrichment:** The 200-user argument is a rollout ceiling. The Updater admits fewer users when its shared GraphQL budget cannot preserve the downstream reserve.
3.  **Downstream Reservation:** DevIndex leaves declared GraphQL capacity for the label-index query in the following content-index and SEO rebuild.
4.  **Disposable Emission Attempts:** Each attempt captures its starting `dev` SHA. After the generators finish, the publisher fetches `origin/dev`. If authority moved, it discards the runner's derived output, resets to the new head, and reruns the complete emission once.
5.  **Bounded Freshness:** Freshness is checked after emission, after staging, and immediately before publication. A second concurrent advance resets the ephemeral checkout again and fails with the attempt plus base/current SHAs instead of entering an unbounded retry loop.
6.  **Atomic Allowlisted Commits:** Only DevIndex JSON/JSONL output, Portal data indexes, `sitemap.xml`, and `llms.txt` can enter the generated commit. The publisher never rebases, resolves derived-file conflicts, or force-pushes; the final non-force push therefore proves that its single commit is based on the verified current `dev` head.
