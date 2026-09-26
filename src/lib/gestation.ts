/** Swine gestation-cycle math, shared by the breeding page's "Log a
 * breeding" form, the pig profile's "Gestation milestones" card, the
 * dashboard's Needs attention list, and the notification bell — so all
 * four surfaces agree on the same day counts and the same done/due/upcoming
 * states for a given breeding record. */

/** Average swine gestation length — the "3 months, 3 weeks, 3 days" rule.
 * expectedFarrowDate is always matingDate + this many days; it's never
 * entered by hand (see createBreedingAction). */
export const GESTATION_DAYS = 114;

/** Day the sow should be checked for returning to heat (meaning she didn't
 * conceive) rather than staying pregnant. */
export const PREGNANCY_CHECK_DAY = 21;
/** Day to move her into the farrowing pen ahead of the birth. */
export const MOVE_TO_PEN_DAY = 90;
/** Day to begin farrowing preparations (nesting material, supplies, etc). */
export const FARROWING_PREP_DAY = 110;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/** Whole days from `from` to `to` (positive if `to` is later), ignoring
 * time-of-day — matingDate/expectedFarrowDate are calendar-only values
 * pinned to UTC midnight (see src/lib/format.ts), so this compares them the
 * same way. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export type MilestoneState = "done" | "due" | "upcoming";

export type GestationMilestone = {
  key: "mated" | "check" | "pen" | "prep" | "farrow";
  day: number;
  label: string;
  targetDate: Date;
  state: MilestoneState;
  /** When it was actually done/confirmed — set only when state === "done". */
  doneDate: Date | null;
};

/** The subset of a breedingRecords row the milestone timeline needs. Kept
 * narrow (rather than importing the Drizzle row type) so this stays a pure,
 * dependency-free function callable from a page, an action, or a test. */
export type GestationRecordForMilestones = {
  matingDate: Date;
  actualFarrowDate: Date | null;
  status: string;
  pregnancyCheckDone: boolean;
  pregnancyCheckDate: Date | null;
  movedToFarrowingPen: boolean;
  movedToFarrowingPenDate: Date | null;
  farrowingPrepStarted: boolean;
  farrowingPrepStartedDate: Date | null;
};

/** True while a breeding record represents a pregnancy still in progress —
 * i.e. it hasn't farrowed yet and the day-21 check didn't find her back in
 * heat (which cancels the cycle). Every surface that lists "active
 * pregnancies" (the breeding page's stat tiles, the dashboard, the pig
 * profile's milestone card) should use this rather than re-deriving it, so
 * a returned-to-heat record never gets counted as still expecting. */
export function isActivePregnancy(b: { actualFarrowDate: Date | null; status: string }): boolean {
  return !b.actualFarrowDate && b.status !== "returned-to-heat";
}

/** Builds the 5-point gestation timeline (mated -> day 21 check -> day 90
 * move-to-pen -> day 110 prep -> day 114 farrow) for one breeding record,
 * classifying each future milestone as done, due (its day has arrived but
 * it hasn't been confirmed) or upcoming. Once the cycle has ended
 * (farrowed, or returned to heat) every remaining milestone reads as
 * "done" or is simply skipped by the caller — see isActivePregnancy. */
export function gestationMilestones(b: GestationRecordForMilestones, today: Date = new Date()): GestationMilestone[] {
  const checkDate = addDays(b.matingDate, PREGNANCY_CHECK_DAY);
  const penDate = addDays(b.matingDate, MOVE_TO_PEN_DAY);
  const prepDate = addDays(b.matingDate, FARROWING_PREP_DAY);
  const farrowDate = addDays(b.matingDate, GESTATION_DAYS);

  const state = (targetDate: Date, done: boolean): MilestoneState => {
    if (done) return "done";
    return today.getTime() >= targetDate.getTime() ? "due" : "upcoming";
  };

  return [
    { key: "mated", day: 0, label: "Mated", targetDate: b.matingDate, state: "done", doneDate: b.matingDate },
    {
      key: "check",
      day: PREGNANCY_CHECK_DAY,
      label: "Confirm pregnancy",
      targetDate: checkDate,
      state: state(checkDate, b.pregnancyCheckDone),
      doneDate: b.pregnancyCheckDate,
    },
    {
      key: "pen",
      day: MOVE_TO_PEN_DAY,
      label: "Move to farrowing pen",
      targetDate: penDate,
      state: state(penDate, b.movedToFarrowingPen),
      doneDate: b.movedToFarrowingPenDate,
    },
    {
      key: "prep",
      day: FARROWING_PREP_DAY,
      label: "Begin farrowing prep",
      targetDate: prepDate,
      state: state(prepDate, b.farrowingPrepStarted),
      doneDate: b.farrowingPrepStartedDate,
    },
    {
      key: "farrow",
      day: GESTATION_DAYS,
      label: "Expected farrowing",
      targetDate: farrowDate,
      state: state(farrowDate, !!b.actualFarrowDate),
      doneDate: b.actualFarrowDate,
    },
  ];
}
