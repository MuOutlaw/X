import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()), // true once OTP verified
    city: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isVerified: v.boolean(),
    rating: v.number(),
    ratingCount: v.number(),
    joinedAt: v.string(),
    customerId: v.optional(v.string()), // Hercules Commerce customer ID
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    subscriptionPackage: v.optional(v.string()),
    subscriptionExpiresAt: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  listings: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    price: v.number(),
    priceType: v.union(v.literal("fixed"), v.literal("negotiable")),
    category: v.string(),   // camels | sheep | cattle | goats | feed | farms | services | transport
    subCategory: v.optional(v.string()),
    city: v.string(),
    region: v.optional(v.string()),
    images: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("sold"), v.literal("draft")),
    isFeatured: v.boolean(),
    views: v.number(),
    // Livestock-specific
    age: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("mixed"))),
    quantity: v.optional(v.number()),
    weight: v.optional(v.string()),
    breed: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoUrl: v.optional(v.string()),
    commissionPaid: v.optional(v.boolean()),
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_category", ["category"])
    .index("by_city", ["city"])
    .index("by_status", ["status"])
    .index("by_status_and_category", ["status", "category"])
    .index("by_status_and_city", ["status", "city"])
    .index("by_featured", ["isFeatured"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["category", "city", "status"],
    }),

  // Conversation between two users (possibly about a listing)
  conversations: defineTable({
    participantIds: v.array(v.id("users")), // always exactly 2
    listingId: v.optional(v.id("listings")),
    lastMessageAt: v.string(),
    lastMessageText: v.optional(v.string()),
    // unread counts per participant stored as a record
    unreadCounts: v.record(v.string(), v.number()),
  })
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_listing", ["listingId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    text: v.string(),
    isRead: v.boolean(),
    sentAt: v.string(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_sentAt", ["conversationId", "sentAt"]),

  // Ratings left by one user for another, optionally tied to a listing
  ratings: defineTable({
    raterId: v.id("users"),      // who left the rating
    ratedUserId: v.id("users"),  // who received the rating
    listingId: v.optional(v.id("listings")),
    score: v.number(),           // 1–5
    comment: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_ratedUser", ["ratedUserId"])
    .index("by_rater", ["raterId"])
    .index("by_ratedUser_and_rater", ["ratedUserId", "raterId"]),

  // Reports submitted by users about listings or other users
  reports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(v.literal("listing"), v.literal("user")),
    targetListingId: v.optional(v.id("listings")),
    targetUserId: v.optional(v.id("users")),
    reason: v.union(
      v.literal("spam"),
      v.literal("fraud"),
      v.literal("inappropriate"),
      v.literal("wrong_category"),
      v.literal("fake_price"),
      v.literal("other")
    ),
    details: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("reviewed"),
      v.literal("dismissed")
    ),
    createdAt: v.string(),
    reviewedAt: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  })
    .index("by_reporter", ["reporterId"])
    .index("by_status", ["status"])
    .index("by_target_listing", ["targetListingId"])
    .index("by_target_user", ["targetUserId"]),

  // In-app notifications
  notifications: defineTable({
    userId: v.id("users"),       // recipient
    type: v.union(
      v.literal("new_message"),     // someone sent you a message
      v.literal("new_rating"),      // someone rated you
      v.literal("listing_saved"),   // someone saved your listing
      v.literal("listing_sold"),    // you marked a listing as sold
      v.literal("boost_expired"),   // your boost expired
      v.literal("listing_inquiry")  // someone enquired about your listing
    ),
    title: v.string(),
    body: v.string(),
    isRead: v.boolean(),
    // Optional links
    listingId: v.optional(v.id("listings")),
    conversationId: v.optional(v.id("conversations")),
    actorId: v.optional(v.id("users")),   // who triggered this notification
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_isRead", ["userId", "isRead"]),

  // Saved/favorited listings per user
  savedListings: defineTable({
    userId: v.id("users"),
    listingId: v.id("listings"),
    savedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_listing", ["listingId"])
    .index("by_user_and_listing", ["userId", "listingId"]),

  // Premium subscription receipts — bank transfer receipt uploads
  subscriptionReceipts: defineTable({
    userId: v.id("users"),
    receiptStorageId: v.id("_storage"),
    packageId: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Verification requests — users submit ID/documents for manual review
  verificationRequests: defineTable({
    userId: v.id("users"),
    idType: v.union(
      v.literal("national_id"),
      v.literal("iqama"),
      v.literal("commercial_register")
    ),
    idNumber: v.string(),
    idImageStorageId: v.id("_storage"),
    selfieStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Auctions — timed bidding events
  auctions: defineTable({
    creatorId: v.id("users"),
    title: v.string(),
    description: v.string(),
    images: v.array(v.string()),
    category: v.string(),
    city: v.string(),
    startingPrice: v.number(),
    minBidIncrement: v.number(),
    currentPrice: v.number(),
    highestBidderId: v.optional(v.id("users")),
    bidCount: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled")
    ),
    createdAt: v.string(),
  })
    .index("by_creator", ["creatorId"])
    .index("by_status", ["status"])
    .index("by_status_and_category", ["status", "category"])
    .index("by_status_and_city", ["status", "city"]),

  // Live streams for auctions
  liveStreams: defineTable({
    auctionId: v.id("auctions"),
    hostId: v.id("users"),
    channelName: v.string(),
    status: v.union(
      v.literal("live"),
      v.literal("ended")
    ),
    viewerCount: v.number(),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
  })
    .index("by_auction", ["auctionId"])
    .index("by_status", ["status"]),

  // Bids placed on auctions
  bids: defineTable({
    auctionId: v.id("auctions"),
    bidderId: v.id("users"),
    amount: v.number(),
    createdAt: v.string(),
  })
    .index("by_auction", ["auctionId"])
    .index("by_bidder", ["bidderId"])
    .index("by_auction_and_amount", ["auctionId", "amount"]),

  // Comments on listings
  comments: defineTable({
    listingId: v.id("listings"),
    userId: v.id("users"),
    text: v.string(),
    createdAt: v.string(),
  })
    .index("by_listing", ["listingId"])
    .index("by_user", ["userId"]),

  // Moyasar payment records
  payments: defineTable({
    userId: v.id("users"),
    paymentId: v.string(),           // Moyasar payment ID
    type: v.union(v.literal("subscription"), v.literal("boost"), v.literal("commission")),
    amountSar: v.number(),
    packageId: v.optional(v.string()),
    listingId: v.optional(v.id("listings")),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("failed")),
    paidAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_paymentId", ["paymentId"])
    .index("by_status", ["status"]),

  // OTP verification codes for phone number verification
  otpCodes: defineTable({
    phone: v.string(),           // normalized phone number
    code: v.string(),            // 6-digit OTP
    expiresAt: v.string(),       // ISO timestamp
    used: v.boolean(),
  }).index("by_phone", ["phone"]),

  // Premium boost orders — tracks which listings are boosted and for how long
  boosts: defineTable({
    listingId: v.id("listings"),
    userId: v.id("users"),
    packageId: v.string(),      // e.g. "featured_7d", "top_3d", "bundle_14d"
    startsAt: v.string(),
    expiresAt: v.string(),
    isActive: v.boolean(),
    // Payment info (filled when Commerce is connected)
    paymentStatus: v.union(v.literal("pending"), v.literal("paid"), v.literal("free")),
    customerId: v.optional(v.string()),
    checkoutSessionId: v.optional(v.string()),
  })
    .index("by_listing", ["listingId"])
    .index("by_user", ["userId"])
    .index("by_active", ["isActive"]),

  // Audit logs — electronic signature and action trail for legal compliance
  auditLogs: defineTable({
    userId: v.id("users"),
    eventType: v.union(
      v.literal("seller_auction_consent"),     // seller agreed to terms before publishing auction
      v.literal("bidder_auction_consent"),      // bidder agreed to terms before entering auction
      v.literal("winner_purchase_confirm"),     // winner confirmed purchase after winning
      v.literal("bid_placed"),                  // bid was placed (auto-logged)
      v.literal("auction_created"),             // auction was created (auto-logged)
      v.literal("auction_ended"),               // auction ended (auto-logged)
      v.literal("auction_cancelled")            // auction was cancelled (auto-logged)
    ),
    auctionId: v.optional(v.id("auctions")),
    consentText: v.optional(v.string()),        // exact text the user agreed to
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),          // device + browser fingerprint
    metadata: v.optional(v.string()),           // JSON string for extra data (bid amount, etc.)
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_auction", ["auctionId"])
    .index("by_eventType", ["eventType"]),
});
