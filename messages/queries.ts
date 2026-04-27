import { query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Get all conversations for the current user
export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "المستخدم غير موجود", code: "NOT_FOUND" });

    // Get conversations where user is a participant
    const allConversations = await ctx.db.query("conversations").collect();
    const myConversations = allConversations.filter((c) =>
      c.participantIds.includes(user._id)
    );

    // Sort by lastMessageAt desc
    myConversations.sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt)
    );

    // Enrich with other participant and listing info
    const enriched = await Promise.all(
      myConversations.map(async (conv) => {
        const otherId = conv.participantIds.find((id) => id !== user._id);
        const otherUser = otherId ? await ctx.db.get(otherId) : null;
        const listing = conv.listingId ? await ctx.db.get(conv.listingId) : null;
        return {
          ...conv,
          otherUser,
          listing,
          unreadCount: conv.unreadCounts[user._id] ?? 0,
        };
      })
    );

    return enriched;
  },
});

// Get messages inside a conversation
export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "غير مصرح", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "المستخدم غير موجود", code: "NOT_FOUND" });

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.participantIds.includes(user._id)) {
      throw new ConvexError({ message: "غير مصرح بالوصول", code: "FORBIDDEN" });
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_and_sentAt", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    return { messages, currentUserId: user._id, conversation };
  },
});

// Get or check a conversation by listing + other user
export const getConversationByListingAndUser = query({
  args: { listingId: v.id("listings"), otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;

    const candidates = await ctx.db
      .query("conversations")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();

    const found = candidates.find(
      (c) =>
        c.participantIds.includes(user._id) &&
        c.participantIds.includes(args.otherUserId)
    );
    return found ?? null;
  },
});

// Total unread count for current user
export const getTotalUnread = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return 0;

    const allConversations = await ctx.db.query("conversations").collect();
    const myConversations = allConversations.filter((c) =>
      c.participantIds.includes(user._id)
    );

    return myConversations.reduce((sum, c) => sum + (c.unreadCounts[user._id] ?? 0), 0);
  },
});
