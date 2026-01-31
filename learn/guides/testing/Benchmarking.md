# Benchmarking and Performance Testing

> **Note:** The official Neo.mjs benchmarking suite and harness are maintained in a separate repository: [neomjs/benchmarks](https://github.com/neomjs/benchmarks).

## Philosophy: Runtime vs. Load Time

> "The industry is obsessed with the First Impression. We are obsessed with the Relationship."

In 2026, almost every frontend benchmark (Lighthouse, Core Web Vitals, Vercel Speed Insights) focuses entirely on **Initial Page Load**. They measure the "Sprint": How fast can you paint the first pixel? How fast until the button is clickable?

For an e-commerce site or a blog, this is correct. The user stays for seconds.

**But for Enterprise Applications, this is the wrong metric.**
Users of complex tools (Data Analytics, Trading Platforms, CRMs) don't open the app to look at it for 5 seconds. They log in at 9:00 AM and work for 8 hours. The initial load happens *once*. The interactions happen *thousands* of times.

### The "Lived-In" Experience
Our benchmarking philosophy ignores Page Load time to focus exclusively on **Runtime Resilience**—the "Marathon".

*   **Lighthouse asks:** "How fast does the page load on a slow 3G network?"
*   **We ask:** "Can the grid handle 1,000 updates per second without freezing the UI?"
*   **Lighthouse asks:** "What is the Largest Contentful Paint?"
*   **We ask:** "Does the application drop frames when a user scrolls through 100,000 rows?"

Neo.mjs is designed for the long haul. Our benchmarks prove that even after hours of heavy usage, thousands of DOM additions, and massive data ingestion, the application remains smooth (60 FPS) and responsive. We measure the metrics that actually matter to the power user: **Stability, Concurrency, and Fluidity.**

## Generated Reports

The benchmarking suite automatically generates detailed Markdown reports comparing performance across frameworks (Neo.mjs, React, Angular) and scenarios.

| Report File | Description |
| :--- | :--- |
| `BENCHMARK_RESULTS_NEO.md` | Core benchmarks for Neo.mjs (Create Rows, Swap, Clear, etc.) |
| `BENCHMARK_RESULTS_REACT.md` | Comparative benchmarks for React. |
| `BENCHMARK_RESULTS_ANGULAR.md` | Comparative benchmarks for Angular. |
| `COMBINED_BENCHMARK_REPORT.md` | **The Main Report.** Side-by-side comparison of all frameworks. |
| `BENCHMARK_RESULTS_NEO_BIG_DATA.md` | Specific performance metrics for the Neo.mjs Big Data app (100k+ rows). |
| `BENCHMARK_RESULTS_REACT_BIG_DATA.md` | Specific performance metrics for the React Big Data app. |
| `COMBINED_BIG_DATA_REPORT.md` | Side-by-side comparison of the Big Data scenario. |

## Architecture & Methodology

To accurately measure high-performance applications, we had to solve three specific problems that standard test runners do not address.

### 1. The Controller (Node.js)
**Problem:** Running tests in parallel (the default for Playwright/Jest) creates CPU contention, causing massive variance in performance results (up to 50%).
**Solution:** We use a custom Node.js controller (`scripts/run-benchmarks.mjs`) that enforces **Serial Execution**.
*   It runs benchmarks one by one.
*   It kills any competing processes on the target ports (8080, 5174, 4200) before starting.
*   It executes the full suite multiple times (default: 5) and statistically aggregates the results.

### 2. The Runner (Playwright)
**Problem:** We need a reliable way to automate browser interactions across different engines (Chromium, Firefox, WebKit).
**Solution:** We use Playwright to drive the browser, but **not** to measure the performance directly. Playwright acts merely as the "user" that clicks buttons.

### 3. The Probe (In-Browser MutationObserver)
**The "Polling Problem":** Standard Playwright/Selenium assertions use "polling" to check if an element exists. They check the DOM, wait ~30-100ms, and check again.
*   **Result:** You cannot measure a 20ms operation with a 100ms ruler. Your benchmarks will be wildly inaccurate.

**The Solution: Synchronous Observation**
We utilize the `measurePerformanceInBrowser` helper (found in `tests/utils/browser-test-helpers.mjs`).
1.  **Injection:** We inject the measurement code directly into the browser window.
2.  **MutationObserver:** We verify the completion condition (e.g., "Row 1000 exists") inside a `MutationObserver` callback. This callback fires **synchronously** the microsecond the DOM updates.
3.  **Zero Latency:** Because the timer start, the action, and the timer stop all happen inside the browser's JavaScript thread, there is **zero network latency** (The "Observer Effect") from the Node.js test runner.

## Case Study: The Big Data Benchmark

The "Big Data" benchmark (`apps/bigData`) is our stress test. It simulates a heavy enterprise application with massive datasets.

### The App Structure
*   **`MainStore.mjs`**: Contains the logic to generate synthetic data (thousands of objects with random names/numbers).
*   **`GridContainer.mjs`**: A high-performance grid component that renders this data.
*   **`ControlsContainer.mjs`**: UI to trigger changes (e.g., "Set rows to 100,000").

### The Measurement Strategy (Total vs. UI Update)
In a multi-threaded framework like Neo.mjs, "Total Time" can be misleading. Generating 100,000 records takes time (CPU), but the UI should remain responsive.

The Big Data tests (`tests/neo-big-data.spec.mjs`) use a sophisticated dual-measurement approach:

1.  **Total Duration:** Time from clicking the combobox -> Final Grid Update.
2.  **UI Update Duration:** Time from "Worker Finished Generation" -> Final Grid Update.

**How it works:**
The test waits for a specific `console.log` message from the Worker ("Data creation total time") to mark the split-point. This allows us to prove that even if data generation takes 500ms, the **Main Thread UI update** might only take 50ms, resulting in a non-blocking user experience.

```javascript
// Simplified logic from tests/neo-big-data.spec.mjs
const [total, ui] = await Promise.all([
    // 1. Measure Total Time
    page.evaluate(() => window.measurePerformance('total', action, condition)),
    
    // 2. Measure UI Update (starts waiting immediately)
    page.evaluate(() => window.measureUiUpdatePerformance('ui-only', condition))
]);
```

## Setup & Installation

To run the benchmarks, you must clone the benchmarks repository.

```bash
git clone https://github.com/neomjs/benchmarks.git
cd benchmarks
npm install
```

### Building for Production
For accurate "Prod Mode" results, you must build the benchmark applications.

```bash
# Build the Neo.mjs benchmark app
npm run build:benchmark-app
```

## Running Benchmarks

Running the full suite of benchmarks for all frameworks and all scenarios can take a significant amount of time. We provide specific entry points so you can focus only on what you are currently working on.

### 1. Quick Runs (Development & Debugging)
Use these scripts when you are writing tests, fixing bugs, or ensuring the app starts correctly. These runs are **not** statistically significant (single run) and are intended for functional verification.

```bash
# General
npm run test:all                  # Run EVERYTHING (Slow!)

# Neo.mjs
npm run test:neo                  # Run basic Neo duration benchmarks
npm run test:neo-scrolling        # Run scrolling fluidity tests
npm run test:neo-big-data         # Run the Big Data (100k rows) suite

# React
npm run test:react                # Run basic React duration benchmarks
npm run test:react-scrolling      # Run scrolling fluidity tests
npm run test:react-big-data       # Run the Big Data suite

# Angular
npm run test:angular              # Run basic Angular duration benchmarks
npm run test:angular-scrolling    # Run scrolling fluidity tests
```

### 2. Accurate Benchmarks (Data Collection)
Use these scripts when you need **reliable performance data**. These scripts utilize the custom Node.js controller to:
1.  Run the tests multiple times (default: 5).
2.  Enforce serial execution (no CPU contention).
3.  Save the raw JSON results for report generation.

```bash
# Run ALL Accurate Benchmarks (Very Slow - Lunch Break Material)
npm run benchmark:accurate:all

# Targeted Framework Runs
npm run benchmark:accurate:neo    # All Neo suites (Duration + Scrolling + Big Data)
npm run benchmark:accurate:react  # All React suites
npm run benchmark:accurate:angular # All Angular suites

# Specific Suite Runs (Recommended for Focus)
npm run benchmark:accurate:neo-scrolling
npm run benchmark:accurate:neo-big-data
npm run benchmark:accurate:react-big-data
```

**Customizing the Run:**
You can pass flags to the runner for even more granular control:
```bash
# Run 10 times for statistical significance
node ./scripts/run-benchmarks.mjs --framework=neo --runs=10

# Run a specific suite
node ./scripts/run-benchmarks.mjs --framework=neo --suite=big-data
```

### 3. Report Generation
After running the "Accurate" scripts, use these to parse the JSON data and generate the Markdown tables.

```bash
# Framework Specific
npm run benchmark:generate-report:neo
npm run benchmark:generate-report:react
npm run benchmark:generate-report:angular

# Specialized Reports
npm run benchmark:generate-report:neo-big-data
npm run benchmark:generate-report:react-big-data

# Combined Comparison Reports (The "Final Result")
npm run benchmark:generate-report:combined          # Compare Neo vs React vs Angular
npm run benchmark:generate-report:big-data-combined # Compare Neo vs React (Big Data)
```

## Understanding the Reports

After running the accurate benchmarks, you generate a report using:

```bash
npm run benchmark:generate-report:neo
# or
npm run benchmark:generate-report:combined
```

This creates a Markdown file (e.g., `BENCHMARK_RESULTS_NEO.md`) containing:

### 1. Duration Benchmarks
Measures how long an operation takes to complete.
*   **Lower is better.**
*   **Dev vs Prod:** Shows the overhead of development tools (sourcemaps, non-minified code).
*   **Standard Deviation (±):** Indicates stability. High deviation means the operation is "jittery" or unstable.

### 2. UI Responsiveness (Jank)
Measures the frame rate during an operation (like a background calculation or a live feed).
*   **FPS:** Average Frames Per Second. Higher is better (Target: 60).
*   **Long Frames:** Count of frames that took >50ms to render. Lower is better (Target: 0).

### 3. Scrolling Fluidity
Measures the smoothness of the UI while scrolling through massive datasets (Virtual Lists).
*   **Time to Valid State:** How long the user sees a blank/loading row before the real content appears. Lower is better.

## Adding a New Benchmark

To add a new benchmark case:

1.  **Create a Test:** Add a new test case in `tests/neo.spec.mjs`.
2.  **Use the Helper:** Use `window.measurePerformance` inside `page.evaluate`.

```javascript
test('Neo.mjs benchmark: My New Feature', async ({page}) => {
    await page.goto('/apps/benchmarks/');
    
    // 1. Prepare the UI
    await page.getByRole('button', {name: 'Reset'}).click();

    // 2. Run the measurement inside the browser
    const duration = await page.evaluate(() => {
        const action = () => {
            // Trigger the event (e.g., click a button)
            window.getButtonByText('My Feature').click();
        };
        
        const condition = () => {
            // Return true EXACTLY when the DOM is finished
            return document.querySelector('.my-result-element') !== null;
        };
        
        // This handles the timing and MutationObserver automatically
        return window.measurePerformance('My Feature', action, condition);
    });

    // 3. Record the result
    test.info().annotations.push({type: 'duration', description: `${duration}`});
    console.log(`My Feature took: ${duration}ms`);
});
```
