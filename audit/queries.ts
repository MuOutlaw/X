import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdmin } from "../helpers.ts";

/**
 * Get audit logs for a specific auction (admin only).
 */
export const getByAuction = query({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .collect();

    // Enrich with user names
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: user?.name ?? "مستخدم محذوف",
          userPhone: user?.phone,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get audit logs for a specific user (admin only).
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);

    // Enrich with auction titles
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const auction = log.auctionId ? await ctx.db.get(log.auctionId) : null;
        return {
          ...log,
          auctionTitle: auction?.title ?? null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Check if user has already given consent for a specific event type on a specific auction.
 */
export const hasConsent = query({
  args: {
    auctionId: v.id("auctions"),
    eventType: v.union(
      v.literal("seller_auction_consent"),
      v.literal("bidder_auction_consent"),
      v.literal("winner_purchase_confirm")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return false;

    const existing = await ctx.db
      .query("auditLogs")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), user._id),
          q.eq(q.field("eventType"), args.eventType)
        )
      )
      .first();

    return existing !== null;
  },
});
