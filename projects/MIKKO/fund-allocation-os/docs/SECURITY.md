# Security model

Fund Allocation OS treats the API as the authorization boundary. Frontend visibility is not a permission check.

## Authentication

- Protected endpoints require an HMAC-SHA256 signed Bearer token.
- Signed claims contain `sub`, `role`, `email`, `iat`, and `exp`.
- Signatures use constant-time comparison; expired or malformed tokens return `401`.
- Production refuses the development signing secret. Set `AUTH_SIGNING_SECRET` to a long random deployment secret.
- Request bodies cannot impersonate another user: a supplied `actor_id` must match the signed `sub` claim.

## Roles and separation of duties

| Role | Main permissions |
|---|---|
| `admin` | Full system access |
| `advisor` | Research, portfolio diagnosis, draft submission, companion drafts |
| `research` | Provider data, discovery, fund research |
| `compliance` | Recommendation approval/rejection, audit review, companion review |
| `operations` | Provider/Skill execution and automation operations |
| `client` | Own Consent records only |

Only `compliance` and `admin` can approve or reject a Recommendation. Fund-pool membership approval is admin-only in this baseline. Automated workflows create drafts, events, or tasks; they never approve recommendations, send client communications, or place trades.

## Abuse controls and audit

- Mutating endpoints use a per-identity, per-route in-process rate limit. Replace this with a distributed limiter when multiple API replicas are deployed.
- Consent grant/revoke records are immutable events and create audit-log entries.
- Recommendation state transitions continue to use append-only audit logs.
- Secrets, raw tokens, and source credentials are never written to application logs or the repository.

## Hosted access

The Sites portal is intended for private deployment. The hosted identity layer controls entry to the portal; live data calls must still pass signed identity to this API, whose server-side RBAC remains authoritative.
