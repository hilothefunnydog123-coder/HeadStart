# Departure full-product UI audit

Audit date: 2026-07-09

## Scope

Combined UX and accessibility audit of the complete single-page app before the
production UI pass. The reachable surfaces are:

1. Account sign in and account creation.
2. Alarm overview, setup checklist, route map, live-departure status, confidence,
   travel modes, timing explanation, reminders, and simulation controls.
3. Commitment list, commitment editing, three-step creation, destination search,
   learned suggestions, search results, manual coordinates, travel mode, repeat
   schedule, one-off date, calendar import, and Apple Calendar dialog.
4. Settings for saved places, preparation timing, routing provider, browser
   alerts, notification testing, location consent, and learned-place history.
5. Empty, loading, error, validation, disabled, focus, hover, responsive, and
   reduced-motion states represented in the implementation and tests.

## Evidence

- `before/00-auth.png`: account sign in.
- `before/01-alarm-ready.png`: desktop alarm above the fold.
- `before/02-commitments.png`: desktop commitments list.
- `before/03-new-commitment.png`: commitment step one.
- `before/04-place-picker.png`: destination picker.
- `before/05-place-results.png`: destination search results.
- `before/06-travel-repeat.png`: travel and repeat step.
- `before/07-settings.png`: full settings page.
- `before/08-calendar-connectors.png`: expanded calendar connections.
- `before/09-apple-modal.png`: Apple Calendar dialog.
- `before/10-mobile-commitments.png`: mobile commitments and calendar state.
- `before/11-mobile-alarm.png`: mobile alarm above the fold.

## Strengths

- The product promise is concrete and the wake/leave/arrive calculation is easy
  to understand once the alarm is visible.
- Fraunces and Inter give the product a recognizable editorial/utilitarian mix.
- The mint accent consistently communicates readiness, motion, and success.
- Core controls are semantic and mostly keyboard-addressable: tabs, segmented
  controls, dialogs, labels, listboxes, and status regions are already present.
- Calendar permissions, location consent, and browser storage are explained in
  plain language.

## UX risks

1. Desktop is constrained to a 480px mobile column, wasting most of the canvas
   and making every complex surface feel denser than necessary.
2. The setup checklist appears before the actual alarm and can consume most of
   the first viewport on both desktop and mobile.
3. Alarm diagnostics are serialized into a very long stack. Route, confidence,
   current commitment, mode comparison, traffic curve, and reminder backup do
   not have a clear primary/secondary hierarchy.
4. Settings is a single narrow column with repeated framed sections. Important
   controls are difficult to scan and the page feels longer than its content.
5. Commitment creation nests a card, stepper, fieldset, result list, preview,
   and action row inside the page card. The available width causes labels and
   destinations to truncate early.
6. Calendar import repeats its heading and frames provider cards inside another
   framed disclosure, which makes an optional workflow visually heavy.
7. Switching between long tabs preserves scroll position, so a new screen can
   open partway down with the brand/header missing.
8. Several setup, provider, and status labels are technically accurate but do
   not prioritize the next action.

## Accessibility risks

1. Focus is visible but applied with box-shadow only; it can be lost against
   mint borders and does not cover every input/link state consistently.
2. Some muted text and placeholders approach low contrast in the light theme.
3. A few error messages are not announced as alerts, including calendar and
   place-search errors.
4. Icon-only actions rely on small 34-36px targets in a few places.
5. The mobile account row and three-tab navigation consume substantial vertical
   space before the primary task.
6. Screenshot evidence cannot prove screen-reader output, browser permission
   behavior, contrast ratios, or every keyboard path; automated and interactive
   verification is still required after implementation.

## Redesign direction

- Widen the desktop workspace to 1080px while retaining a focused 620px content
  measure for forms.
- Use a compact sticky product header with integrated navigation and account
  actions.
- Put the alarm first and move setup progress to a secondary rail on desktop;
  collapse completed checklist items on mobile.
- Convert Alarm and Settings into responsive two-column compositions with fewer
  nested frames and stronger section headings.
- Give commitment creation a dedicated, wider editor surface and keep provider
  connections as concise rows.
- Standardize spacing, radii, buttons, focus, status, disabled, validation, and
  motion tokens across every component.

## Post-redesign evidence

- `after/00-auth-desktop.png`: refined sign-in hierarchy and account privacy note.
- `after/01-alarm-desktop.png`: primary alarm and route map with setup in a rail.
- `after/02-commitments-desktop.png`: scan-first schedule list.
- `after/03-commitment-editor-desktop.png`: wide commitment editing workflow.
- `after/04-place-picker-desktop.png`: expanded place search and suggestions.
- `after/05-settings-desktop.png`: responsive settings groups.
- `after/06-alarm-mobile.png`: answer-first mobile alarm.
- `after/07-commitments-mobile.png`: compact mobile schedule.
- `after/08-editor-mobile.png`: three-step mobile editor after breakpoint repair.
- `after/09-calendar-mobile.png`: private calendar connection options.
- `after/10-apple-modal-mobile.png`: focused Apple connection dialog.
- `after/11-settings-mobile.png`: single-column mobile settings.

## Post-redesign assessment

1. Desktop now uses an 1180px responsive workspace while preserving compact
   reading measures inside forms and cards.
2. The departure answer is the first alarm content in the DOM and first visual
   content on mobile; setup is a sticky secondary rail only on wider screens.
3. Commitments, calendar connections, saved places, and settings are grouped by
   task without a page card wrapping every child card.
4. Tab changes reset scroll, all tested viewports have no horizontal overflow,
   and the commitment stepper remains usable at 390px.
5. Input, link, button, tab, summary, and switch focus states use a consistent
   high-contrast outline. Calendar and place-search failures announce as alerts.
6. Automated checks cover the core calculations, account flows, commitment
   workflow, accessibility semantics, calendar parsing, route modes, and state.
   Real OAuth consent, browser notification delivery, and physical-device
   location behavior remain integration checks outside screenshot automation.
