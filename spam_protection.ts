import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

// Rate limit configurations (action -> { windowMs, maxActions })
const RATE_LIMITS = {
  createListing: { windowMs: 60 * 60 * 1000, maxActions: 5 }, // 5 per hour
  sendMessage: { windowMs: 60 * 1000, maxActions: 20 }, // 20 per minute
  startConversation: { windowMs: 5 * 60 * 1000, maxActions: 10 }, // 10 per 5 min
  addComment: { windowMs: 5 * 60 * 1000, maxActions: 10 }, // 10 per 5 min
  submitRating: { windowMs: 60 * 60 * 1000, maxActions: 10 }, // 10 per hour
  submitReport: { windowMs: 60 * 60 * 1000, maxActions: 5 }, // 5 per hour
  placeBid: { windowMs: 60 * 1000, maxActions: 15 }, // 15 per minute
  createAuction: { windowMs: 60 * 60 * 1000, maxActions: 3 }, // 3 per hour
} as const;

type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Check rate limit for listings created by a user.
 * Queries the listings table by userId index and counts recent entries.
 */
export async function checkListingRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.createListing;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentListings = await ctx.db
    .query("listings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const count = recentListings.filter((l) => l.createdAt > cutoff).length;
  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `تجاوزت الحد الأقصى (${maxActions} إعلانات في الساعة). يرجى المحاولة لاحقاً`,
    });
  }
}

/**
 * Check rate limit for messages sent in a conversation.
 */
export async function checkMessageRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.sendMessage;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentMessages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();

  const count = recentMessages.filter(
    (m) => m.senderId === userId && m.sentAt > cutoff
  ).length;

  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت ترسل رسائل بسرعة كبيرة. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for starting new conversations.
 */
export async function checkConversationRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.startConversation;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  // Query conversations and filter by participant
  const recentConversations = await ctx.db
    .query("conversations")
    .withIndex("by_lastMessageAt")
    .order("desc")
    .take(100);

  const count = recentConversations.filter(
    (c) =>
      c.participantIds.includes(userId) &&
      c._creationTime > Date.now() - windowMs &&
      c.lastMessageAt > cutoff
  ).length;

  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت تبدأ محادثات كثيرة جداً. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for comments by a user.
 */
export async function checkCommentRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.addComment;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentComments = await ctx.db
    .query("comments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const count = recentComments.filter((c) => c.createdAt > cutoff).length;
  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت تعلق بسرعة كبيرة. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for ratings by a user.
 */
export async function checkRatingRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.submitRating;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentRatings = await ctx.db
    .query("ratings")
    .withIndex("by_rater", (q) => q.eq("raterId", userId))
    .collect();

  const count = recentRatings.filter((r) => r.createdAt > cutoff).length;
  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت تقيّم بسرعة كبيرة. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for reports by a user.
 */
export async function checkReportRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.submitReport;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentReports = await ctx.db
    .query("reports")
    .withIndex("by_reporter", (q) => q.eq("reporterId", userId))
    .collect();

  const count = recentReports.filter((r) => r.createdAt > cutoff).length;
  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت ترسل بلاغات كثيرة. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for bids by a user on a specific auction.
 */
export async function checkBidRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">,
  auctionId: Id<"auctions">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.placeBid;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentBids = await ctx.db
    .query("bids")
    .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
    .collect();

  const count = recentBids.filter(
    (b) => b.bidderId === userId && b.createdAt > cutoff
  ).length;

  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "أنت تزايد بسرعة كبيرة. يرجى الانتظار قليلاً",
    });
  }
}

/**
 * Check rate limit for auction creation.
 */
export async function checkAuctionRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const { windowMs, maxActions } = RATE_LIMITS.createAuction;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const recentAuctions = await ctx.db
    .query("auctions")
    .withIndex("by_creator", (q) => q.eq("creatorId", userId))
    .collect();

  const count = recentAuctions.filter((a) => a.createdAt > cutoff).length;
  if (count >= maxActions) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `تجاوزت الحد الأقصى (${maxActions} مزادات في الساعة). يرجى المحاولة لاحقاً`,
    });
  }
}

// ─── Content Spam Detection ────────────────────────────────────────

// Common spam URL patterns
const SUSPICIOUS_URL_PATTERN =
  /https?:\/\/[^\s]{5,}/gi;

// Excessive repeated characters (e.g. "aaaaaaa" or "!!!!!!!!")
const REPEATED_CHARS_PATTERN = /(.)\1{9,}/;

// Excessive repeated words (same word 5+ times)
function hasExcessiveRepeatedWords(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => w.length > 1);
  const freq: Record<string, number> = {};
  for (const w of words) {
    const lower = w.toLowerCase();
    freq[lower] = (freq[lower] ?? 0) + 1;
    if (freq[lower] >= 5) return true;
  }
  return false;
}

/**
 * Validate text content for spam patterns.
 * Throws ConvexError if spam is detected.
 */
export function checkContentSpam(text: string, fieldName: string): void {
  // Check for excessive URLs (more than 3 links)
  const urlMatches = text.match(SUSPICIOUS_URL_PATTERN);
  if (urlMatches && urlMatches.length > 3) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `${fieldName} يحتوي على عدد كبير من الروابط`,
    });
  }

  // Check for excessive repeated characters
  if (REPEATED_CHARS_PATTERN.test(text)) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `${fieldName} يحتوي على أحرف مكررة بشكل مفرط`,
    });
  }

  // Check for excessive repeated words
  if (hasExcessiveRepeatedWords(text)) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `${fieldName} يحتوي على كلمات مكررة بشكل مفرط`,
    });
  }

  // Check for all-caps content (Latin only, skip Arabic)
  const latinChars = text.replace(/[^a-zA-Z]/g, "");
  if (latinChars.length > 20 && latinChars === latinChars.toUpperCase()) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `${fieldName} يحتوي على نص بأحرف كبيرة فقط`,
    });
  }
}

/**
 * Check for duplicate content submission (same user, same text recently).
 */
export async function checkDuplicateComment(
  ctx: MutationCtx,
  userId: Id<"users">,
  listingId: Id<"listings">,
  text: string
): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes

  const recentComments = await ctx.db
    .query("comments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const duplicate = recentComments.find(
    (c) =>
      c.listingId === listingId &&
      c.createdAt > cutoff &&
      c.text.trim().toLowerCase() === text.trim().toLowerCase()
  );

  if (duplicate) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "لقد أضفت نفس التعليق مؤخراً",
    });
  }
}

/**
 * Check for duplicate message (same text in same conversation within 30 seconds).
 */
export async function checkDuplicateMessage(
  ctx: MutationCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">,
  text: string
): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString(); // 30 seconds

  const recentMessages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_and_sentAt", (q) =>
      q.eq("conversationId", conversationId).gte("sentAt", cutoff)
    )
    .collect();

  const duplicate = recentMessages.find(
    (m) =>
      m.senderId === userId &&
      m.text.trim().toLowerCase() === text.trim().toLowerCase()
  );

  if (duplicate) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "لقد أرسلت نفس الرسالة للتو",
    });
  }
}
