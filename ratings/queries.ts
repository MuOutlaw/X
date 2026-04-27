import { query } from "../_generated/server";
import { v } from "convex/values";

// Get all ratings received by a user (with rater info)
export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_ratedUser", (q) => q.eq("ratedUserId", args.userId))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      ratings.map(async (r) => {
        const rater = await ctx.db.get(r.raterId);
        const listing = r.listingId ? await ctx.db.get(r.listingId) : null;
        return { ...r, rater, listing };
      })
    );
    return enriched;
  },
});

// Check if current user has already rated a specific user
export const getMyRatingForUser = query({
  args: { ratedUserId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) return null;

    return await ctx.db
      .query("ratings")
      .withIndex("by_ratedUser_and_rater", (q) =>
        q.eq("ratedUserId", args.ratedUserId).eq("raterId", me._id)
      )
      .unique();
  },
});
