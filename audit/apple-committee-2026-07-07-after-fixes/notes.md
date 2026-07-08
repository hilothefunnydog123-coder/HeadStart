# Departure After-Fix Product Audit

Date: 2026-07-07  
Surface: local app at `http://127.0.0.1:5174/`  
Mode: combined UX, visual, and accessibility audit  
Reference standards checked: Apple Human Interface Guidelines, Apple Accessibility guidance, WCAG 2.2 target size and focus guidance.

## Evidence Captured

1. `screenshots/01-desktop-alarm.png` — desktop alarm with first-run reliability checklist.
2. `screenshots/02-settings-reliability.png` — settings path with alarm test, notification recovery, and location test controls.
3. `screenshots/03-commitments-calendar-connectors.png` — commitments overview and calendar connector entry.
4. `screenshots/04-new-commitment-when.png` — simplified commitment creation, step 1.
5. `screenshots/05-destination-search-preview.png` — place search with learned suggestions, dismiss controls, result ranking, and preview.
6. `screenshots/06-one-off-travel-repeat.png` — travel mode plus weekly/one-day scheduling.
7. `screenshots/07-mobile-alarm.png` — mobile alarm layout.

Browser health checks:
- Console warnings/errors: none captured after the flow.
- Visible interactive targets below 24px in checked state: none found.
- Tests: 81 passing across unit, app-flow, visual-contract, and screen-reader behavior tests.

## Step Health

1. Desktop alarm: Healthy. The checklist makes the product promise more honest before the alarm surface, and the alarm card now includes source clarity, wake breakdown, route preview, and backup-reminder CTA.
2. Settings reliability: Healthy. Users can test sound, notification, location check, and backup reminders before depending on the app. Notification-denied recovery copy is present.
3. Calendar connectors: Improved with caveat. Google is no longer a disabled dead end: it accepts an env-configured OAuth client or local developer client. Apple now has a secure backend connector path and callback contract, with `.ics` retained as fallback.
4. Create commitment, step 1: Healthy. The flow starts with only title/time and no lat/lng burden.
5. Destination search: Healthy. Space-triggered search, campus/city bias, OpenStreetMap disclosure, result preview, learned-suggestion dismiss buttons, and result ranking are visible. One caveat: the preview is still text-only rather than a real map tile.
6. Travel & repeats: Healthy. The renamed step exposes travel mode and one-off commitments clearly, with a date field and Done action.
7. Mobile alarm: Mostly healthy. The checklist, tabs, and alarm dial stack cleanly. The mobile first viewport is still tall and information-dense, so the primary alarm sits below checklist content.

## Requirements Check

- Alarm reliability: improved with checklist, test flow, browser notification recovery, calendar reminder backup, and explicit reliability notice.
- Near-zero traffic labeling: fixed in display helper and tested; short trips show "Very close" instead of "Heavy traffic."
- Text-only calendar locations: imported events needing review are disabled and skipped by plan selection.
- Google Calendar sign-in: no longer disabled; supports GIS OAuth with local dev fallback.
- Apple Calendar connection: no unsafe public calendar requirement; supports backend connector redirect and callback payload import. Still requires an actual secure backend in deployment.
- Location checks too late: settings now verifies location when enabled and exposes a test location check before the leave window.
- Duplicate suggestion keys: fixed and backed by app-flow coverage; browser console showed no warnings.
- Draft clutter: incomplete drafts are hidden and reusable, with Resume/Discard controls.
- Manual one-off commitments: exposed in Travel & repeats and tested.
- Undo/confirm safety: delete, disconnect, discard, and forget suggestions now confirm. True undo is still not implemented.
- Place search: biased, search-on-space behavior exists, and preview is present.
- Tests: added app-flow, visual-contract, accessibility, calendar connector, travel display, and review-location tests.
- Screen-reader noise: alarm card live region is narrowed to the changing dial status; no broad card-level `aria-live`.

## Remaining Risks

1. Apple connector needs backend deployment to become a real connected account experience. The frontend now supports it, but a static site alone cannot safely perform Apple CalDAV sign-in.
2. The place preview is not a map. It gives provider, address, and distance-from-start context, but a small map tile would make wrong-place detection faster.
3. The reliability checklist is useful but competes with the alarm on mobile. Consider collapsing completed checklist items after the user has passed first-run setup.
4. Browser notifications and geolocation still depend on browser/OS rules. The app now explains and tests this, but cannot guarantee delivery like a native alarm app.
5. The confirmation dialogs use native `window.confirm`. They are safe, but a branded inline undo toast would feel more polished and less abrupt.

## Recommendations

1. Build or wire the secure calendar connector backend next, especially for Apple CalDAV or a trusted calendar aggregation provider.
2. Add a small static map preview or provider map link in `PlacePicker` after a result is highlighted.
3. Collapse or summarize the setup checklist once items are complete so mobile users see the alarm faster.
4. Replace destructive native confirms with inline confirmation/undo toasts where feasible.
5. Add a browser-level visual regression runner later if the project can afford Playwright screenshots in CI; current visual tests are structural contracts, not pixel diffs.
