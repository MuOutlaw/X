import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

// Mark a single notification as read (ownership verified)
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "المستخدم غير موجود", code: "NOT_FOUND" });

    const notif = await ctx.db.get(args.notificationId);
    if (!notif) return;

    // Verify the notification belongs to the current user
    if (notif.userId !== user._id) {
      throw new ConvexError({ message: "غير مصرح بالوصول", code: "FORBIDDEN" });
    }

    await ctx.db.patch(args.notificationId, { isRead: true });
  },
});

// Mark all notifications as read for the current user
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_isRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { isRead: true })));
  },
});

// Delete a single notification (ownership verified)
export const deleteNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "المستخدم غير موجود", code: "NOT_FOUND" });

    const notif = await ctx.db.get(args.notificationId);
    if (!notif) return;

    // Verify the notification belongs to the current user
    if (notif.userId !== user._id) {
      throw new ConvexError({ message: "غير مصرح بالوصول", code: "FORBIDDEN" });
    }

    await ctx.db.delete(args.notificationId);
  },
});

// Clear all notifications for current user
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;

    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    await Promise.all(all.map((n) => ctx.db.delete(n._id)));
  },
});

// Internal helper to create a notification (called from other mutations)
export const createNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("new_message"),
      v.literal("new_rating"),
      v.literal("listing_saved"),
      v.literal("listing_sold"),
      v.literal("boost_expired"),
      v.literal("listing_inquiry")
    ),
    title: v.string(),
    body: v.string(),
    listingId: v.optional(v.id("listings")),
    conversationId: v.optional(v.id("conversations")),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      isRead: false,
      listingId: args.listingId,
      conversationId: args.conversationId,
      actorId: args.actorId,
      createdAt: new Date().toISOString(),
    });
  },
});
