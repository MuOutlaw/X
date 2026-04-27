/**
 * Auction operating hours (Saudi Arabia time, UTC+3)
 *
 * Open 24 hours: Sunday, Monday, Wednesday, Thursday, Friday
 * CLOSED: Tuesday & Saturday
 */

/** Convert UTC Date to Saudi Arabia day */
function toSaudiDay(date: Date): number {
  // Saudi Arabia is UTC+3
  const saudiMs = date.getTime() + 3 * 60 * 60 * 1000;
  return new Date(saudiMs).getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
}

/** Days that are closed */
const CLOSED_DAYS = new Set([2, 6]); // Tuesday=2, Saturday=6

/** Check if a given UTC Date falls within auction operating hours */
export function isWithinAuctionHours(date?: Date): boolean {
  const d = date ?? new Date();
  const day = toSaudiDay(d);
  return !CLOSED_DAYS.has(day);
}

/** Day names in Arabic */
const DAY_NAMES_AR: Record<number, string> = {
  0: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
};

/** Get next opening time description in Arabic */
export function getNextOpeningInfo(date?: Date): {
  isOpen: boolean;
  nextOpenDay: string;
  nextOpenTime: string;
  currentDayAr: string;
} {
  const d = date ?? new Date();
  const day = toSaudiDay(d);
  const currentDayAr = DAY_NAMES_AR[day];

  if (!CLOSED_DAYS.has(day)) {
    return { isOpen: true, nextOpenDay: currentDayAr, nextOpenTime: "", currentDayAr };
  }

  // Find next open day
  for (let offset = 1; offset <= 7; offset++) {
    const nextDay = (day + offset) % 7;
    if (!CLOSED_DAYS.has(nextDay)) {
      return {
        isOpen: false,
        nextOpenDay: DAY_NAMES_AR[nextDay],
        nextOpenTime: "١٢:٠٠ص",
        currentDayAr,
      };
    }
  }

  return { isOpen: false, nextOpenDay: "", nextOpenTime: "", currentDayAr };
}

/** Full schedule for display purposes */
export const AUCTION_SCHEDULE_DISPLAY = [
  { day: "الأحد", hours: "مفتوح ٢٤ ساعة" },
  { day: "الاثنين", hours: "مفتوح ٢٤ ساعة" },
  { day: "الثلاثاء", hours: "مغلق" },
  { day: "الأربعاء", hours: "مفتوح ٢٤ ساعة" },
  { day: "الخميس", hours: "مفتوح ٢٤ ساعة" },
  { day: "الجمعة", hours: "مفتوح ٢٤ ساعة" },
  { day: "السبت", hours: "مغلق" },
];
