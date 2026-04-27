import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api.js";
import { checkRatingRateLimit, checkContentSpam } from "../spam_protection.ts";

// Submit or update a rating for a user
export const submitRating = mutation({
  args: {
    ratedUserId: v.id("users"),
    score: v.number(),
    comment: v.optional(v.string()),
    listingId: v.optional(v.id("listings")),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    if (me._id === args.ratedUserId) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "لا يمكنك تقييم نفسك" });
    }

    if (args.score < 1 || args.score > 5 || !Number.isInteger(args.score)) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "التقييم يجب أن يكون عدداً صحيحاً بين 1 و 5" });
    }

    // Rate limit & content check
    await checkRatingRateLimit(ctx, me._id);
    if (args.comment) {
      checkContentSpam(args.comment, "التعليق");
    }

    const ratedUser = await ctx.db.get(args.ratedUserId);
    if (!ratedUser) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const existing = await ctx.db
      .query("ratings")
      .withIndex("by_ratedUser_and_rater", (q) =>
        q.eq("ratedUserId", args.ratedUserId).eq("raterId", me._id)
      )
      .unique();

    if (existing) {
      const oldScore = existing.score;
      await ctx.db.patch(existing._id, {
        score: args.score,
        comment: args.comment,
      });
      const newTotal = ratedUser.rating * ratedUser.ratingCount - oldScore + args.score;
      await ctx.db.patch(args.ratedUserId, {
        rating: newTotal / ratedUser.ratingCount,
      });
    } else {
      await ctx.db.insert("ratings", {
        raterId: me._id,
        ratedUserId: args.ratedUserId,
        listingId: args.listingId,
        score: args.score,
        comment: args.comment,
        createdAt: new Date().toISOString(),
      });
      const newCount = ratedUser.ratingCount + 1;
      const newRating = (ratedUser.rating * ratedUser.ratingCount + args.score) / newCount;
      await ctx.db.patch(args.ratedUserId, {
        rating: newRating,
        ratingCount: newCount,
      });

      // Notify the rated user
      const stars = "★".repeat(args.score) + "☆".repeat(5 - args.score);
      await ctx.scheduler.runAfter(0, internal.notifications.mutations.createNotification, {
        userId: args.ratedUserId,
        type: "new_rating",
        title: "تقييم جديد",
        body: `${me.name ?? "مستخدم"} أعطاك تقييم ${stars} (${args.score}/5)${args.comment ? `: ${args.comment.slice(0, 60)}` : ""}`,
        listingId: args.listingId,
        actorId: me._id,
      });
    }
  },
});

// Delete a rating (only the rater can delete their own)
export const deleteRating = mutation({
  args: { ratedUserId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const rating = await ctx.db
      .query("ratings")
      .withIndex("by_ratedUser_and_rater", (q) =>
        q.eq("ratedUserId", args.ratedUserId).eq("raterId", me._id)
      )
      .unique();
    if (!rating) throw new ConvexError({ code: "NOT_FOUND", message: "التقييم غير موجود" });

    const ratedUser = await ctx.db.get(args.ratedUserId);
    if (ratedUser && ratedUser.ratingCount > 1) {
      const newCount = ratedUser.ratingCount - 1;
      const newRating = (ratedUser.rating * ratedUser.ratingCount - rating.score) / newCount;
      await ctx.db.patch(args.ratedUserId, { rating: newRating, ratingCount: newCount });
    } else if (ratedUser) {
      await ctx.db.patch(args.ratedUserId, { rating: 0, ratingCount: 0 });
    }

    await ctx.db.delete(rating._id);
  },
});
