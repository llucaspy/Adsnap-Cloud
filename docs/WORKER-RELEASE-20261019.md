# Worker release — 19/10/2026

## Scope

Production release authorized by Lucas, conditional on functional and security checks.

- Sessions require a private AUTH_SECRET (minimum 32 characters); the published legacy key is rejected. The key is provisioned separately in production and preview, as sensitive Vercel variables. Existing sessions require a new login after deployment.
- Capture browser uses Chromium sandbox and a per-browser loopback proxy. HTTP connections and HTTPS CONNECT tunnels resolve public destinations and connect to the verified address, avoiding a second DNS resolution by Chromium. Loopback, private, metadata, reserved and IPv6 transition destinations are rejected. Credentials in URLs and nonstandard ports are rejected.
- Chromium inherits only OS/runtime environment variables, without database, storage or application keys. QUIC and non-proxied WebRTC UDP are disabled. Proxy lifetime follows browser shutdown, including failed launch and abort.
- Campaign and HTML5 document URLs are checked before navigation. Remote raster and fallback capture downloads validate and pin each redirect, enforce timeout and limit content to 25 MiB.
- GAM imports use the existing dedicated GAM worker and no longer consume the capture cycle budget.

No database migration, paid dependency, retention deletion or change to commercial capture approval is included.

## Verification

- Baseline: 82/82 tests passed before changes.
- Initial updated suite: 87/87 passed, including real Chromium and network denial scenarios.
- Public HTTPS download and a sandboxed browser capture of example.com succeeded locally (HTTP 200).
- Final isolated PostgreSQL, build, Linux CI, preview and production verification are recorded below when complete.

## Limits

This is a bounded hardening release, not certification of the entire application or every advertising portal. The proxy constrains browser networking, not the full runner OS after a hypothetical browser escape. Original/raw physical preservation, retention and capacity measurement remain separate work. Evidence metadata continues to state rawPreserved:false. Existing observed/preview/assembly classifications remain in force.

## Publication

Pending final gates. Production must serve the reviewed commit and both anonymous log access and sessions signed with the legacy key must be rejected.
