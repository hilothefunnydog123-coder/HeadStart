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

function seedReadyAlarmState() {
  const state = defaultState();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const oneOffDate = tomorrow.toISOString().slice(0, 10);

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      settings: {
        ...state.settings,
        home: {
          id: "home",
          label: "Home",
          lat: 37.7599,
          lng: -122.4148,
        },
      },
      commitments: [
        {
          id: "studio",
          title: "Studio",
          destination: {
            id: "studio-place",
            label: "Studio",
            lat: 37.7946,
            lng: -122.3999,
          },
          travelMode: "drive",
          arriveByMinutes: 9 * 60,
          days: [],
          oneOffDate,
          enabled: true,
        },
      ],
    }),
  );
}

describe("app setup and commitment flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockPlaceSearch();
    mockNotifications();
    mockGeolocation();
  });

  it("shows a reliability checklist and creates a one-off commitment through search", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Where do you start your day?")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Commitments" }));
    await user.click(screen.getByRole("button", { name: "New commitment" }));
    await user.clear(screen.getByPlaceholderText("Class, practice, meeting..."));
    await user.type(screen.getByPlaceholderText("Class, practice, meeting..."), "Library work");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByPlaceholderText("Building or address"), "Main Library ");

    expect(await screen.findByText("Select this place")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select this place" }));
    await user.click(screen.getByRole("button", { name: "One day" }));

    const date = screen.getByLabelText("Date");
    expect(date).toHaveAttribute("type", "date");
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
    expect(screen.getByRole("button", { name: "Add home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add school" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add home" }));
    await user.click(screen.getByRole("button", { name: "Use current location" }));

    expect(await screen.findByText("Current location")).toBeInTheDocument();
    expect(screen.getByText("No learned places yet")).toBeInTheDocument();
    expect(screen.queryByText("Suggestions from your history")).not.toBeInTheDocument();
  });

  it("reuses an incomplete draft instead of piling up blank commitments", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commitments" }));
    const addButton = screen.getByRole("button", { name: "New commitment" });
    await user.click(addButton);
    await user.click(addButton);
    await user.click(addButton);

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByText("New commitment")).toHaveLength(2);
  });

  it("updates alarm route timing when the travel mode changes", async () => {
    seedReadyAlarmState();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("button", { name: "Use Drive" }))
      .toHaveAttribute("aria-pressed", "true");
    expect((await screen.findAllByText(/Drive ·/)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Use Bike" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Use Bike" }))
        .toHaveAttribute("aria-pressed", "true"),
    );
    expect((await screen.findAllByText(/Bike ·/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Bike timing across your morning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Walk" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Use Walk" }))
        .toHaveAttribute("aria-pressed", "true"),
    );
    expect((await screen.findAllByText(/Walk ·/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Walk timing across your morning")).toBeInTheDocument();
  });

  it("lets the user test notification and location checks from settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Test notification" }));
    expect(await screen.findByText("Test notification sent.")).toBeInTheDocument();
    expect(notificationTitles).toContain("Departure notifications are on");

    await user.click(screen.getByRole("button", { name: "Test location check" }));
    expect(
      await screen.findByText("Location check worked within about 31 m accuracy."),
    ).toBeInTheDocument();
  });
});
