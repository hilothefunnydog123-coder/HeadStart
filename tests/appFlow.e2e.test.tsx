import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/core";
import App from "../src/App";

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

    expect(await screen.findByText("Morning reliability checklist")).toBeInTheDocument();

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
