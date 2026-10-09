## What this changes

<!-- One or two sentences. Link the issue it closes, if there is one:
     Closes #123 -->

## Why

<!-- What problem does this solve? If this is a fix, show the failing behaviour
     before and after. -->

## How it was verified

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

<!-- CI runs all four on every PR; none of them can be skipped. -->

## Tests

- [ ] Added or updated tests in `tests/`
- [ ] Existing tests still pass unchanged

<!--
The suites under `tests/` pin behaviour that is easy to break by accident:

- `tests/normalize.spec.ts` covers the monitoring normalizers, including the two
  JetStream shapes (the pre-2.11 boolean `config` field vs. the modern object).
  If you change a normalizer, change its expectations in the same PR — a
  normalizer that "handles" an unknown payload by silently returning zero
  values is a regression, not a fix.
- `tests/nats-protocol.spec.ts` covers the NATS wire codec: byte-accurate payload
  lengths, reassembly across chunk boundaries, and `MSG`/`HMSG`/`INFO`/`-ERR`.
  Any change to frame encoding must keep the byte counts exact.
- `tests/api-route.spec.ts` pins every failure mode of `/api/monitor/**` to an
  HTTP status with an actionable hint. New failure modes need a new case.

A behaviour change without a test change will not pass review.
-->

## Notes for the reviewer

<!-- Anything non-obvious: a trade-off taken, a piece of scope deliberately left
     out, or a Docker/security implication. -->