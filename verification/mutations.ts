import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";

// Submit a verification request
export const submitRequest = mutation({
  args: {
    idType: v.union(
      v.literal("national_id"),
      v.literal("iqama"),
      v.literal("commercial_register")
    ),
    idNumber: v.string(),
    idImageStorageId: v.id("_storage"),
    selfieStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    if (user.isVerified) {
      throw new ConvexError({ code: "CONFLICT", message: "حسابك موثق بالفعل" });
    }

    // Check if there's already a pending request
    const existing = await ctx.db
      .query("verificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    if (existing && existing.status === "pending") {
      throw new ConvexError({ code: "CONFLICT", message: "لديك طلب توثيق قيد المراجعة بالفعل" });
    }

    await ctx.db.insert("verificationRequests", {
      userId: user._id,
      idType: args.idType,
      idNumber: args.idNumber,
      idImageStorageId: args.idImageStorageId,
      selfieStorageId: args.selfieStorageId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});

// Generate an upload URL for verification documents
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });
    return await ctx.storage.generateUploadUrl();
  },
});
