import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/core";
import App from "../src/App";
import { defaultState, STORAGE_KEY } from "../src/state/store";

function visualSignature(container: HTMLElement) {
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    shell: Boolean(container.querySelector(".app")),
    alarmCard: Boolean(container.querySelector(".alarm-card")),
    checklist: Boolean(container.querySelector(".setup-checklist")),
    confidence: container.querySelector(".confidence-label")?.textContent,
    sourceBadge: container.querySelector(".source-badge")?.textContent,
    details: Boolean(container.querySelector(".plan-details")),
    tabs: Array.from(container.querySelectorAll(".tab")).map((tab) =>
      tab.textContent?.trim(),
    ),
  };
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
}

function seedReadyState() {
  const state = defaultState();
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
          id: "standup",
          title: "Biology 101",
          itemType: "class",
          buildingName: "Science Hall",
          room: "204",
          destination: {
            id: "office",
            label: "Science Hall",
            lat: 37.7946,
            lng: -122.3999,
          },
          travelMode: "walk",
          arriveByMinutes: 9 * 60,
          days: [1, 2, 3, 4, 5],
          enabled: true,
        },
      ],
    }),
  );
}

describe("visual regression contracts", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    setViewport(1280, 900);
  });

  it("keeps the alarm screen's key visual sections present", async () => {
    seedReadyState();
    const { container } = render(<App />);
    await screen.findAllByText("Biology 101");

    expect(visualSignature(container)).toMatchInlineSnapshot(`
      {
        "alarmCard": true,
        "checklist": true,
        "confidence": "On-time confidence",
        "details": true,
        "shell": true,
        "sourceBadge": "Offline simulation",
        "tabs": [
          "Now",
          "Schedule",
          "Settings",
        ],
        "viewport": "1280x900",
      }
    `);
  });

  it("keeps the mobile alarm screen's key visual sections present", async () => {
    setViewport(390, 844);
    seedReadyState();
    const { container } = render(<App />);
    await screen.findAllByText("Biology 101");

    expect(visualSignature(container)).toMatchInlineSnapshot(`
      {
        "alarmCard": true,
        "checklist": true,
        "confidence": "On-time confidence",
        "details": true,
        "shell": true,
        "sourceBadge": "Offline simulation",
        "tabs": [
          "Now",
          "Schedule",
          "Settings",
        ],
        "viewport": "390x844",
      }
    `);
  });

  it("keeps the settings reliability controls visible", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Settings" }));

    expect(screen.getByText("Test alerts")).toBeInTheDocument();
    expect(screen.getByText("Saved places")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add home/dorm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add school/campus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test sound" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test location check" })).toBeInTheDocument();
  });
});
