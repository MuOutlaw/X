import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api.js";

/**
 * Process auction status transitions:
 * - scheduled -> active (if startTime has passed)
 * - active -> ended (if endTime has passed)
 *
 * Runs via cron every 1 minute.
 */
export const processAuctionStatuses = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = new Date().toISOString();

    // Open scheduled auctions whose start time has passed
    const scheduledAuctions = await ctx.db
      .query("auctions")
      .withIndex("by_status", (q) => q.eq("status", "scheduled"))
      .collect();

    for (const auction of scheduledAuctions) {
      if (auction.startTime <= now) {
        await ctx.db.patch(auction._id, { status: "active" });
      }
    }

    // Close active auctions whose end time has passed
    const activeAuctions = await ctx.db
      .query("auctions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const auction of activeAuctions) {
      if (auction.endTime <= now) {
        await ctx.db.patch(auction._id, { status: "ended" });

        // Audit log: auction ended
        await ctx.scheduler.runAfter(0, internal.audit.mutations.logEvent, {
          userId: auction.creatorId,
          eventType: "auction_ended" as const,
          auctionId: auction._id,
          metadata: JSON.stringify({
            finalPrice: auction.currentPrice,
            winnerId: auction.highestBidderId ?? null,
            bidCount: auction.bidCount,
          }),
        });
      }
    }
  },
});
