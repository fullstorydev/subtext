## Matrix summary

| Config | Passed | Failed | With errors |
|---|---|---|---|
| subtext-only | 18/20 | 2 | 0 |
| subtext-plus-superpowers | 8/20 | 12 | 0 |

## Per-query breakdown

| Query | Expected | subtext-only | subtext-plus-superpowers |
|---|---|---|---|
| Make the navbar dropdown shadow more subtle — it looks too heavy on light bac... | ✅ | ✅ 2/3 | ❌ 1/3 |
| The sidebar icon labels are getting clipped on narrow screens, fix the trunca... | ✅ | ✅ 3/3 | ❌ 0/3 |
| Swap the loading spinner for a skeleton screen on the dashboard cards | ✅ | ✅ 3/3 | ❌ 0/3 |
| Increase the contrast on disabled form fields so they pass WCAG AA | ✅ | ✅ 3/3 | ✅ 2/3 |
| Build a /health endpoint that checks DB and cache connectivity and returns 20... | ✅ | ✅ 3/3 | ❌ 0/3 |
| Wire up email notifications when an invoice transitions to overdue status | ✅ | ✅ 2/3 | ❌ 1/3 |
| Add server-side pagination to the /api/orders listing endpoint | ✅ | ✅ 3/3 | ❌ 0/3 |
| Pull the rate-limiting logic out of the individual route handlers and into a ... | ✅ | ✅ 3/3 | ❌ 1/3 |
| Break the 400-line UserService class into smaller focused domain modules | ✅ | ✅ 2/3 | ❌ 0/3 |
| The session token isn't being cleared on logout — users stay logged in after ... | ✅ | ✅ 2/3 | ❌ 0/3 |
| You are implementing Task 5: Add a sortable column header to the invoices tab... | ✅ | ✅ 3/3 | ❌ 0/3 |
| You are implementing Task 11: Persist filter selections in localStorage so th... | ✅ | ✅ 3/3 | ❌ 0/3 |
| What's the best approach for caching API responses in this architecture? | ❌ | ✅ 1/3 | ✅ 0/3 |
| Can you trace how a payment flows through the system end to end? | ❌ | ❌ 2/3 | ✅ 0/3 |
| Which components re-render when the global theme context value changes? | ❌ | ✅ 0/3 | ❌ 2/3 |
| Add a JSDoc comment to parseDate explaining the accepted format strings | ❌ | ✅ 0/3 | ✅ 1/3 |
| Update the architecture decision record for our current auth strategy | ❌ | ✅ 0/3 | ✅ 0/3 |
| Set the default log level to warn in the staging environment config file | ❌ | ❌ 2/3 | ✅ 1/3 |
| Add "strict": true to the root tsconfig.json | ❌ | ✅ 0/3 | ✅ 1/3 |
| Rename the private helper _fmt to _formatLabel inside ChartUtils.ts | ❌ | ✅ 0/3 | ✅ 1/3 |

## Divergences (≥0.50 trigger-rate gap)

- ✅ `The sidebar icon labels are getting clipped on narrow screens, fix the truncation` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Swap the loading spinner for a skeleton screen on the dashboard cards` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Build a /health endpoint that checks DB and cache connectivity and returns 200 or 503` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Add server-side pagination to the /api/orders listing endpoint` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Pull the rate-limiting logic out of the individual route handlers and into a shared middle` — gap 0.67 (subtext-only=1.00, subtext-plus-superpowers=0.33)
- ✅ `Break the 400-line UserService class into smaller focused domain modules` — gap 0.67 (subtext-only=0.67, subtext-plus-superpowers=0.00)
- ✅ `The session token isn't being cleared on logout — users stay logged in after signing out` — gap 0.67 (subtext-only=0.67, subtext-plus-superpowers=0.00)
- ✅ `You are implementing Task 5: Add a sortable column header to the invoices table. Use the e` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `You are implementing Task 11: Persist filter selections in localStorage so they survive pa` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ❌ `Can you trace how a payment flows through the system end to end?` — gap 0.67 (subtext-only=0.67, subtext-plus-superpowers=0.00)
- ❌ `Which components re-render when the global theme context value changes?` — gap 0.67 (subtext-only=0.00, subtext-plus-superpowers=0.67)
