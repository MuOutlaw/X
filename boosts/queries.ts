import { query } from "../_generated/server";
import { v } from "convex/values";

// Get active boosts for a listing
export const getForListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const boosts = await ctx.db
      .query("boosts")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();
    return boosts.filter((b) => b.isActive && b.expiresAt > now && b.paymentStatus !== "pending");
  },
});

// Get all boosts for the current user
export const getMyBoosts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];

    const boosts = await ctx.db
      .query("boosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      boosts.map(async (b) => {
        const listing = await ctx.db.get(b.listingId);
        return { ...b, listing };
      })
    );
    return enriched;
  },
});

// Get featured listings (active boosts of featured type)
export const getFeaturedListings = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const activeBoosts = await ctx.db
      .query("boosts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter to paid featured boosts that are not expired
    const featuredBoosts = activeBoosts.filter(
      (b) =>
        b.paymentStatus === "paid" &&
        b.expiresAt > now &&
        (b.packageId.startsWith("featured") || b.packageId.startsWith("bundle"))
    );

    // Deduplicate by listingId — take the latest
    const seen = new Set<string>();
    const unique = featuredBoosts.filter((b) => {
      if (seen.has(b.listingId)) return false;
      seen.add(b.listingId);
      return true;
    });

    const listings = await Promise.all(
      unique.map((b) => ctx.db.get(b.listingId))
    );
    return listings.filter(
      (l): l is NonNullable<typeof l> => l !== null && l.status === "active"
    );
  },
});
