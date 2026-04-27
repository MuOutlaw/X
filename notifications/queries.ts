import { query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const getMyNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with actor info
    const enriched = await Promise.all(
      notifications.map(async (n) => {
        const actor = n.actorId ? await ctx.db.get(n.actorId) : null;
        const listing = n.listingId ? await ctx.db.get(n.listingId) : null;
        return {
          ...n,
          actorName: actor?.name ?? null,
          actorAvatar: actor?.avatarUrl ?? null,
          listingTitle: listing?.title ?? null,
        };
      })
    );

    return enriched;
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_isRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    return unread.length;
  },
});
