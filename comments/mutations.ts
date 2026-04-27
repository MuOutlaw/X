import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import {
  checkCommentRateLimit,
  checkContentSpam,
  checkDuplicateComment,
} from "../spam_protection.ts";

export const add = mutation({
  args: {
    listingId: v.id("listings"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    if (args.text.trim().length === 0) throw new ConvexError({ code: "BAD_REQUEST", message: "التعليق فارغ" });
    if (args.text.length > 500) throw new ConvexError({ code: "BAD_REQUEST", message: "التعليق طويل جداً (500 حرف كحد أقصى)" });

    // Spam content check
    checkContentSpam(args.text, "التعليق");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    // Require phone verification
    if (!user.phoneVerified) {
      throw new ConvexError({ code: "FORBIDDEN", message: "يجب توثيق رقم جوالك أولاً قبل إضافة تعليق" });
    }

    // Rate limit & duplicate check
    await checkCommentRateLimit(ctx, user._id);
    await checkDuplicateComment(ctx, user._id, args.listingId, args.text);

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "الإعلان غير موجود" });

    return await ctx.db.insert("comments", {
      listingId: args.listingId,
      userId: user._id,
      text: args.text.trim(),
      createdAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new ConvexError({ code: "NOT_FOUND", message: "التعليق غير موجود" });

    // Only comment owner or admin can delete
    if (comment.userId !== user._id && user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "لا يمكنك حذف هذا التعليق" });
    }

    await ctx.db.delete(args.commentId);
  },
});
