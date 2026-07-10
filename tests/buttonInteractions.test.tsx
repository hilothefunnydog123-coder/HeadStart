import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlarmCard } from "../src/components/AlarmCard";
import { AuthPanel } from "../src/components/AuthPanel";
import { CalendarConnectors } from "../src/components/CalendarConnectors";
import { CommitmentForm } from "../src/components/CommitmentForm";
import { DemoBar } from "../src/components/DemoBar";
import { PlacePicker } from "../src/components/PlacePicker";
import { SettingsPanel } from "../src/components/SettingsPanel";
import { buildPlan } from "../src/core/departure";
import type {
  CalendarConnection,
  Commitment,
  DeparturePlan,
  Place,
  Settings,
  TravelEstimate,
} from "../src/core/types";
import type { ClockControl } from "../src/hooks/useClock";
import { defaultState } from "../src/state/store";

const home: Place = {
  id: "home",
  label: "Home",
  lat: 37.7599,
  lng: -122.4148,
};

const campus: Place = {
  id: "campus",
  label: "Campus",
  lat: 37.7946,
  lng: -122.3999,
};

const commitment: Commitment = {
  id: "class",
  title: "Morning class",
  destination: campus,
  travelMode: "drive",
  arriveByMinutes: 9 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
};

const estimate: TravelEstimate = {
  durationSeconds: 20 * 60,
  freeFlowSeconds: 18 * 60,
  distanceMeters: 5_000,
  congestion: 1.1,
  source: "Simulated traffic (offline)",
};

const baseSettings: Settings = {
  ...defaultState().settings,
  home,
};

function makePlan(): DeparturePlan {
  return buildPlan({
    commitment,
    arriveBy: new Date(2026, 6, 13, 9, 0, 0),
    estimate,
    settings: baseSettings,
    now: new Date(2026, 6, 13, 8, 20, 0),
  });
}

function mockBrowserCapabilities() {
  class MockNotification {
    static permission: NotificationPermission = "default";
    static requestPermission = vi.fn(async () => {
      MockNotification.permission = "granted";
      return "granted" as NotificationPermission;
    });

    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {}
  }
  vi.stubGlobal("Notification", MockNotification);

  const geolocation = {
    getCurrentPosition: vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 37.7599,
          longitude: -122.4148,
          accuracy: 24,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    }),
    watchPosition: vi.fn(() => 1),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: geolocation,
  });

  class MockAudioContext {
    currentTime = 0;
    destination = {};
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect() {
          return this;
        },
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0 },
        connect(target: unknown) {
          return target as { connect: () => unknown };
        },
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    close = vi.fn(async () => undefined);
  }
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:departure-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}

describe("button interaction coverage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    mockBrowserCapabilities();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("switches authentication modes and wires the Google sign-in button", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () =>
              config.callback({
                access_token: "account-token",
                scope: config.scope,
              }),
          }),
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            sub: "button-user",
            email: "button-user@example.com",
            email_verified: true,
            name: "Button User",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<AuthPanel onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.getByRole("heading", { name: "Create your Departure account" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(onAuthenticated).toHaveBeenCalledWith(
        expect.objectContaining({ email: "button-user@example.com" }),
      ),
    );
  });

  it("wires calendar connect, import, close, cancel, and disconnect buttons", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const future = new Date(Date.now() + 24 * 60 * 60_000);
    const futureEnd = new Date(future.getTime() + 60 * 60_000);
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () =>
              config.callback({
                access_token: "calendar-token",
                scope: config.scope,
              }),
          }),
          revoke: vi.fn((_token, done) => done()),
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("googleapis.com/calendar")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "google-button-event",
                  summary: "Google button event",
                  location: "37.3438,-121.9203",
                  start: { dateTime: future.toISOString() },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url === "/.netlify/functions/apple-calendar") {
          return new Response(
            JSON.stringify({
              sourceLabel: "Apple Calendar",
              ics: calendarFile(future, futureEnd),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const { rerender } = render(
      <CalendarConnectors
        connections={[]}
        fallbackDestination={campus}
        onImport={onImport}
        onDisconnect={onDisconnect}
        onError={onError}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect Google" }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        "google",
        expect.any(Array),
        expect.objectContaining({ authMode: "google-oauth" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Connect Apple" }));
    await user.click(
      screen.getByRole("button", { name: "Close Apple Calendar connection" }),
    );
    expect(screen.queryByRole("dialog", { name: "Connect Apple Calendar" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect Apple" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Connect Apple Calendar" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect Apple" }));
    await user.type(screen.getByLabelText("Apple Account email"), "student@icloud.com");
    await user.type(screen.getByLabelText("App-specific password"), "abcd-efgh-ijkl");
    await user.click(screen.getByRole("button", { name: "Connect calendar" }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        "apple",
        expect.any(Array),
        expect.objectContaining({ authMode: "apple-connector" }),
      ),
    );

    const googleFileInput = screen.getByLabelText(
      "Choose Google Calendar .ics file",
    ) as HTMLInputElement;
    const appleFileInput = screen.getByLabelText(
      "Choose Apple Calendar .ics file",
    ) as HTMLInputElement;
    const googleFileClick = vi.spyOn(googleFileInput, "click");
    const appleFileClick = vi.spyOn(appleFileInput, "click");
    await user.click(
      screen.getByRole("button", { name: "Import Google Calendar .ics file" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Import Apple Calendar .ics file" }),
    );
    expect(googleFileClick).toHaveBeenCalledOnce();
    expect(appleFileClick).toHaveBeenCalledOnce();

    const calendarText = calendarFile(future, futureEnd);
    const googleFile = new File([calendarText], "google-events.ics", {
      type: "text/calendar",
    });
    const appleFile = new File([calendarText], "apple-events.ics", {
      type: "text/calendar",
    });
    Object.defineProperty(googleFile, "text", {
      configurable: true,
      value: async () => calendarText,
    });
    Object.defineProperty(appleFile, "text", {
      configurable: true,
      value: async () => calendarText,
    });
    await user.upload(googleFileInput, googleFile);
    await user.upload(appleFileInput, appleFile);
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        "google",
        expect.any(Array),
        expect.objectContaining({ authMode: "file-upload" }),
      ),
    );
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        "apple",
        expect.any(Array),
        expect.objectContaining({ authMode: "file-upload" }),
      ),
    );

    const connected: CalendarConnection[] = [
      {
        provider: "google",
        connected: true,
        eventCount: 1,
        authMode: "google-oauth",
      },
      {
        provider: "apple",
        connected: true,
        eventCount: 1,
        authMode: "apple-connector",
      },
    ];
    rerender(
      <CalendarConnectors
        connections={connected}
        fallbackDestination={campus}
        onImport={onImport}
        onDisconnect={onDisconnect}
        onError={onError}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Disconnect Google Calendar" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Disconnect Apple Calendar" }),
    );
    expect(onDisconnect).toHaveBeenCalledWith("google");
    expect(onDisconnect).toHaveBeenCalledWith("apple");
    expect(onError).not.toHaveBeenCalled();
  });

  it("wires saved-place, alert, download, location, and history buttons", async () => {
    const user = userEvent.setup();
    const onClearPlaceHistory = vi.fn();
    render(
      <SettingsHarness
        testPlan={makePlan()}
        placeHistoryCount={1}
        onClearPlaceHistory={onClearPlaceHistory}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add home" }));
    expect(screen.getByRole("group", { name: "Set Home" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Set Home" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add home" }));
    await user.click(screen.getByRole("button", { name: "Use current location" }));
    expect(await screen.findByText("Current location")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Remove Home" }));
    expect(screen.getByRole("button", { name: "Add home" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add work" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add school" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Test sound" }));
    expect(await screen.findByText(/Sound played/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enable notifications" }));
    await waitFor(() =>
      expect(screen.getByText("Permission: granted")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("Test notification sent.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test notification" }));
    expect(await screen.findByText("Test notification sent.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(
      await screen.findByText(/Calendar reminder file downloaded/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I understand the browser may ask for location access/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Enable live checks" }));
    expect(await screen.findByRole("button", { name: "Turn off live checks" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test location check" }));
    expect(await screen.findByText(/Location check worked within about 24 m/))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn off live checks" }));
    expect(await screen.findByText("Live missed-departure checks are off."))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Forget suggestions" }));
    expect(onClearPlaceHistory).toHaveBeenCalledOnce();
  });

  it("wires learned-place choice, dismissal, search result, and preview buttons", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDismiss = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              place_id: 1,
              name: "Main Library",
              lat: "37.7789",
              lon: "-122.412",
              category: "amenity",
              type: "library",
              address: { city: "San Francisco", state: "California" },
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    render(
      <PlacePicker
        label="Destination"
        value={null}
        onChange={onChange}
        onDismissSuggestion={onDismiss}
        suggestions={[
          {
            historyId: "recent-campus",
            place: campus,
            reason: "recent",
            label: "Recent",
            useCount: 2,
            lastUsedAt: new Date().toISOString(),
          },
        ]}
      />,
    );

    const suggestions = screen.getByLabelText("Learned place suggestions");
    await user.click(within(suggestions).getByText("Campus"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "campus" }));
    await user.click(
      screen.getByRole("button", {
        name: "Hide Campus suggestion for now",
      }),
    );
    expect(onDismiss).toHaveBeenCalledWith("recent-campus");

    await user.type(screen.getByRole("combobox"), "Main Library");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const result = await screen.findByRole("option");
    await user.click(result);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringContaining("Main Library") }),
    );

    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "Main Library");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Select this place" }));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("wires Alarm action buttons and every simulation button", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onTravelModeChange = vi.fn();
    const onBrief = vi.fn();
    const plan = makePlan();
    render(
      <AlarmCard
        plan={plan}
        now={new Date(2026, 6, 13, 8, 20, 0)}
        settings={baseSettings}
        liveStatus={{ kind: "disabled" }}
        onReviewLocationConsent={onReview}
        onTravelModeChange={onTravelModeChange}
        confidence={null}
        briefing={{ supported: true, speaking: false, onBrief }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Enable live dot" }));
    expect(onReview).toHaveBeenCalledTimes(2);
    for (const mode of ["Drive", "Walk", "Bike", "Transit"] as const) {
      await user.click(screen.getByRole("button", { name: `Use ${mode}` }));
    }
    expect(onTravelModeChange).toHaveBeenCalledTimes(4);
    await user.click(screen.getByRole("button", { name: "Play morning briefing" }));
    expect(onBrief).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Add reminders" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();

    const start = vi.fn();
    const play = vi.fn();
    const pause = vi.fn();
    const exit = vi.fn();
    const setSpeed = vi.fn();
    const seek = vi.fn();
    const liveControl: ClockControl = {
      isSim: false,
      isPlaying: false,
      speed: 1,
      start,
      play,
      pause,
      seek,
      setSpeed,
      exit,
      range: null,
    };
    const { rerender } = render(
      <DemoBar control={liveControl} plan={plan} now={plan.wakeBy} />,
    );
    await user.click(screen.getByRole("button", { name: "Simulate morning" }));
    expect(start).toHaveBeenCalledOnce();

    const simControl: ClockControl = {
      ...liveControl,
      isSim: true,
      isPlaying: true,
      speed: 90,
      range: {
        startMs: plan.wakeBy.getTime(),
        endMs: plan.arriveBy.getTime(),
      },
    };
    rerender(<DemoBar control={simControl} plan={plan} now={plan.wakeBy} />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Exit simulation" }));
    for (const speed of ["30×", "90×", "240×"]) {
      await user.click(screen.getByRole("button", { name: speed }));
    }
    expect(pause).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(setSpeed).toHaveBeenCalledTimes(3);

    rerender(
      <DemoBar
        control={{ ...simControl, isPlaying: false }}
        plan={plan}
        now={plan.wakeBy}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledOnce();
  });

  it("wires commitment summary, step, option, repeat, draft, and delete buttons", async () => {
    const user = userEvent.setup();
    render(<CommitmentHarness />);

    await user.click(screen.getByRole("button", { name: /Morning class/ }));
    await user.click(screen.getByRole("button", { name: "Catch a bus / train" }));
    expect(screen.getByRole("button", { name: "Catch a bus / train" }))
      .toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Be somewhere" }));

    await user.click(screen.getByRole("tab", { name: "3 Travel & repeats" }));
    const travelModes = screen.getByRole("group", { name: "Travel mode" });
    for (const mode of ["Walk", "Bike", "Transit", "Drive"]) {
      await user.click(within(travelModes).getByRole("button", { name: mode }));
      expect(within(travelModes).getByRole("button", { name: mode }))
        .toHaveAttribute("aria-pressed", "true");
    }
    await user.click(screen.getByRole("button", { name: "One day" }));
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Sun" }));
    expect(screen.getByRole("button", { name: "Sun" }))
      .toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("tab", { name: "1 What & when" }))
      .toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "3 Travel & repeats" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Delete commitment" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New commitment" }));
    await user.click(screen.getByRole("button", { name: /New commitment Draft/ }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: /New commitment Draft/ }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Morning class/ }));
    await user.click(screen.getByRole("button", { name: "Delete commitment" }));
    expect(screen.getByText("Your schedule is clear")).toBeInTheDocument();
  });
});

function SettingsHarness({
  testPlan,
  placeHistoryCount,
  onClearPlaceHistory,
}: {
  testPlan: DeparturePlan;
  placeHistoryCount: number;
  onClearPlaceHistory: () => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    ...defaultState().settings,
    soundEnabled: true,
  });
  return (
    <SettingsPanel
      settings={settings}
      testPlan={testPlan}
      onChange={setSettings}
      placeHistoryCount={placeHistoryCount}
      onClearPlaceHistory={onClearPlaceHistory}
    />
  );
}

function CommitmentHarness() {
  const [commitments, setCommitments] = useState<Commitment[]>([commitment]);
  return (
    <CommitmentForm
      commitments={commitments}
      onChange={setCommitments}
      placeSuggestions={[]}
      searchBias={home}
      onPlaceSelected={() => undefined}
      onDismissPlaceSuggestion={() => undefined}
    />
  );
}

function calendarFile(start: Date, end: Date): string {
  const utc = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:apple-button-event@example.com",
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    "SUMMARY:Apple button event",
    "LOCATION:37.3438,-121.9203",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
