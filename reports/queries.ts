import { query } from "../_generated/server";
import { v } from "convex/values";

// Check if current user already reported a listing
export const hasReportedListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) return false;

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target_listing", (q) => q.eq("targetListingId", args.listingId))
      .filter((q) => q.eq(q.field("reporterId"), me._id))
      .first();

    return !!existing;
  },
});

// Check if current user already reported a user
export const hasReportedUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) return false;

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target_user", (q) => q.eq("targetUserId", args.userId))
      .filter((q) => q.eq(q.field("reporterId"), me._id))
      .first();

    return !!existing;
  },
});
