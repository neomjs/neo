---
title: DevIndex Methodology
---

# DevIndex Methodology

> **Legal Disclaimer:** DevIndex is an independent, MIT-licensed open-source project created by the Neo.mjs team. It is **not officially affiliated with, endorsed by, or associated with GitHub, Inc.** in any way. The project serves as a high-performance technological showcase for the Neo.mjs application engine (demonstrating world-class buffered data grids streaming up to 50,000 records) and utilizes publicly available data provided by the GitHub API. We respect user privacy, utilize no tracking cookies, and run no advertisements.

## Project Motivation & The "Invisibility" Problem

The genesis of DevIndex stemmed from a simple frustration. Our creator, with over 30,000 GitHub contributions, wanted to understand how that volume compared to other active developers in the ecosystem. 

A search revealed that the available tools were severely lacking. The few existing "Top GitHub Users" lists can be highly localized or niche, but universally, they are all severely inaccurate—often entirely missing developers with tens or hundreds of thousands of contributions. Even when querying advanced Large Language Models (LLMs) like ChatGPT or Claude for a "Top 20" list, the results were hallucinated or based on severely outdated and incomplete data (e.g., listing developers with 4k contributions in the Top 20, while the actual top 100 all have over 105,000 contributions).

This highlighted a major "Invisibility Problem" in the Open Source ecosystem.

As we enter the **AI Era**, understanding and recognizing human contribution to open-source software becomes even more critical. Furthermore, with initiatives in regions like Europe aiming to provide structured funding for Free and Open Source Software (FOSS), there is a pressing need for accurate data. Currently, it is almost impossible for organizations to answer a simple question: *"Who are the most active open-source developers in our country?"*

DevIndex was built to solve this problem.

## Technical Feasibility & The GitHub API Challenge

The primary reason accurate lists don't exist is a technical limitation of the GitHub API. 
With over 180 million users on GitHub, attempting to index everyone is computationally prohibitive. Furthermore, GitHub stores contribution data strictly per year; there is no single API endpoint to retrieve a user's "Lifetime Total Contributions."

To overcome this, we built a highly specialized backend architecture:
- **The Spider (Discovery Engine):** Uses a multi-strategy algorithm (including random graph walks and heuristic slicing) to discover highly active developers who might otherwise remain hidden.
- **The Updater (Enrichment Engine):** Queries the GraphQL API to meticulously aggregate year-by-year contribution graphs for every discovered user, calculating their true lifetime metrics.

### The Engineering Investment
Building an index of this scale and overcoming the severe limitations of public API data is an immense challenge. To reach the current state of DevIndex, our core engineering team created and resolved over **350 dedicated GitHub tickets**. This represents a massive Research & Development investment spanning complex data pipelining, heuristics analysis, graph crawling algorithms, and UI performance tuning.

### Accuracy and The Need for Participation
It is crucial to understand that while our data is vastly more accurate than existing lists, **it is still an approximation and will have gaps.** Because the Spider relies on graph traversal and heuristics rather than a full database dump, it is statistically probable that we are still missing highly prolific contributors—perhaps even the true #1 contributor globally.

The longer our Spider runs, the more accurate the index becomes. However, the true success of the DevIndex relies on active participation. This is why we have implemented explicit **Opt-In** features alongside our Opt-Out mechanisms. If you or a developer you know has a high contribution count but isn't listed, we encourage you to manually submit the profile for indexing.

### Data Science Use Cases
This aggregated, clean dataset opens up entirely new avenues for data science within the open-source ecosystem:
- **Trend Analysis:** Tracking the rise and fall of specific technologies or frameworks based on the activity of top contributors.
- **Ecosystem Health:** Measuring the sustainability of open-source communities by analyzing contribution distribution (e.g., identifying "bus factor" risks across top repositories).
- **AI Impact:** Studying the shifting contribution patterns as AI agents and LLMs become more prevalent in the development lifecycle.

Because a client-side web application cannot practically download 180 million records, we enforce a strict **Meritocracy Filter** with a hard cap at the top 50,000 most active developers. The rationale is purely network-based: at 50,000 users, our raw JSONL data file reaches ~20MB (around 8MB gzipped). While the Neo.mjs UI engine itself can effortlessly render significantly more records without performance degradation, forcing casual visitors to download larger payloads would be unreasonable. 

To mitigate load times, the data is **streamed** to the client. The application becomes fully functional with the initially loaded subset of data, and users can stop the ongoing data stream at any given moment. Once the 50k cap is reached, the entry threshold dynamically rises, ensuring only the most prolific contributors remain in the index.

## Rich Data & Inclusivity

DevIndex goes far beyond simple contribution counts. We provide extremely rich data to help connect developers with opportunities:
- **Funding & Sponsorship:** If a developer has a GitHub Sponsors account, we provide a direct link to sponsor them.
- **Hiring & Talent Scouting:** We index the "Is Hireable" flag (even though it's less prominent on GitHub now). Talent scouts can use our platform to instantly filter the world's top contributors by country and hireable status.

We aim to be a "home" for developers worldwide, as well as AI agents and LLMs that actively contribute to the ecosystem. We are radically inclusive: the only GitHub accounts we actively filter out are those strictly flagged as "automation bots," alongside developers who have explicitly requested to opt out.

## Scoring

Scoring is based on an aggregate of GitHub's core public contribution metrics over the lifetime of the account:
1.  **Commits** (Primary metric)
2.  **Pull Requests** (Code, Review)
3.  **Issues** (Reporting, Discussion)
4.  **Code Reviews**

For detailed information on how to permanently remove your profile from the index, please read our [Privacy & Opt-Out Guide](./OptOut.md).