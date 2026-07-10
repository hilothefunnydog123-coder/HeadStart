# HeadStart full button audit — 2026-07-10

## Audit scope

- Product: Departure / HeadStart local web app
- Goal: exercise every first-party button in authentication, navigation, onboarding, commitments, saved places, calendar connections, alarm actions, simulation, profile, and settings
- Viewports: 1440 × 1000 desktop and 390 × 844 mobile
- Evidence: browser interaction screenshots plus automated browser-API mocks for permission, download, OAuth, calendar-file, notification, audio, and geolocation actions

## Overall result

Four behavior problems were found and fixed. All first-party button groups now have passing interaction coverage. The full suite passes with 22 test files and 118 tests.

## Failures found and fixed

1. **[P0] Create account could expose another local account's legacy schedule**
   - Before: a newly created account inherited the old unscoped `smart-departure-alarm/v1` state.
   - Evidence: `09-new-account-inherited-data.png` shows a brand-new account opening directly into another schedule.
   - Fix: authenticated accounts now load only their owner-scoped state.
   - After: `14-new-account-isolated-fixed.png` shows the same flow starting empty with no inherited home, commitments, or places.

2. **[P1] Set home location did not start Home setup**
   - Before: the button only opened the top of Settings and left the Home row closed.
   - Evidence: `02-set-home-result.png`.
   - Fix: the button now opens the Home editor, scrolls it into view, and focuses the search field.
   - After: `15-set-home-opens-editor-fixed.png` and `18-mobile-home-editor-fixed.png`.

3. **[P1] Alarm reliability buttons landed at the wrong place**
   - Before: `Review`, `Enable live dot`, `Alarm tested`, and `Leave check` opened the top of Settings without identifying the control the user needed.
   - Fix: each action now scrolls to and focuses the matching Settings section; `Start location` opens Home editing directly.
   - After: `19-review-target-fixed.png` shows the focused Missed-departure check section.

4. **[P2] Calendar import and disconnect controls had duplicate accessible names**
   - Before: both providers exposed identical `Import .ics`, `Choose File`, and `Disconnect` names.
   - Evidence: `12-calendar-controls.png` and its DOM capture.
   - Fix: provider-specific names now distinguish Google Calendar and Apple Calendar without changing the visible layout.
   - After: `16-calendar-labels-fixed.png` and its DOM capture.

## Numbered flow review

1. **Authentication — healthy after fix**
   - Tested: Sign in/Create account tabs, email account creation, password mismatch recovery, sign in, Google sign-in handler, and sign out.
   - Screenshots: `07-auth-signin.png`, `08-auth-create-account.png`, `14-new-account-isolated-fixed.png`.

2. **Profile menu — healthy**
   - Tested: menu toggle, Profile settings, App settings, Close, Cancel, Save profile, and Sign out.
   - Screenshot: `11-profile-dialog.png`.

3. **Home onboarding and saved places — healthy after fix**
   - Tested: Set home location, Add/Change/Remove Home, Add Work, Add School, Cancel, Search, search-result selection, preview selection, learned-place choice/dismissal, and current-location handler.
   - Screenshots: `01-alarm-empty-desktop.png`, `03-add-home-editor.png`, `04-home-selected.png`, `15-set-home-opens-editor-fixed.png`.

4. **Commitments — healthy**
   - Tested: New commitment, Resume, Discard, expand/collapse, enable/disable, Delete, step tabs, Back/Next/Done, deadline kind, all travel modes, Weekly/One day, and all repeat-day toggles.
   - Screenshots: `05-resumed-draft.png`, `06-commitment-travel-step.png`.

5. **Calendar connections — healthy after labeling fix**
   - Tested: Connect/Sync Google handler, Connect/Reconnect Apple, Close, Cancel, Connect calendar, Google/Apple `.ics` import, and provider-specific Disconnect.
   - Screenshots: `12-calendar-controls.png`, `13-apple-dialog.png`, `16-calendar-labels-fixed.png`.

6. **Alarm and route actions — healthy after navigation fix**
   - Tested: Review, Enable live dot, all four alarm travel modes, Brief me, Add reminders, and setup checklist actions.
   - Screenshot: `19-review-target-fixed.png`.

7. **Simulation — healthy**
   - Tested: Simulate morning, Pause, Play, Exit simulation, and 30×/90×/240× speed buttons.
   - Screenshot: `10-simulation-controls.png`.

8. **Settings reliability controls — healthy**
   - Tested: Enable notifications, Test, Test sound, Test notification, Download backup, Enable/disable live checks, Test location check, and Forget suggestions.
   - Permission-sensitive behavior was verified with deterministic browser mocks.

9. **Responsive behavior — healthy**
   - Rechecked the empty Alarm action and Home editor at 390 × 844 with no console errors.
   - Screenshots: `17-mobile-empty-fixed.png`, `18-mobile-home-editor-fixed.png`.

## Accessibility notes

- Keyboard tab navigation and section focus remain intact.
- Direct actions now move focus with their visual scroll, so keyboard and screen-reader users receive the same destination context.
- Calendar file and disconnect controls now announce the provider.
- Screenshot review alone cannot establish full WCAG compliance; semantic and focus behavior were also checked in DOM tests.

## Evidence limits

- Real Google/Apple accounts were not authorized during the browser audit. OAuth and connector button behavior was tested with provider-shaped mocks.
- Real notification and location permissions were not changed. Permission and geolocation actions were tested with browser API mocks.
- The in-app browser does not support file uploads, so `.ics` chooser wiring and file parsing were verified in automated DOM tests.
- OpenStreetMap iframe zoom controls are third-party controls and are outside the first-party codebase; the first-party `Open full map` link was inspected separately.
