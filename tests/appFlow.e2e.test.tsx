import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/core";
import App from "../src/App";
import { defaultState, STORAGE_KEY } from "../src/state/store";

const notificationTitles: string[] = [];

function mockPlaceSearch() {
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
            address: {
              road: "Market Street",
              city: "San Francisco",
              state: "California",
            },
          },
        ]),
        { status: 200 },
      ),
    ),
  );
}

function mockNotifications(permission: NotificationPermission = "default") {
  notificationTitles.length = 0;
  class MockNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      MockNotification.permission = "granted";
      return "granted" as NotificationPermission;
    });

    constructor(title: string) {
      notificationTitles.push(title);
    }
  }

  vi.stubGlobal("Notification", MockNotification);
}

function mockGeolocation() {
  const geolocation = {
    getCurrentPosition: vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 37.7599,
          longitude: -122.4148,
          accuracy: 31,
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
  return geolocation;
}

describe("app setup and schedule flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockPlaceSearch();
    mockNotifications();
    mockGeolocation();
  });

  it("shows setup guidance and creates a one-off schedule item through search", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Add your first class")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Schedule" }));
    await user.click(screen.getByRole("button", { name: "Add class or event" }));
    await user.clear(screen.getByPlaceholderText("Biology, practice, review session..."));
    await user.type(screen.getByPlaceholderText("Biology, practice, review session..."), "Library work");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByPlaceholderText("Building or address"), "Main Library ");

    expect(await screen.findByText("Select this place")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select this place" }));
    await user.click(screen.getByRole("button", { name: "One day" }));

    const dateFields = screen.getAllByLabelText("Date");
    const date = dateFields[dateFields.length - 1];
    expect(date).toBeDefined();
    expect(date!).toHaveAttribute("type", "date");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Library work/ })).toBeInTheDocument(),
    );
  });

  it("requires explicit saved places and keeps current location out of history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Settings" }));

    expect(screen.queryByText("Home — Mission District")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add home/dorm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add school/campus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add work" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add home/dorm" }));
    await user.click(screen.getByRole("button", { name: "Use current location" }));

    expect(await screen.findByText("Current location")).toBeInTheDocument();
    expect(screen.getByText("No learned buildings yet")).toBeInTheDocument();
    expect(screen.queryByText("Suggestions from your history")).not.toBeInTheDocument();
  });

  it("reuses an incomplete draft instead of piling up blank schedule items", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Schedule" }));
    const addButton = screen.getByRole("button", { name: "Add class or event" });
    await user.click(addButton);
    await user.click(addButton);
    await user.click(addButton);

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByText("New class")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Plan a test for this class" }),
    ).not.toBeInTheDocument();
  });

  it("keeps calendar connector setup neutral until credentials exist", async () => {
    const state = defaultState();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        calendarConnections: [
          {
            provider: "google",
            connected: false,
            eventCount: 0,
            error:
              "Add a Google OAuth web client ID for local testing, or set VITE_GOOGLE_CLIENT_ID in production.",
          },
          {
            provider: "apple",
            connected: false,
            eventCount: 0,
            error:
              "Apple Calendar sign-in needs a secure calendar connector backend. Import .ics for now, or set VITE_CALENDAR_CONNECTOR_URL.",
          },
        ],
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Schedule" }));
    await user.click(screen.getByText("Google Calendar or .ics files"));

    expect(screen.getByRole("button", { name: "Connect Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect Apple" })).toBeDisabled();
    expect(screen.getByText(/Add a client ID to enable Google sign-in/)).toBeInTheDocument();
    expect(screen.getByText(/Add a secure backend connector to enable/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Add a Google OAuth web client ID for local testing/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Import Google Calendar .ics file")).toHaveAttribute(
      "type",
      "file",
    );
    expect(screen.getByLabelText("Import Apple Calendar .ics file")).toHaveAttribute(
      "type",
      "file",
    );
  });

  it("lets the user test notification and location checks from settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Test notification" }));
    expect(await screen.findByText("Test notification sent.")).toBeInTheDocument();
    expect(notificationTitles).toContain("HeadStart notifications are on");

    await user.click(screen.getByRole("button", { name: "Test location check" }));
    expect(
      await screen.findByText("Location check worked within about 31 m accuracy."),
    ).toBeInTheDocument();
  });
});
