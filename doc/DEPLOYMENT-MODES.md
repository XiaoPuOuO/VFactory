# Deployment Modes

Status: Authenticated-only deployment model  
Date: 2026-02-23

## 1. Purpose

Paperclip runs in **authenticated** mode only. All human access requires login (Better Auth sessions).

`authenticated` supports two exposure policies:

1. `private`
2. `public`

This keeps one auth stack while separating low-friction private-network defaults from internet-facing hardening requirements.

## 2. Canonical Model

| Runtime Mode | Exposure | Human auth | Primary use |
|---|---|---|---|
| `authenticated` | `private` | Login required | Private-network access (for example Tailscale/VPN/LAN) or local dev |
| `authenticated` | `public` | Login required | Internet-facing/cloud deployment |

## 3. Security Policy

## `authenticated + private`

- login required
- low-friction URL handling (`auto` base URL mode)
- private-host trust policy required

## `authenticated + public`

- login required
- explicit public URL required
- stricter deployment checks and failures in doctor

## 4. Onboarding UX Contract

Default onboarding remains interactive and flagless:

```sh
pnpm paperclipai onboard
```

Server prompt behavior:

1. deployment mode is always `authenticated`
2. ask exposure: `private` or `public`
3. ask explicit public URL only for `public` exposure

`configure --section server` follows the same interactive behavior.

## 5. Doctor UX Contract

Default doctor remains flagless:

```sh
pnpm paperclipai doctor
```

Doctor reads configured mode/exposure and applies mode-aware checks. Optional override flags are secondary.

## 6. Board/User Integration Contract

Board identity must be represented by a real DB user principal for user-based features to work consistently.

Required integration points:

- real user row in `authUsers` for Board identity
- `instance_user_roles` entry for Board admin authority
- `company_memberships` integration for user-level task assignment and access

This is required because user assignment paths validate active membership for `assigneeUserId`.

## 6.1 Multi-tenant (SaaS) and tenant resolution

When running in SaaS multi-tenant mode, every request is scoped to a tenant. Tenant is resolved in this order:

1. **Header** `X-Tenant-Slug` or `X-Tenant-ID` — API and agent clients send the current tenant.
2. **Default** — If no header is sent, the server uses the configured default tenant slug (e.g. `default`).

Board users must have a `tenant_memberships` row for the resolved tenant to see companies and data. Instance admins can access all tenants. See `doc/SPEC-implementation.md` for the data model.

## 7. Board Claim (First Instance Admin)

When no instance admin exists, Paperclip can emit a startup warning with a one-time high-entropy claim URL.

- URL format: `/board-claim/<token>?code=<code>`
- intended use: signed-in human claims board ownership
- claim action:
  - promotes current signed-in user to `instance_admin`
  - ensures active owner membership for the claiming user across existing companies

## 8. Current Code Reality (As Of 2026-02-23)

- runtime mode is `authenticated` only
- Better Auth sessions and bootstrap invite flow
- company creation ensures creator membership in `company_memberships` so user assignment/access flows remain consistent
- tenant resolution middleware sets `req.tenantId` / `req.tenantSlug` from header or default; board actor `companyIds` are filtered by tenant; `tenant_memberships` restricts which users can access which tenant

## 9. Naming and Compatibility Policy

- canonical naming is `authenticated` with `private/public` exposure
- no long-term compatibility alias layer for discarded naming variants

## 10. Relationship to Other Docs

- implementation plan: `doc/plans/deployment-auth-mode-consolidation.md`
- V1 contract: `doc/SPEC-implementation.md`
- operator workflows: `doc/DEVELOPING.md` and `doc/CLI.md`
