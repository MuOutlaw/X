import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api.js";
import { isWithinAuctionHours } from "./schedule.ts";
import { checkAuctionRateLimit, checkBidRateLimit, checkContentSpam } from "../spam_protection.ts";

/** Create a new auction — only verified users */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    images: v.array(v.string()),
    category: v.string(),
    city: v.string(),
    startingPrice: v.number(),
    minBidIncrement: v.number(),
    startTime: v.string(),
    endTime: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
    }

    if (!user.phoneVerified) {
      throw new ConvexError({ code: "FORBIDDEN", message: "يجب توثيق رقم جوالك أولاً قبل إنشاء مزاد" });
    }

    if (!user.isVerified) {
      throw new ConvexError({ code: "FORBIDDEN", message: "يجب توثيق حسابك أولاً لإنشاء مزاد" });
    }

    // Check auction operating hours
    if (!isWithinAuctionHours()) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "المزادات متاحة فقط في أوقات العمل الرسمية. يرجى المحاولة في الأوقات المحددة",
      });
    }

    // Validate times
    const start = new Date(args.startTime).getTime();
    const end = new Date(args.endTime).getTime();
    const now = Date.now();

    if (start < now - 60000) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "وقت البداية يجب أن يكون في المستقبل" });
    }
    if (end <= start) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "وقت النهاية يجب أن يكون بعد وقت البداية" });
    }
    if (args.title.trim().length < 3) throw new ConvexError({ code: "BAD_REQUEST", message: "العنوان قصير جداً" });
    if (args.title.length > 200) throw new ConvexError({ code: "BAD_REQUEST", message: "العنوان طويل جداً" });
    if (args.description.length > 5000) throw new ConvexError({ code: "BAD_REQUEST", message: "الوصف طويل جداً" });

    // Spam content & rate limit checks
    checkContentSpam(args.title, "العنوان");
    checkContentSpam(args.description, "الوصف");
    await checkAuctionRateLimit(ctx, user._id);
    if (args.startingPrice <= 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "السعر الابتدائي يجب أن يكون أكبر من صفر" });
    }
    if (args.minBidIncrement <= 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "الحد الأدنى للزيادة يجب أن يكون أكبر من صفر" });
    }

    // Determine initial status
    const status = start <= now ? "active" : "scheduled";

    const auctionId = await ctx.db.insert("auctions", {
      creatorId: user._id,
      title: args.title,
      description: args.description,
      images: args.images,
      category: args.category,
      city: args.city,
      startingPrice: args.startingPrice,
      minBidIncrement: args.minBidIncrement,
      currentPrice: args.startingPrice,
      bidCount: 0,
      startTime: args.startTime,
      endTime: args.endTime,
      status,
      createdAt: new Date().toISOString(),
    });

    // Audit log: auction created
    await ctx.scheduler.runAfter(0, internal.audit.mutations.logEvent, {
      userId: user._id,
      eventType: "auction_created",
      auctionId,
      metadata: JSON.stringify({
        title: args.title,
        startingPrice: args.startingPrice,
        startTime: args.startTime,
        endTime: args.endTime,
      }),
    });

    return auctionId;
  },
});

/** Place a bid on an active auction */
export const placeBid = mutation({
  args: {
    auctionId: v.id("auctions"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
    }

    // Require phone verification to place bids
    if (!user.phoneVerified) {
      throw new ConvexError({ code: "FORBIDDEN", message: "يجب توثيق رقم جوالك أولاً قبل المزايدة" });
    }

    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المزاد غير موجود" });
    }

    // Check auction is active
    if (auction.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "المزاد غير نشط حالياً" });
    }

    // Require an active live stream to place bids
    const liveStream = await ctx.db
      .query("liveStreams")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .filter((q) => q.eq(q.field("status"), "live"))
      .first();
    if (!liveStream) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "المزايدة متاحة فقط أثناء البث المباشر. انتظر حتى يبدأ البائع البث." });
    }

    // Check auction operating hours
    if (!isWithinAuctionHours()) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "المزايدة متاحة فقط في أوقات العمل الرسمية",
      });
    }

    // Check time bounds
    const now = Date.now();
    const endMs = new Date(auction.endTime).getTime();
    if (now >= endMs) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "المزاد انتهى" });
    }

    // Creator cannot bid on own auction
    if (auction.creatorId === user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "لا يمكنك المزايدة على مزادك" });
    }

    // Rate limit: bids per minute
    await checkBidRateLimit(ctx, user._id, args.auctionId);

    // Validate bid amount
    const minRequired = auction.currentPrice + auction.minBidIncrement;
    if (args.amount < minRequired) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `الحد الأدنى للمزايدة هو ${minRequired} ر.س`,
      });
    }

    // Insert bid
    await ctx.db.insert("bids", {
      auctionId: args.auctionId,
      bidderId: user._id,
      amount: args.amount,
      createdAt: new Date().toISOString(),
    });

    // Update auction
    await ctx.db.patch(args.auctionId, {
      currentPrice: args.amount,
      highestBidderId: user._id,
      bidCount: auction.bidCount + 1,
    });

    // Audit log: bid placed
    await ctx.scheduler.runAfter(0, internal.audit.mutations.logEvent, {
      userId: user._id,
      eventType: "bid_placed",
      auctionId: args.auctionId,
      metadata: JSON.stringify({ amount: args.amount, previousPrice: auction.currentPrice }),
    });

    return { success: true, newPrice: args.amount };
  },
});

/** Cancel an auction — only by creator or admin, only if scheduled */
export const cancel = mutation({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
    }

    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المزاد غير موجود" });
    }

    const isAdmin = user.role === "admin";
    const isCreator = auction.creatorId === user._id;
    if (!isAdmin && !isCreator) {
      throw new ConvexError({ code: "FORBIDDEN", message: "ليس لديك صلاحية إلغاء هذا المزاد" });
    }

    if (auction.status === "ended") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "لا يمكن إلغاء مزاد منتهي" });
    }

    await ctx.db.patch(args.auctionId, { status: "cancelled" });

    // Audit log: auction cancelled
    await ctx.scheduler.runAfter(0, internal.audit.mutations.logEvent, {
      userId: user._id,
      eventType: "auction_cancelled",
      auctionId: args.auctionId,
      metadata: JSON.stringify({ cancelledBy: isAdmin ? "admin" : "creator" }),
    });

    return { success: true };
  },
});
