# Generated data policy

## Git-managed

Source code, Skills, schemas, prompts, configuration templates, governance documents, tests and small synthetic fixtures are canonical Git content.

## Representative samples

Accepted run manifests, contract fixtures and small QA samples may be committed when they are public-safe and materially support regression tests.

## External storage

Dynamic market snapshots, large macro histories, workbench HTML, bulk images, rendered decks, caches, logs and temporary runs belong in local storage or an approved database/object store. Existing latest snapshots required by the running Daily Review remain during the transition. New generated history follows bounded retention.

Public repository content excludes bank operations data, customer or personal data, private research materials, API keys, tokens, cookies, `.env` files and uncertain fixtures.
