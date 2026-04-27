import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process auction status transitions every 1 minute
crons.interval(
  "process auction statuses",
  { minutes: 1 },
  internal.auctions.internals.processAuctionStatuses
);

export default crons;
