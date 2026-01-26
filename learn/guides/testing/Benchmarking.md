# Benchmarking and Performance Testing

> **Note:** The official Neo.mjs benchmarking suite and harness are maintained in a separate repository: [neomjs/benchmarks](https://github.com/neomjs/benchmarks).

## Philosophy: Measuring Resilience

Most web benchmarks (like Lighthouse or Core Web Vitals) focus on the "First Impression"—how fast a page loads. Neo.mjs, being an application engine for complex enterprise tools, focuses on the "Lived-In" experience.

Our benchmarking philosophy is not about "Page Load" time. It is about **Resilience**:
*   Can the UI handle 1,000 updates per second without freezing?
*   Can a grid ingest 100,000 rows while the user is scrolling?
*   Does the application remain responsive (60 FPS) during heavy background calculations?

## The Challenges of Benchmarking

Building a reliable benchmark for multi-threaded applications required solving three specific problems that standard test runners (like Playwright out-of-the-box) do not address.

### 1. The Parallelism Trap
**Problem:** Standard test runners execute tests in parallel to save time. This is disastrous for benchmarking because tests compete for CPU resources, causing massive variance in results (up to 50%).
**Solution:** Our harness enforces **Serial Execution** (`--workers=1`). Every test gets the full, undivided attention of the CPU.

### 2. The Latency Chasm
**Problem:** Sending commands from Node.js (Test Runner) to the Browser introduces unpredictable network/process latency (The "Observer Effect").
**Solution:** We use **Atomic Measurement**. The entire test sequence (Action -> Wait -> Measure) is injected into the browser via `page.evaluate()`. The measurement happens entirely within the browser's high-precision context, returning only the final result to Node.js.

### 3. The Polling Fallacy
**Problem:** Standard `waitFor()` functions use polling (checking every ~30ms). You cannot measure a 20ms event with a 30ms ruler.
**Solution:** We reject polling in favor of **MutationObservers**. Our harness attaches a listener that checks the pass condition *synchronously* on every single DOM mutation, allowing us to stop the timer with microsecond precision.

## Running the Benchmarks

To run the benchmarks, you must clone the separate repository:

```bash
git clone https://github.com/neomjs/benchmarks.git
cd benchmarks
npm install
npm run test
```

**Why a separate repository?**
The benchmarking suite provides direct, apples-to-apples comparisons between **Neo.mjs**, **React**, **Angular**, and **AG Grid**. To ensure a fair comparison, we include the full production build environments for these frameworks. Keeping the benchmarks separate ensures that the core `neomjs/neo` repository remains lightweight and free of these heavy third-party dependencies.

For detailed instructions on reproducing results and understanding the methodology, please refer to the documentation within that repository.
