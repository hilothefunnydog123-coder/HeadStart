# Departure Apple-Committee Audit

Date: 2026-07-07
App URL tested: http://127.0.0.1:5174/
Branch: claude/smart-departure-alarm-bcesbc

## Scope

Audited the current local app as a user-facing alarm/planning product:

- Alarm/default state
- Commitment list and create/edit flow
- Destination search and suggestion behavior
- Settings, notification, privacy, and location controls
- Calendar import/connectors
- Mobile viewport
- Simulate morning mode
- Core planning, calendar, traffic, notification, location, and search code

## Evidence Captured

Screenshots:

1. `screenshots/01-default-alarm.png`
2. `screenshots/02-commitments-list.png`
3. `screenshots/03-expanded-draft-when.png`
4. `screenshots/04-destination-search-empty.png`
5. `screenshots/05-search-results-bellarmine.png`
6. `screenshots/06-destination-selected.png`
7. `screenshots/07-settings.png`
8. `screenshots/08-calendar-import.png`
9. `screenshots/09-mobile-alarm.png`
10. `screenshots/10-simulate-mode.png`

Checks run:

- `npm run typecheck`
- `npm test` - 12 files, 66 tests passed
- `npm run build`
- Latest GitHub CI on branch passed before this audit: run `28895039277`

External reference context:

- Apple App Review Guidelines emphasize that submitted apps should be complete, useful, and not buggy.
- Apple Human Interface Guidelines emphasize privacy, user control, clear permission timing, and refined app experiences.

## Step Health

1. Default alarm: visually polished and conceptually clear, but trust is weakened by `0.0 km · Heavy traffic` and `100%` confidence when origin and destination are effectively identical.
2. Commitments list: usable, but draft commitments accumulate and clutter the main list; delete is hidden until expansion.
3. Expanded commitment, What & when: clean form, but no focus management after expanding; title can be empty; manual one-off date creation is missing.
4. Destination search empty state: good core affordances, but no guidance about city/campus context or what makes results better.
5. Destination search results: trailing-space search works, keyboard selection works, but ranking is global and can surface irrelevant far-away results above likely local intent.
6. Destination selected / travel step: auto-advance is nice; step label `How often` is inaccurate because this step also sets travel mode.
7. Settings: strong privacy copy for location; notification-denied state lacks recovery instructions; raw API key entry feels developer-oriented.
8. Calendar import: honest about disabled Google config and Apple `.ics`, but the panel is easy to miss below drafts; imported text-only locations can still produce computed alarms from fallback coordinates.
9. Mobile alarm: clean 390px capture has no horizontal overflow; main alarm is readable, though secondary details require scrolling.
10. Simulate mode: useful for demos and testing; controls have accessible labels; should be more clearly marked as simulated so users do not confuse it with live time.

## Highest-Priority Failures

1. Alarm reliability is not proven enough for the core promise.
   The app schedules browser notifications with page timers and optionally downloads calendar reminders. That is not the same as a native alarm that reliably wakes a sleeping phone. The UI should clearly explain reliability limits, especially background/locked-screen behavior.

2. Plans can look precise when the inputs are uncertain or wrong.
   Imported calendar events without coordinates use fallback coordinates and `needsLocationReview`, but the app can still compute a polished alarm. Near-zero trips can show `Heavy traffic` because traffic severity ignores distance. These states should be visually downgraded or blocked until reviewed.

3. Google Calendar sign-in is not enabled in the tested build.
   The UI offers Google Calendar but disables it with "not enabled for this build." If this is how production is deployed, the calendar promise is not satisfied.

4. Apple Calendar is not really a connector yet.
   It is `.ics` import only. That may be acceptable technically for web, but the copy/marketing should not imply Apple sign-in unless a backend CalDAV or provider integration exists.

5. Location-based missed-departure detection can fail at the exact worst moment.
   The permission request may happen during the leave window, when the user is in a hurry. If permission is denied, unavailable, or inaccurate, the alert path collapses. Consider requesting/validating permission earlier with an explicit test.

6. Console warnings show a real rendering bug.
   Multiple learned suggestions can produce duplicate React keys like `recent-home`, risking unstable rendering.

## Concrete Improvements

1. Add a first-run setup checklist: home, calendar/source, notification reliability, location checks, first commitment.
2. Add a persistent "data quality" banner when a destination came from fallback calendar coordinates or needs review.
3. Do not enable imported commitments with unreviewed text-only locations by default, or show them as "needs location" drafts.
4. Fix traffic labeling for tiny distances: show "Same place / very close" instead of `Heavy traffic`.
5. Replace absolute `100%` confidence with capped/qualified language such as "Very likely" unless live route data and valid distance are present.
6. Make offline simulated traffic visually distinct from live traffic in the main card, not only the footer.
7. Add route preview details: origin, destination, estimated distance, provider, and last updated time.
8. Add a "why this wake time?" breakdown on the alarm card: arrival time minus buffer minus travel minus prep.
9. Add one-off manual commitments; current manual UI only exposes repeat weekdays.
10. Add focus movement after expanding a commitment and after moving between steps.
11. Rename step 3 from `How often` to `Travel & repeats`.
12. Add validation for empty commitment titles and destinations before marking a commitment enabled.
13. Add a visible remove/dismiss affordance for drafts without requiring expansion.
14. Add confirmation or undo for destructive actions: delete commitment, forget suggestions, disconnect calendar.
15. Add a way to archive or auto-clean incomplete drafts.
16. Add location-search context: current city/campus bias, recent areas, or "search near home."
17. Add a map preview or at least a compact place detail before selecting a search result.
18. Add reverse geocoding or clearer labeling when using current location.
19. Add search loading/error states that distinguish network failure from no results.
20. Rate-limit and debounce place search; trailing-space search works, but a production search bar should handle typing pauses and cancellation carefully.
21. Add e2e tests for the commitment creation flow and place search keyboard flow.
22. Add visual regression tests for desktop and 390px mobile alarm/commitment/settings screens.
23. Add tests for duplicate learned suggestion keys and repeated suggestion reasons.
24. Add notification permission recovery instructions for denied permission.
25. Add an in-app notification reliability warning and recommend calendar/system reminders for critical mornings.
26. Add a "test my alarm" flow that confirms sound, notification, and reminder download paths.
27. Add a "test location check" flow before the leave window.
28. Add service worker/update handling so users do not get stuck on a stale cached build.
29. Add an export/delete all local data control beyond clearing suggestions.
30. Add copy that says Google OAuth needs deployment configuration and Apple requires `.ics`/future backend connector.
31. Add calendar location geocoding or force review of text-only locations.
32. Add timezone clarity for imported events, especially recurring or travel calendars.
33. Add conflict handling when multiple commitments are close together.
34. Add "leave by" notifications that account for a moved traffic estimate after the original notification was scheduled.
35. Add accessible arrow-key behavior for the top tablist and commitment stepper, or avoid `role=tablist` if not implementing the full pattern.
36. Reduce `aria-live` scope on the whole alarm card; it may announce too much as the clock changes.
37. Add contrast QA for muted text and disabled states in light mode.
38. Respect reduced motion more fully for the animated sky/canvas.
39. Make simulated mode impossible to confuse with live mode through stronger labeling and a different footer/background treatment.
40. Add production telemetry-free debug logging or a local diagnostics panel for route/provider/permission status.

## Usefulness Verdict

Departure is useful as a concept and already convincing as a polished prototype. The core idea is strong: one screen answers "when do I wake up and when do I leave?" The most useful parts today are the backward-planned alarm, the clean commitment setup, place search, privacy-minded location copy, and simulate mode.

It is not yet ready to be trusted as a real alarm for important mornings. The product needs stronger reliability guarantees, clearer distinction between simulated and live data, stricter handling of uncertain locations, production-ready calendar configuration, and end-to-end testing of browser permissions and notification behavior.

## Evidence Limits

- I did not grant location, notification, Google OAuth, or Apple Calendar account access.
- I did not test a deployed production build with `VITE_GOOGLE_CLIENT_ID`.
- I did not run a screen reader; accessibility findings are based on DOM roles/labels, screenshots, and code inspection.
- I did not test native installed-PWA background behavior on iOS or Android.
