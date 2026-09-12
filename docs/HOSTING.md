# Hosting and root application details

The root Daily Review application uses vinext with optional Cloudflare D1 and Drizzle support.

```bash
npm ci
npm run dev
npm run build
```

Application code lives in `app/`. `.openai/hosting.json` declares optional Sites D1 and R2 bindings, `vite.config.ts` simulates declared bindings locally, and `examples/d1/` contains the optional D1 example.

The hosting platform may provide `oai-authenticated-user-email` and an optional percent-encoded `oai-authenticated-user-full-name` request header. `app/chatgpt-auth.ts` contains the existing optional ChatGPT sign-in helpers. Identity-sensitive routes remain dynamic and validate same-origin return paths. Workspace authorization remains a separate hosting policy decision.
