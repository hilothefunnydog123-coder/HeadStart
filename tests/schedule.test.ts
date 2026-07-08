import { describe, expect, it } from "vitest";
import {
  createStudySessionsForTest,
  createTestAndStudyItems,
  isStudyItem,
  isTestItem,
  occurrencesOnDate,
  rescheduleStudySession,
  upcomingOccurrences,
} from "../src/core/schedule";
import type { Commitment, Place, Settings } from "../src/core/types";

const home: Place = { id: "home", label: "Dorm", lat: 37.7599, lng: -122.4148 };
const campus: Place = {
  id: "campus",
  label: "Campus",
  lat: 37.4275,
  lng: -122.1697,
};
const science: Place = {
  id: "science",
  label: "Science Hall",
  lat: 37.428,
  lng: -122.17,
};
const library: Place = {
  id: "library",
  label: "Main Library",
  lat: 37.429,
  lng: -122.171,
};

const settings: Settings = {
  home,
  campus,
  favoriteBuildings: [],
  prepMinutes: 45,
  campusPrepMinutes: 5,
  campusWalkingBufferMinutes: 5,
  defaultStudyMinutes: 180,
  maxStudySessionMinutes: 60,
  targetStudySessions: 3,
  avoidStudyAfterMinutes: 21 * 60,
  semester: {
    holidays: [],
  },
  arrivalBufferMinutes: 10,
  wakeAheadMinutes: 5,
  trafficProvider: "simulated",
  apiKey: "",
  soundEnabled: false,
  notificationsEnabled: false,
  locationTrackingEnabled: false,
};

const biology: Commitment = {
  id: "bio",
  title: "Biology",
  itemType: "class",
  courseId: "BIO 101",
  destination: science,
  travelMode: "walk",
  arriveByMinutes: 9 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
  originStrategy: "previous",
};

const calculus: Commitment = {
  id: "calc",
  title: "Calculus",
  itemType: "class",
  destination: library,
  travelMode: "walk",
  arriveByMinutes: 13 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
  originStrategy: "previous",
};

describe("student schedule helpers", () => {
  it("creates a test and study sessions in open gaps without overlapping classes", () => {
    const ids = ["test-1", "study-1", "study-2", "study-3", "study-4"];
    const nextId = () => ids.shift() ?? "extra";
    const scheduled = createTestAndStudyItems(
      [biology, calculus],
      settings,
      {
        relatedClassId: biology.id,
        title: "Biology midterm",
        testDate: "2026-07-15",
        testTimeMinutes: 10 * 60,
        targetStudyMinutes: 150,
        difficulty: "standard",
        now: new Date(2026, 6, 8, 8, 0, 0),
      },
      nextId,
    );

    const test = scheduled.find(isTestItem);
    const studySessions = scheduled.filter(isStudyItem);

    expect(test).toMatchObject({
      title: "Biology midterm",
      itemType: "test",
      courseId: "BIO 101",
      oneOffDate: "2026-07-15",
    });
    expect(studySessions.length).toBeGreaterThan(0);
    expect(studySessions).toHaveLength(3);
    expect(studySessions.map((item) => item.study?.plannedMinutes)).toEqual([
      50,
      50,
      50,
    ]);
    expect(studySessions[0]?.study).toMatchObject({
      testTitle: "Biology midterm",
      testDate: "2026-07-15",
    });
    expect(
      studySessions.reduce(
        (total, item) => total + (item.study?.plannedMinutes ?? 0),
        0,
      ),
    ).toBe(150);

    for (const session of studySessions) {
      const sessionStart = session.arriveByMinutes;
      const sessionEnd = sessionStart + (session.study?.plannedMinutes ?? 0);
      const sameDayClasses = occurrencesOnDate(
        [biology, calculus],
        new Date(`${session.oneOffDate}T12:00:00`),
      );
      for (const { commitment } of sameDayClasses) {
        const classStart = commitment.arriveByMinutes;
        const classEnd = classStart + 55;
        expect(sessionEnd <= classStart || sessionStart >= classEnd).toBe(true);
      }
    }
  });

  it("adds study sessions for an existing imported test", () => {
    const importedTest: Commitment = {
      id: "imported-test",
      title: "Chem final",
      itemType: "test",
      destination: science,
      travelMode: "walk",
      arriveByMinutes: 10 * 60,
      days: [],
      oneOffDate: "2026-07-15",
      enabled: true,
      originStrategy: "previous",
      test: {
        testDate: "2026-07-15",
        targetStudyMinutes: 90,
        difficulty: "standard",
      },
      source: {
        kind: "calendar",
        provider: "google",
        externalId: "final",
        importedAt: "2026-07-08T12:00:00.000Z",
      },
    };

    const scheduled = createStudySessionsForTest(
      [biology, importedTest],
      settings,
      importedTest,
      (prefix = "id") => `${prefix}-1`,
      new Date(2026, 6, 8, 8, 0, 0),
    );

    const studySessions = scheduled.filter(isStudyItem);
    expect(studySessions.length).toBeGreaterThan(0);
    expect(
      studySessions.reduce(
        (total, item) => total + (item.study?.plannedMinutes ?? 0),
        0,
      ),
    ).toBe(90);
    expect(studySessions[0]?.study).toMatchObject({
      relatedTestId: importedTest.id,
      testTitle: "Chem final",
      testDate: "2026-07-15",
    });
  });

  it("reschedules a study session into a later open gap", () => {
    const study: Commitment = {
      id: "study",
      title: "Study Biology",
      itemType: "study",
      destination: library,
      travelMode: "walk",
      arriveByMinutes: 10 * 60,
      days: [],
      oneOffDate: "2026-07-10",
      enabled: true,
      originStrategy: "previous",
      study: {
        relatedTestId: "test",
        relatedClassId: biology.id,
        plannedMinutes: 45,
        status: "skipped",
      },
    };

    const rescheduled = rescheduleStudySession(
      [biology, calculus, study],
      settings,
      study,
      new Date(2026, 6, 10, 10, 30, 0),
    );

    expect(rescheduled.study?.status).toBe("planned");
    expect(
      new Date(`${rescheduled.oneOffDate}T00:00:00`).getTime(),
    ).toBeGreaterThanOrEqual(new Date("2026-07-10T00:00:00").getTime());
    expect(rescheduled.arriveByMinutes).toBeGreaterThan(10 * 60);
  });

  it("does not surface study sessions after they are done or skipped", () => {
    const plannedStudy: Commitment = {
      id: "study",
      title: "Study Biology",
      itemType: "study",
      destination: library,
      travelMode: "walk",
      arriveByMinutes: 11 * 60,
      days: [],
      oneOffDate: "2026-07-10",
      enabled: true,
      originStrategy: "previous",
      study: {
        relatedTestId: "test",
        relatedClassId: biology.id,
        plannedMinutes: 45,
        status: "planned",
      },
    };

    const from = new Date(2026, 6, 10, 8, 0, 0);

    expect(upcomingOccurrences([plannedStudy], from, 1)).toHaveLength(1);
    expect(
      upcomingOccurrences(
        [{ ...plannedStudy, study: { ...plannedStudy.study!, status: "done" } }],
        from,
        1,
      ),
    ).toHaveLength(0);
    expect(
      upcomingOccurrences(
        [{ ...plannedStudy, study: { ...plannedStudy.study!, status: "skipped" } }],
        from,
        1,
      ),
    ).toHaveLength(0);
  });

  it("pauses recurring classes outside the semester, on holidays, and during finals", () => {
    const termSettings: Settings = {
      ...settings,
      semester: {
        startDate: "2026-07-09",
        endDate: "2026-07-31",
        finalsStartDate: "2026-07-20",
        finalsEndDate: "2026-07-24",
        holidays: ["2026-07-10"],
      },
    };

    expect(
      occurrencesOnDate([biology], new Date(2026, 6, 8, 12), termSettings),
    ).toHaveLength(0);
    expect(
      occurrencesOnDate([biology], new Date(2026, 6, 10, 12), termSettings),
    ).toHaveLength(0);
    expect(
      occurrencesOnDate([biology], new Date(2026, 6, 13, 12), termSettings),
    ).toHaveLength(1);
    expect(
      occurrencesOnDate([biology], new Date(2026, 6, 20, 12), termSettings),
    ).toHaveLength(0);
  });
});
