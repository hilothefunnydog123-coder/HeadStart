# HeadStart Stress Test - 2026-07-08

## Scope

Stress-tested the current local HeadStart website at `http://127.0.0.1:5173/` across the main product surfaces:

1. Now/start empty states
2. Settings saved-place flow
3. Place search and saved Home/Dorm behavior
4. Schedule tab and add-class draft behavior
5. Calendar connector setup for Google and Apple
6. Legacy demo-data migration
7. Page metadata/title

Screenshots are saved in `audit/headstart-stress-test-2026-07-08/screenshots/`.

## Step List

1. `01-now-start.png` - Initial Now screen. Health after fixes: good. Before fixes, browser title still said `Departure · Smart Wake-Up Alarm` and the `first` text used a visible `fi` ligature.
2. `02-settings-from-start-location.png` - Start-location CTA routed to Settings. Health after fixes: improved. CTA copy changed from vague `Set start location` to `Add home/dorm or campus`.
3. `03-add-home-place-picker.png` - Home/Dorm place picker opened. Health after fixes: good. Search label copy was tightened from generic `Search` to `Place search`.
4. `04-place-search-results.png` - Place search with `Bellarmine`. Health: functional. Results returned from OpenStreetMap and did not show errors.
5. `05-place-result-selected.png` - Search result selected. Health: functional. Clicking a result saved the Home/Dorm place.
6. `07-now-after-home-no-schedule.png` - Now screen after Home/Dorm was saved. Health before fixes: revealed stale legacy demo schedule data.
7. `08-schedule-existing-stale-item.png` - Schedule with stale `Office — Financial District` item. Health before fixes: bad. Edited legacy demo data survived migration.
8. `09-google-connect-visible-error.png` - Google connector before fix. Health before fixes: bad. Red setup error was shown and `Connect Google` stayed active without a client ID.
9. `10-google-connect-after-click-error.png` - Google connector after click before fix. Health before fixes: bad. Clicking preserved the red local-config error.
10. `11-apple-connect-missing-backend-error.png` - Apple connector area during connector testing. Health before fixes: risk. Apple had the same missing-backend active-button pattern.
11. `12-add-class-form-open.png` - Add-class draft. Health before fixes: mixed. Draft row exposed `Plan a test for this class` before a building existed.
12. `13-after-fix-reload-now.png` - Reload after first fixes. Health: title fixed, connector errors gone, but stale Office item still survived due edited legacy place data.
13. `14-after-fix-no-stale-office.png` - Reload after broader legacy cleanup. Health: good. Stale Office demo item removed.
14. `15-after-fix-no-home-typography.png` - Empty state after typography fix. Health: good. Display heading ligatures disabled for the `first` text issue.
15. `16-after-fix-calendar-connectors.png` - Calendar connector state after behavior fixes. Health: good. Google/Apple connect buttons are disabled until setup exists, `.ics` import remains enabled, stale setup errors are hidden, and file inputs are labeled.
16. `18-after-fix-disabled-connectors.png` - Calendar connector state after disabled-button visual polish. Health: good. Disabled Google/Apple actions now read visually unavailable.

## Findings And Fixes

1. Stale product metadata
   - Evidence: `01-now-start.png`, browser title read `Departure · Smart Wake-Up Alarm`.
   - Fix: Updated `index.html` title, PWA app title, and description to HeadStart/student schedule assistant language.

2. Decorative `fi` ligature made the `f` in `first` look inconsistent
   - Evidence: user screenshot and `01-now-start.png`.
   - Fix: Disabled common ligatures on display headings (`brand-title`, `ring-big`, `panel-title`, `.placeholder h2`).

3. Google connector produced a red setup error when no OAuth client ID was configured
   - Evidence: `09-google-connect-visible-error.png`, `10-google-connect-after-click-error.png`.
   - Fix: Disabled `Connect Google` until a client ID exists, changed missing-config copy to neutral setup guidance, suppressed old saved setup-only errors, and restyled disabled primary buttons to look unavailable.

4. Apple connector had the same missing-backend active-action risk
   - Evidence: connector card in `16-after-fix-calendar-connectors.png`.
   - Fix: Disabled `Connect Apple` until a connector URL exists, kept `.ics` import enabled, changed setup copy to neutral guidance, and restyled disabled primary buttons to look unavailable.

5. Hidden calendar file inputs were not directly labeled
   - Evidence: control tree from connector testing.
   - Fix: Added `aria-label` values for Google and Apple `.ics` file inputs.

6. Legacy demo schedule item could survive if the user edited its title or place id/coordinates
   - Evidence: `07-now-after-home-no-schedule.png`, `08-schedule-existing-stale-item.png`, `13-after-fix-reload-now.png`.
   - Fix: Broadened migration cleanup to remove commitments whose destination label is the legacy `Office — Financial District`.

7. Incomplete class draft showed `Plan a test for this class`
   - Evidence: `12-add-class-form-open.png`.
   - Fix: Hid the test-planning action until the draft has a real destination.

8. Place search label repeated as `Search / Search / Search`
   - Evidence: `03-add-home-place-picker.png` and DOM text from the audit.
   - Fix: Changed the field label to `Place search`.

## Verification

Commands run after fixes:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Results:

- TypeScript: passed
- Tests: passed, 18 files and 98 tests
- Production build: passed
- Whitespace check: passed

## Limits

- I did not accept browser notification or location permission prompts. Those controls were inspected and covered by mocked automated tests, but accepting real browser permissions would require explicit action-time permission.
- Chrome automation became stuck on a discard confirmation after the relevant screenshots were already captured. Automated tests and later browser snapshots covered the fixed behavior, but the browser session itself could not be cleanly finalized through the extension.
