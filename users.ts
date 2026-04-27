import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Called by UpdateCurrentUserProvider on login - no args allowed
export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "User not logged in",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (user !== null) {
      // Update name/email if changed via provider
      await ctx.db.patch(user._id, {
        name: identity.name ?? user.name,
        email: identity.email ?? user.email,
      });
      return user._id;
    }

    // New user: create with defaults
    // First user ever becomes admin
    const allUsers = await ctx.db.query("users").take(1);
    const isFirstUser = allUsers.length === 0;

    return await ctx.db.insert("users", {
      name: identity.name,
      email: identity.email,
      tokenIdentifier: identity.tokenIdentifier,
      isVerified: false,
      rating: 0,
      ratingCount: 0,
      joinedAt: new Date().toISOString(),
      role: isFirstUser ? "admin" : "user",
    });
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

// Public profile query — only exposes safe fields (never tokenIdentifier, email, role, phone)
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      city: user.city,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      rating: user.rating,
      ratingCount: user.ratingCount,
      joinedAt: user.joinedAt,
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    if (args.name !== undefined && args.name.length > 100) throw new ConvexError({ code: "BAD_REQUEST", message: "الاسم طويل جداً" });
    if (args.phone !== undefined && !/^[0-9+\s-]{7,20}$/.test(args.phone)) throw new ConvexError({ code: "BAD_REQUEST", message: "رقم الهاتف غير صالح" });
    if (args.bio !== undefined && args.bio.length > 500) throw new ConvexError({ code: "BAD_REQUEST", message: "النبذة طويلة جداً" });
    if (args.avatarUrl !== undefined && args.avatarUrl.length > 2000) throw new ConvexError({ code: "BAD_REQUEST", message: "رابط الصورة غير صالح" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }

    const updates: {
      name?: string;
      phone?: string;
      city?: string;
      bio?: string;
      avatarUrl?: string;
    } = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.city !== undefined) updates.city = args.city;
    if (args.bio !== undefined) updates.bio = args.bio;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;

    await ctx.db.patch(user._id, updates);
    return user._id;
  },
});

// Generate upload URL for avatar image
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    return await ctx.storage.generateUploadUrl();
  },
});

// Save uploaded avatar storage ID and update avatarUrl
export const saveAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });

    const url = await ctx.storage.getUrl(args.storageId as Id<"_storage">);
    if (!url) throw new ConvexError({ code: "BAD_REQUEST", message: "Failed to get file URL" });

    await ctx.db.patch(user._id, { avatarUrl: url });
    return url;
  },
});
