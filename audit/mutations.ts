import { v, ConvexError } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { getCurrentUser } from "../helpers.ts";

const AUDIT_EVENT_TYPE = v.union(
  v.literal("seller_auction_consent"),
  v.literal("bidder_auction_consent"),
  v.literal("winner_purchase_confirm"),
  v.literal("bid_placed"),
  v.literal("auction_created"),
  v.literal("auction_ended"),
  v.literal("auction_cancelled")
);

/**
 * Log an audit event from the frontend (consent events).
 * The frontend passes IP/userAgent collected client-side.
 */
export const logConsent = mutation({
  args: {
    eventType: AUDIT_EVENT_TYPE,
    auctionId: v.optional(v.id("auctions")),
    consentText: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    // Validate input lengths to prevent abuse
    if (args.consentText.length > 10000) throw new ConvexError({ code: "BAD_REQUEST", message: "نص الموافقة طويل جداً" });
    if (args.userAgent && args.userAgent.length > 500) throw new ConvexError({ code: "BAD_REQUEST", message: "User-Agent غير صالح" });
    if (args.ipAddress && args.ipAddress.length > 45) throw new ConvexError({ code: "BAD_REQUEST", message: "IP غير صالح" });
    if (args.metadata && args.metadata.length > 2000) throw new ConvexError({ code: "BAD_REQUEST", message: "Metadata طويلة جداً" });

    const user = await getCurrentUser(ctx);

    return await ctx.db.insert("auditLogs", {
      userId: user._id,
      eventType: args.eventType,
      auctionId: args.auctionId,
      consentText: args.consentText,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
  },
});

/**
 * Internal mutation to log audit events from other backend functions.
 * Used by auction mutations to auto-log bid/create/end/cancel events.
 */
export const logEvent = internalMutation({
  args: {
    userId: v.id("users"),
    eventType: AUDIT_EVENT_TYPE,
    auctionId: v.optional(v.id("auctions")),
    consentText: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      userId: args.userId,
      eventType: args.eventType,
      auctionId: args.auctionId,
      consentText: args.consentText,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
  },
});
