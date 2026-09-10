# Retrieval Rules

## Namespace

Use only `canghai-yitugou`. Keep every analyst's corpus, embeddings, graph and answer context isolated.

## Query construction

Run one direct query for the user's named assets and event, then expand around the mechanism:

- common drivers behind jointly moving assets;
- structural constraints, substitution and balance-sheet boundaries;
- policy expectation versus realized policy;
- liquidity, credit, actual/expected rates and risk appetite;
- macro variable to asset-price transmission;
- historical analogies explicitly used by the author.

## Evidence selection

Prefer full articles with stable `article_id`, title, publication date and source URL. Use the passages that contain the causal link, constraint or invalidation condition. A DNA rule gains strong support from at least two articles; a single-article rule remains case-specific.

Return at most ten high-relevance articles for an answer. Preserve dissenting or regime-specific articles when they materially change the conclusion.

## Attribution boundary

Treat retrieved statements as historical views. Treat the application of DNA to facts after an article's publication as model inference. Quote sparingly and rely on precise paraphrase with article citations.
