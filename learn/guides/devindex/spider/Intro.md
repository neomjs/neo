---
title: The Spider
---

# The Spider (Discovery Engine)

The Spider is a recursive discovery agent designed to traverse the GitHub graph and identify high-output contributors who might otherwise be invisible.

## Strategy
1.  **Seed**: Starts with a curated list of top repositories or users.
2.  **Crawl**: Fetches contributors, stargazers, and organization members.
3.  **Filter**: Applies a "Relevance Threshold" to ignore low-activity accounts.
4.  **Expand**: Recursively scans the network of identified high-value users.

## Rate Limiting
The Spider respects GitHub API rate limits using a dual-bucket strategy (Core vs. Search) to maximize throughput without triggering abuse detection.
