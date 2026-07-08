import { isoDate, MINUTES_PER_DAY, nextOccurrence } from "./time";
import type {
  Commitment,
  Place,
  ScheduleItemType,
  Settings,
  TestDifficulty,
  Weekday,
} from "./types";

const MS_PER_MIN = 60_000;
const DEFAULT_STUDY_DESTINATION: Place = {
  id: "study-spot",
  label: "Study spot",
  lat: 0,
  lng: 0,
};

export interface ScheduleOccurrence {
  commitment: Commitment;
  arriveBy: Date;
}

export interface ScheduleContext {
  occurrence: ScheduleOccurrence;
  previous?: ScheduleOccurrence;
  origin: Place;
  originLabel: string;
  isFirstClassOfDay: boolean;
  usesWake: boolean;
  gapMinutes?: number;
  impossibleTransition?: boolean;
}

export interface StudyPlanInput {
  relatedClassId?: string;
  title: string;
  testDate: string;
  testTimeMinutes: number;
  targetStudyMinutes: number;
  difficulty: TestDifficulty;
  now?: Date;
}

export function itemType(commitment: Commitment): ScheduleItemType {
  return commitment.itemType ?? "event";
}

export function isClassItem(commitment: Commitment): boolean {
  return itemType(commitment) === "class";
}

export function isStudyItem(commitment: Commitment): boolean {
  return itemType(commitment) === "study";
}

export function isTestItem(commitment: Commitment): boolean {
  return itemType(commitment) === "test";
}

export function isTestLikeTitle(title: string): boolean {
  return /\b(test|quiz|exam|midterm|final)\b/i.test(title);
}

export function displayItemKind(commitment: Commitment): string {
  switch (itemType(commitment)) {
    case "class":
      return "Class";
    case "test":
      return "Test";
    case "study":
      return "Study";
    default:
      return "Event";
  }
}

export function displayDestination(commitment: Commitment): string {
  const building = commitment.buildingName || commitment.destination.label;
  return commitment.room ? `${building} · ${commitment.room}` : building;
}

export function occurrencesOnDate(
  commitments: Commitment[],
  date: Date,
  settings?: Settings,
): ScheduleOccurrence[] {
  const start = startOfDay(date);
  const end = new Date(start.getTime() + MINUTES_PER_DAY * MS_PER_MIN);
  return commitments
    .filter(isPlannable)
    .map((commitment) => {
      const arriveBy = occurrenceForDate(commitment, start);
      return arriveBy ? { commitment, arriveBy } : null;
    })
    .filter((item): item is ScheduleOccurrence => Boolean(item))
    .filter((item) => item.arriveBy >= start && item.arriveBy < end)
    .filter((item) =>
      isOccurrenceAllowedOnDate(item.commitment, item.arriveBy, settings),
    )
    .sort((a, b) => a.arriveBy.getTime() - b.arriveBy.getTime());
}

export function upcomingOccurrences(
  commitments: Commitment[],
  from: Date,
  limit = 6,
  settings?: Settings,
): ScheduleOccurrence[] {
  return commitments
    .filter(isPlannable)
    .map((commitment) => {
      const arriveBy = nextAllowedOccurrence(commitment, from, settings);
      return arriveBy ? { commitment, arriveBy } : null;
    })
    .filter((item): item is ScheduleOccurrence => Boolean(item))
    .sort((a, b) => a.arriveBy.getTime() - b.arriveBy.getTime())
    .slice(0, limit);
}

export function scheduleContextForNext(
  commitments: Commitment[],
  settings: Settings,
  now: Date,
  originOverride?: Place | null,
): ScheduleContext | null {
  const [occurrence] = upcomingOccurrences(commitments, now, 1, settings);
  if (!occurrence) return null;

  const today = occurrencesOnDate(commitments, occurrence.arriveBy, settings);
  const index = today.findIndex((item) => item.commitment.id === occurrence.commitment.id);
  const previous = index > 0 ? today[index - 1] : undefined;
  const isFirstClassOfDay =
    isClassItem(occurrence.commitment) &&
    !today
      .slice(0, Math.max(index, 0))
      .some((item) => isClassItem(item.commitment));
  const origin = originOverride ?? originForOccurrence(occurrence, previous, settings);
  const gapMinutes = previous
    ? Math.round((occurrence.arriveBy.getTime() - previous.arriveBy.getTime()) / MS_PER_MIN)
    : undefined;

  return {
    occurrence,
    previous,
    origin,
    originLabel: originOverride ? "Current location" : origin.label,
    isFirstClassOfDay,
    usesWake: isFirstClassOfDay,
    gapMinutes,
  };
}

export function createTestAndStudyItems(
  commitments: Commitment[],
  settings: Settings,
  input: StudyPlanInput,
  makeId: (prefix?: string) => string,
): Commitment[] {
  const now = input.now ?? new Date();
  const relatedClass = input.relatedClassId
    ? commitments.find((item) => item.id === input.relatedClassId)
    : undefined;
  const testId = makeId("test");
  const targetStudyMinutes = Math.max(30, Math.round(input.targetStudyMinutes));
  const destination =
    relatedClass?.destination ?? settings.campus ?? settings.home ?? DEFAULT_STUDY_DESTINATION;
  const title = input.title.trim() || `${relatedClass?.title ?? "Class"} test`;
  const test: Commitment = {
    id: testId,
    title,
    itemType: "test",
    courseId: relatedClass?.courseId,
    room: relatedClass?.room,
    buildingName: relatedClass?.buildingName,
    destination,
    travelMode: relatedClass?.travelMode ?? "walk",
    arriveByMinutes: input.testTimeMinutes,
    days: [],
    oneOffDate: input.testDate,
    enabled: true,
    originStrategy: "previous",
    test: {
      relatedClassId: relatedClass?.id,
      testDate: input.testDate,
      targetStudyMinutes,
      difficulty: input.difficulty,
    },
  };

  const studyItems = generateStudySessions(
    [...commitments, test],
    settings,
    test,
    targetStudyMinutes,
    makeId,
    now,
  );

  return [...commitments, test, ...studyItems];
}

export function createStudySessionsForTest(
  commitments: Commitment[],
  settings: Settings,
  test: Commitment,
  makeId: (prefix?: string) => string,
  now = new Date(),
): Commitment[] {
  if (!isTestItem(test)) return commitments;
  const existing = commitments.filter(
    (item) => isStudyItem(item) && item.study?.relatedTestId === test.id,
  );
  const alreadyPlanned = existing.reduce(
    (total, item) => total + (item.study?.plannedMinutes ?? 0),
    0,
  );
  const target = Math.max(
    30,
    test.test?.targetStudyMinutes ?? settings.defaultStudyMinutes ?? 180,
  );
  const remaining = Math.max(0, target - alreadyPlanned);
  if (remaining === 0) return commitments;

  const studyItems = generateStudySessions(
    commitments,
    settings,
    test,
    remaining,
    makeId,
    now,
  );
  return [...commitments, ...studyItems];
}

export function rescheduleStudySession(
  commitments: Commitment[],
  settings: Settings,
  study: Commitment,
  now = new Date(),
): Commitment {
  if (!isStudyItem(study)) return study;
  const plannedMinutes = study.study?.plannedMinutes ?? 45;
  const latestStart = settings.avoidStudyAfterMinutes ?? 21 * 60;
  const withoutStudy = commitments.filter((item) => item.id !== study.id);
  const cursor = laterCursorForStudy(study, now);

  for (let offset = 0; offset <= 14; offset++) {
    const date = startOfDay(cursor);
    date.setDate(date.getDate() + offset);
    const gaps = freeGapsForDate(withoutStudy, date, latestStart, settings);
    for (const gap of gaps) {
      if (gap.endMinutes - gap.startMinutes < plannedMinutes) continue;
      const start = atMinutes(date, gap.startMinutes);
      if (start.getTime() <= cursor.getTime()) continue;
      return {
        ...study,
        oneOffDate: isoDate(date),
        arriveByMinutes: gap.startMinutes,
        enabled: true,
        study: study.study
          ? { ...study.study, status: "planned" }
          : study.study,
      };
    }
  }

  return {
    ...study,
    study: study.study ? { ...study.study, status: "planned" } : study.study,
  };
}

function originForOccurrence(
  occurrence: ScheduleOccurrence,
  previous: ScheduleOccurrence | undefined,
  settings: Settings,
): Place {
  if (occurrence.commitment.originStrategy === "home") {
    return settings.home ?? settings.campus ?? previous?.commitment.destination ?? occurrence.commitment.destination;
  }
  if (occurrence.commitment.originStrategy === "campus") {
    return settings.campus ?? settings.home ?? previous?.commitment.destination ?? occurrence.commitment.destination;
  }
  if (previous) return previous.commitment.destination;
  return settings.home ?? settings.campus ?? occurrence.commitment.destination;
}

function generateStudySessions(
  commitments: Commitment[],
  settings: Settings,
  test: Commitment,
  targetMinutes: number,
  makeId: (prefix?: string) => string,
  now: Date,
): Commitment[] {
  const maxSession = Math.max(25, settings.maxStudySessionMinutes ?? 60);
  const targetSessions = Math.max(
    1,
    Math.round(settings.targetStudySessions ?? Math.ceil(targetMinutes / maxSession)),
  );
  const preferredSession = Math.min(
    maxSession,
    Math.max(25, Math.ceil(targetMinutes / targetSessions)),
  );
  const latestStart = settings.avoidStudyAfterMinutes ?? 21 * 60;
  const studyDestination = settings.campus ?? settings.home ?? DEFAULT_STUDY_DESTINATION;
  const sessions: Commitment[] = [];
  let remaining = targetMinutes;
  const [year, month, day] = (test.oneOffDate ?? isoDate(now)).split("-").map(Number);
  const testDate = new Date(year ?? now.getFullYear(), (month ?? 1) - 1, day ?? 1);

  for (let offset = 1; offset <= 10 && remaining > 0; offset++) {
    const date = new Date(testDate);
    date.setDate(testDate.getDate() - offset);
    if (date < startOfDay(now)) break;
    if (!isStudyEligibleDate(date, settings)) continue;
    const gaps = freeGapsForDate(commitments, date, latestStart, settings);
    for (const gap of gaps) {
      if (remaining <= 0) break;
      const available = gap.endMinutes - gap.startMinutes;
      if (available < 25) continue;
      const plannedMinutes = Math.min(
        maxSession,
        remaining,
        available,
        Math.max(25, Math.min(preferredSession, remaining)),
      );
      sessions.push({
        id: makeId("study"),
        title: studyTitle(test),
        itemType: "study",
        courseId: test.courseId,
        destination: studyDestination,
        travelMode: "walk",
        arriveByMinutes: gap.startMinutes,
        days: [],
        oneOffDate: isoDate(date),
        enabled: true,
        originStrategy: "previous",
        study: {
          relatedTestId: test.id,
          relatedClassId: test.test?.relatedClassId,
          testTitle: test.title,
          testDate: test.oneOffDate ?? test.test?.testDate,
          plannedMinutes,
          status: "planned",
        },
      });
      remaining -= plannedMinutes;
    }
  }

  return sessions;
}

function freeGapsForDate(
  commitments: Commitment[],
  date: Date,
  latestStart: number,
  settings?: Settings,
): Array<{ startMinutes: number; endMinutes: number }> {
  const busy = occurrencesOnDate(commitments, date, settings)
    .map((item) => {
      const start = item.commitment.arriveByMinutes;
      const duration = itemType(item.commitment) === "study"
        ? item.commitment.study?.plannedMinutes ?? 45
        : 55;
      return {
        start,
        end: Math.min(MINUTES_PER_DAY, start + duration),
      };
    })
    .sort((a, b) => a.start - b.start);
  const windows: Array<{ startMinutes: number; endMinutes: number }> = [];
  let cursor = 8 * 60;
  const dayEnd = Math.min(latestStart, 21 * 60);
  for (const block of busy) {
    if (block.start - cursor >= 25) {
      windows.push({
        startMinutes: cursor,
        endMinutes: Math.min(block.start, dayEnd),
      });
    }
    cursor = Math.max(cursor, block.end + 10);
  }
  if (dayEnd - cursor >= 25) {
    windows.push({ startMinutes: cursor, endMinutes: dayEnd });
  }
  return windows.filter((window) => window.endMinutes > window.startMinutes);
}

function isPlannable(commitment: Commitment): boolean {
  return (
    commitment.enabled &&
    !commitment.source?.needsLocationReview &&
    (!isStudyItem(commitment) || (commitment.study?.status ?? "planned") === "planned")
  );
}

function occurrenceForDate(commitment: Commitment, date: Date): Date | null {
  if (commitment.oneOffDate && commitment.days.length === 0) {
    if (commitment.oneOffDate !== isoDate(date)) return null;
    return atMinutes(date, commitment.arriveByMinutes);
  }

  if (!commitment.days.includes(date.getDay() as Weekday)) return null;
  return atMinutes(date, commitment.arriveByMinutes);
}

function nextAllowedOccurrence(
  commitment: Commitment,
  from: Date,
  settings?: Settings,
): Date | null {
  if (!settings?.semester) return nextOccurrence(commitment, from);

  if (commitment.oneOffDate && commitment.days.length === 0) {
    const arriveBy = nextOccurrence(commitment, from);
    if (!arriveBy) return null;
    return isOccurrenceAllowedOnDate(commitment, arriveBy, settings)
      ? arriveBy
      : null;
  }

  const cursor = startOfDay(from);
  for (let offset = 0; offset <= 370; offset++) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + offset);
    const arriveBy = occurrenceForDate(commitment, date);
    if (
      arriveBy &&
      arriveBy >= from &&
      isOccurrenceAllowedOnDate(commitment, arriveBy, settings)
    ) {
      return arriveBy;
    }
  }
  return null;
}

function isOccurrenceAllowedOnDate(
  commitment: Commitment,
  date: Date,
  settings?: Settings,
): boolean {
  if (commitment.oneOffDate && commitment.days.length === 0) return true;
  if (!settings?.semester) return true;

  const day = isoDate(date);
  if (!isDateInSemester(day, settings)) return false;
  if (isHoliday(day, settings)) return false;
  return !(isClassItem(commitment) && isFinalsWeek(day, settings));
}

function isStudyEligibleDate(date: Date, settings: Settings): boolean {
  const day = isoDate(date);
  if (!isDateInSemester(day, settings)) return false;
  return !isHoliday(day, settings);
}

function isDateInSemester(day: string, settings: Settings): boolean {
  const semester = settings.semester;
  if (!semester) return true;
  if (semester.startDate && day < semester.startDate) return false;
  if (semester.endDate && day > semester.endDate) return false;
  return true;
}

function isHoliday(day: string, settings: Settings): boolean {
  return Boolean(settings.semester?.holidays?.includes(day));
}

function isFinalsWeek(day: string, settings: Settings): boolean {
  const semester = settings.semester;
  return Boolean(
    semester?.finalsStartDate &&
      semester.finalsEndDate &&
      day >= semester.finalsStartDate &&
      day <= semester.finalsEndDate,
  );
}

function atMinutes(date: Date, minutes: number): Date {
  const d = startOfDay(date);
  d.setMinutes(minutes);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function studyTitle(test: Commitment): string {
  const base = test.courseId || test.title.replace(/\b(test|quiz|exam|midterm|final)\b/gi, "").trim();
  return `Study ${base || test.title}`;
}

function laterCursorForStudy(study: Commitment, now: Date): Date {
  const original = study.oneOffDate
    ? atMinutes(new Date(`${study.oneOffDate}T00:00:00`), study.arriveByMinutes)
    : now;
  return new Date(Math.max(now.getTime(), original.getTime()) + MS_PER_MIN);
}
