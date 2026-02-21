---
title: DevIndex Methodology
---

# DevIndex Methodology

## Project Motivation & The "Invisibility" Problem

The genesis of DevIndex stemmed from a simple frustration. Our creator, with over 30,000 GitHub contributions, wanted to understand how that volume compared to other active developers in the ecosystem. 

A search revealed that the available tools were severely lacking. The few existing "Top GitHub Users" lists were either highly localized, niche, or wildly inaccurate—often entirely missing developers with tens or hundreds of thousands of contributions. Even when querying advanced Large Language Models (LLMs) like ChatGPT or Claude for a "Top 20" list, the results were hallucinated or based on severely outdated and incomplete data (e.g., listing developers with 4k contributions in the Top 20, while the actual top 100 all have over 105,000 contributions).

This highlighted a major "Invisibility Problem" in the Open Source ecosystem.

As we enter the **AI Era**, understanding and recognizing human contribution to open-source software becomes even more critical. Furthermore, with initiatives in regions like Europe aiming to provide structured funding for Free and Open Source Software (FOSS), there is a pressing need for accurate data. Currently, it is almost impossible for organizations to answer a simple question: *"Who are the most active open-source developers in our country?"*

DevIndex was built to solve this problem.

## Technical Feasibility & The GitHub API Challenge

The primary reason accurate lists don't exist is a technical limitation of the GitHub API. 
With over 180 million users on GitHub, attempting to index everyone is computationally prohibitive. Furthermore, GitHub stores contribution data strictly per year; there is no single API endpoint to retrieve a user's "Lifetime Total Contributions."

To overcome this, we built a highly specialized backend architecture:
- **The Spider (Discovery Engine):** Uses a multi-strategy algorithm (including random graph walks and heuristic slicing) to discover highly active developers who might otherwise remain hidden.
- **The Updater (Enrichment Engine):** Queries the GraphQL API to meticulously aggregate year-by-year contribution graphs for every discovered user, calculating their true lifetime metrics.

Because a client-side web application cannot efficiently render 180 million records, we enforce a strict **Meritocracy Filter**. We cap our active database at the top 50,000 most active developers. Once the cap is reached, the entry threshold dynamically rises, ensuring only the most prolific contributors remain in the index.

## Rich Data & Inclusivity

DevIndex goes far beyond simple contribution counts. We provide extremely rich data to help connect developers with opportunities:
- **Funding & Sponsorship:** If a developer has a GitHub Sponsors account, we provide a direct link to sponsor them.
- **Hiring & Talent Scouting:** We index the "Is Hireable" flag (even though it's less prominent on GitHub now). Talent scouts can use our platform to instantly filter the world's top contributors by country and hireable status.

We aim to be a "home" for developers worldwide, as well as AI agents and LLMs that actively contribute to the ecosystem. We are radically inclusive: the only GitHub accounts we actively filter out are those strictly flagged as "automation bots."

*(Note: DevIndex is an independent, MIT-licensed FOSS project and is not officially affiliated with GitHub. We respect user privacy, utilize no tracking cookies, and run no advertisements.)*

## Scoring

Scoring is based on an aggregate of GitHub's core public contribution metrics over the lifetime of the account:
1.  **Commits** (Primary metric)
2.  **Pull Requests** (Code, Review)
3.  **Issues** (Reporting, Discussion)
4.  **Code Reviews**

For detailed information on how to permanently remove your profile from the index, please read our [Privacy & Opt-Out Guide](./OptOut.md).