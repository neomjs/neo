# Benchmarking Frontends in 2025

**Stop Measuring Page Loads. Start Measuring Resilience.**

## The Two Worlds of Web Performance

For the better part of a decade, the web performance community has rightfully focused on one critical goal: making the initial page load faster. Driven by tools like Google's Lighthouse and the Core Web Vitals (CWV) initiative, we've become experts at optimizing for the "first-impression" web. This is the world of e-commerce, marketing sites, and news articles, where success is measured in milliseconds of Largest Contentful Paint (LCP) and a low Interaction to Next Paint (INP). For this half of the web, these tools are essential and have made the user experience immeasurably better.

But another half of the web has been quietly evolving, operating under a completely different set of pressures. This is the "lived-in" web: the complex, data-intensive applications where users spend their entire workday. Think of real-time trading dashboards, enterprise SaaS platforms, and data science tools. Here, the initial load is a distant memory. True performance is defined by what happens hours into a session: Can the UI handle a stream of 1,000 real-time updates per second without stuttering? Can a data grid ingest and render 100,000 new rows without freezing? Does the entire application grind to a halt during a heavy background calculation?

[Intro Video on YouTube](https://youtu.be/VAaHVG5anh0)

> *A quick note on the authorial voice: You'll see "we" used throughout this article. This isn't a royal "we" or a corporate "we." It's a literal "we," representing the collaborative effort between a human engineer (me, Tobi) and dozens of iterative sessions with Gemini 2.5 Pro, which acted as a pair programmer, critic, and co-author in building this project and its narrative. This benchmark is as much a product of that unique human-AI partnership as it is of the code itself.*

## An Ecosystem Measuring Only Half the Story

The uncomfortable truth is that our benchmarking ecosystem is still primarily designed to measure the "first-impression" web.

Core Web Vitals are the gold standard, but their focus is, by definition, on the loading experience. LCP measures render speed, INP measures initial input delay, and CLS measures visual stability *as the page loads*. They are not designed to tell you if your application will suffer catastrophic jank ten minutes into a session under a heavy, concurrent load.

The `js-framework-benchmark` (often called "krausest") was a vital step in the right direction, moving the focus to interactivity like creating, swapping, and deleting rows. However, it was designed with two specific limitations that make it unsuitable for the "lived-in" applications we target.

First, **it explicitly forbids buffered rendering or virtualization.** The benchmark's goal is to measure how fast a framework can render *every single row* into the live DOM. This is a valid test for smaller datasets, but it's completely disconnected from how a real-world application must handle 100,000 rows or 20 million cells. It tests a scenario that is impossible at scale.

Second, **it tests operations in a sterile lab, in isolation.** It doesn't simulate the chaos of a real application where a user is scrolling *while* a background task is running *and* a WebSocket is pushing real-time updates. There is no concept of duress or concurrent stress.

This leaves developers of complex applications flying blind. We are building a generation of incredibly demanding, "lived-in" applications but are forced to measure them with tools designed for a simpler, "first-impression" world.

## The Need for a New Harness

This is the gap we set out to fill. We needed to build a new kind of benchmark from the ground up—one that could simulate real-world concurrency and measure an application's resilience under sustained duress.

To do this, we had to start from scratch. We needed a harness that could automate complex, multi-step interactions across all modern browsers and give us the low-level control to measure with scientific precision. That's why we chose Playwright as our foundation. But as we quickly learned, simply choosing a tool wasn't enough. We had to fundamentally rethink *how* to use it.

## Challenge 1: The Parallelism Trap

Our first instinct, and the default for most modern test runners, was to run our test suites in parallel to save time. Playwright is configured out-of-the-box to use one worker process per CPU core. For standard functional testing, this is a massive win. For performance benchmarking, it was a disaster.

The very purpose of a benchmark is to push a browser and framework to its limits, heavily stressing CPU cores. When we ran tests in parallel, we weren't giving each test a clean, idle core to run on. We were forcing multiple, already maxed-out browser instances to fight for the same overloaded CPU resources. The result was massive context switching and resource starvation, with performance numbers dropping by as much as 50% compared to running a single test. The data was useless.

**Lesson 1: For accurate performance benchmarking, serial execution is non-negotiable.** We immediately configured our test runner to use a single worker (`--workers=1`), ensuring that every test run gets the full, undivided attention of the machine. It takes longer, but the stability and reliability of the results are paramount.

## Challenge 2: The Latency Chasm and the Atomic Measurement

With our tests running serially, we still saw unacceptable noise in the data. The problem was the "observer effect" caused by the constant back-and-forth communication between the Playwright test runner (living in a Node.js process) and the browser page. Each command and response adds milliseconds of unpredictable latency, completely separate from the framework's actual performance.

Our solution was to make each measurement **atomic**. The entire test—triggering an action, waiting for a specific condition to be met, and measuring the duration—had to be executed in a single, uninterrupted block of code *inside the browser's context*. We use `page.addInitScript()` to inject our measurement helpers into the page, then wrap each test in a single `page.evaluate()` call. This gives us a portal into the browser's own thread, allowing us to run our entire measurement logic atomically. Only the final, high-precision number is returned to the Node.js process.

**Lesson 2: Eliminate test runner latency by performing all measurement logic atomically inside the browser.** This is the only way to be certain you are measuring the framework, not the harness.

## Challenge 3: The Polling Fallacy

Even with atomic, in-browser measurements, our results for very short-duration tasks were wildly inconsistent. We discovered the reason the hard way: Playwright's `waitFor` helpers, like most automation "wait" functions, use long-polling, checking the DOM only every 30ms or more to avoid pegging the CPU.

This is fine for functional testing, but for performance measurement, it's a fatal flaw. You cannot use a ruler with 30ms markings to accurately measure a 20ms event.

This realization forced us to throw out polling entirely and build our own high-precision waiting mechanism using the browser's native `MutationObserver`. Our `measurePerformanceInBrowser` function attaches an observer that checks our pass condition on *every single DOM mutation*. This allows us to stop the timer at the exact moment the UI reaches its desired state, giving us microsecond-level precision. It is the technical heart of our benchmark's credibility.

```javascript
// The core of our high-precision, in-browser measurement utility
export const measurePerformanceInBrowser = (testName, action, condition) => {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            // This condition check runs on every DOM change
            if (condition()) {
                const endTime = performance.now();
                observer.disconnect();
                clearTimeout(timeoutId);
                resolve(endTime - startTime);
            }
        });

        observer.observe(document.body, {attributes: true, childList: true, subtree: true});

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Benchmark timed out for "${testName}".`));
        }, 30000);

        // Start the timer right before triggering the action
        const startTime = performance.now();
        action();

        // Check condition immediately in case the action was synchronous
        if (condition()) {
            const endTime = performance.now();
            observer.disconnect();
            clearTimeout(timeoutId);
            resolve(endTime - startTime);
        }
    });
};
```

**Lesson 3: You can't trust polling-based "wait" functions for performance measurement.** For high-precision results, you must use a `MutationObserver` to react to DOM changes instantly.

## The Story Behind the Numbers: A Response to Skepticism

This project didn't start in a vacuum. It began as a direct response to the feedback from our Neo.mjs v10 blog series. In those articles, we made some extraordinary claims: that the "memoization tax" in frameworks like React is an unnecessary burden, that our architecture, leveraging a virtual DOM-like approach, enables efficient multi-threading, and that the "tyranny of the main thread" is the single biggest bottleneck in modern web applications.

The community's response was rightly skeptical: "I don't believe it's faster." "Where are the meaningful benchmarks?" "I don't believe off-main-thread architecture makes a real difference."

This skepticism is understandable. In a world of hype cycles, extraordinary claims require extraordinary evidence. This project was built to be that evidence. The detailed benchmark reports, including standard deviations for each metric, are available on our GitHub repository, allowing for further statistical analysis of the variability and significance of the results.

## What We Can Finally See Clearly: The Evidence

By building this high-precision harness, we can now move beyond architectural theory and into empirical proof. The results, aggregated from 5 independent test runs, are not just a leaderboard; they are the direct validation of our claims.

1.  **The Main-Thread Bottleneck is Real and Severe:** We claimed that forcing all application logic onto a single main thread was a recipe for UI jank. Our "Heavy Calculation" test proves it. When a heavy task runs on the main thread, frameworks like React and Angular see their UI frame rates plummet to 30 FPS or even 0 FPS, causing visible freezing. In contrast, the worker-based architecture of Neo.mjs maintains a perfect 60 FPS because the UI thread is never blocked. This benchmark quantifies the "tyranny of the main thread" in lost frames.

2.  **Extreme Loads Reveal Architectural Breaking Points:** We argued that the "memoization tax" (the performance overhead incurred by techniques like React.memo to prevent unnecessary re-renders) is a workaround, not a solution, for performance under pressure. Our "Scrolling Under Duress" test (1 million rows with a live data feed) shows what happens when those workarounds are overwhelmed. The React/TanStack Virtual implementation doesn't just get slow—it crashes the browser tab. The Angular app remains barely usable, with over a second of lag. The worker-based app, which eliminates the need for such manual optimizations at an architectural level, stays responsive. This is the ultimate cost of a bottlenecked main thread: not just jank, but catastrophic failure.

3.  **Best-in-Class Components Can't Escape the Architecture:** To prove our claims, our "Big Data Benchmark" pits a new Neo.mjs grid against the undisputed industry leader, AG Grid, running in React. We measured "UI Update Time"—the pure grid rendering performance—across several demanding scenarios. The results were not just a win; they were a confirmation of our architectural thesis.

### True Performance Analysis (UI Update Times Only)

#### 1. Large Column Operations (50→200 columns, 100k rows)

| Browser | Neo.mjs UI Time | React AG Grid UI Time | Neo.mjs Advantage |
| :--- | :--- | :--- | :--- |
| **Chromium** | 380-404ms | 2,962-3,071ms | **7.5x faster** |
| **Firefox** | 382-402ms | 4,328-4,460ms | **11x faster** |
| **Webkit** | 380-483ms | 5,256-5,500ms | **10.9x faster** |

**Architectural Implication**: Neo's off-main-thread rendering engine handles complex column layouts with dramatically less DOM manipulation overhead, resulting in an order-of-magnitude performance gain.

#### 2. Large Row Operations (1,000→100,000 rows)

| Browser | Neo.mjs UI Time | React AG Grid UI Time | Neo.mjs Advantage |
| :--- | :--- | :--- | :--- |
| **Chromium** | 150-225ms | 899-954ms | **~5x faster** |
| **Firefox** | 104-154ms | 1,431-1,484ms | **~10x faster** |
| **Webkit** | 115-165ms | 1,180-1,231ms | **~8x faster** |

**Critical Finding**: Neo.mjs maintains sub-200ms UI updates even with a 100x increase in row count, an update speed that feels instant to the user. In contrast, the main-thread architecture of React + AG Grid degrades to 1+ second updates, which is a significant and noticeable lag.

The data speaks for itself. AG Grid is the undisputed industry leader for feature-rich data grids, which makes these results even more significant. They provide powerful evidence of an architectural ceiling: even the most mature and heavily optimized component will eventually be bottlenecked by the single-threaded paradigm it operates in. The performance limitations are not a question of implementation detail, but of fundamental architectural constraints.

> *These results raise important questions about the relationship between architecture and performance at scale. If there's community interest, we plan to publish a detailed analysis exploring the architectural factors behind these performance differences and their implications for enterprise application development.*

## An MVP at a Crossroads

What you see today is the MVP of that effort—a robust foundation, built in a rapid, ten-day engineering sprint to ensure the results are precise, credible, and reproducible. But it is just the beginning of what's possible.

The potential for this project is immense:
-   **CI/CD Integration:** Imagine this suite running automatically in the cloud across diverse hardware configurations, providing a living, breathing dataset of framework performance.
-   **AI-Powered Reporting:** We could use LLMs to transform the raw data into insightful, narrative-driven reports, making the results accessible to a broader audience.
-   **Expanded Scope:** We could add more frameworks, more complex widgets (schedulers, Gantt charts), and entirely new metrics that push the boundaries of what we measure.
-   **Better Onboarding:** We could create detailed specifications for each test, making it far easier for framework experts to contribute high-quality, best-practice implementations.

This project is more than just a report; it's a high-precision instrument that we are opening up to the entire web development community. We especially invite framework authors and component library vendors to use this harness. See how your tools perform under the kind of concurrent stress that your most demanding users face every day. Use it to identify hidden bottlenecks and validate optimizations. The data this benchmark provides goes beyond simple metrics; it reveals the deep, real-world impact of architectural choices. Perhaps it will confirm your current approach, or perhaps it will inspire you to explore new ones.

> *Beyond framework authors, we see immense potential for enterprise decision-making. Imagine a consulting firm getting a client request: 'We need to handle 500,000 rows with real-time updates - which stack should we choose?' Today, that's answered with vendor marketing and gut instinct. Tomorrow, it could be answered with AI-generated reports that synthesize objective benchmark data into tailored architectural recommendations. The same precision we're bringing to measurement could revolutionize how teams make framework decisions.*

To better understand the idea of automated AI generated reports, here is an example of how Claude would do it:
[Neo vs React AG Grid - True Performance Analysis](https://claude.ai/public/artifacts/8b4bc869-e36b-4ba5-9b5b-5af99d45772b)

The path forward requires significant engagement, either through active community contributions or through corporate sponsorship. We believe this project has immense potential to benefit the broader web development community, and your active participation can accelerate its growth and expand its impact. We invite you to join us in shaping the future of frontend performance measurement.

So, the question we pose to the community is: is there an interest for more? If you believe in the need for a better, more honest way to benchmark the modern web, we invite you to get involved.

Beyond the automated test results, all benchmark applications are fully functional. We encourage you to run them locally in your browser of choice to manually verify and experience the performance differences firsthand. For an immediate demonstration, an almost identical version of the Neo.mjs Big Data grid is deployed here:

-   **Live Demo:** [Neo.mjs Big Data Grid](https://neomjs.com/dist/production/examples/grid/bigData/index.html)

The entire project, including all applications, test suites, and results, is publicly available on GitHub.

-   **Explore the code and results:** [https://github.com/neomjs/benchmarks](https://github.com/neomjs/benchmarks)
-   **Read our detailed methodology:** [METHODOLOGY.md](https://github.com/neomjs/benchmarks/METHODOLOGY.md)
-   **Run the benchmarks yourself:** [REPRODUCIBILITY.md](https://github.com/neomjs/benchmarks/REPRODUCIBILITY.md)

Best regards & happy coding,
Tobias
