# Cosmos DB Indexing Policies (Archive)

This folder is kept as an archive.

Earlier iterations of this repository stored JSON indexing policy files here and documented applying them via CLI. Those files are not part of the current supported workflow.

## Current State

- The IaC deployment does not apply custom indexing policies by default.
- If you need custom indexing policies, apply them explicitly (outside this repo) or extend the Bicep Cosmos module to include the indexing policy you want.

## Why This Exists

Indexing policies are very environment/data-shape specific, and keeping half-applied JSON files in-repo tends to drift and mislead.
