package top.oneion.liondapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class NeedItem(
    val id: String,
    @SerialName("author_skr") val authorSkr: String,
    val title: String,
    val problem: String,
    @SerialName("solution_idea") val solutionIdea: String,
    val audience: String,
    val category: String,
    val format: String = "structured",
    @SerialName("request_type") val requestType: String = "free",
    @SerialName("budget_skr") val budgetSkr: Int? = null,
    val kind: String = "need",
    @SerialName("feedback_type") val feedbackType: String? = null,
    @SerialName("store_package") val storePackage: String? = null,
    @SerialName("app_name") val appName: String? = null,
    @SerialName("app_icon") val appIcon: String? = null,
    @SerialName("campaign_id") val campaignId: String? = null,
    @SerialName("campaign_reward_units") val campaignRewardUnits: String? = null,
    @SerialName("campaign_funding_state") val campaignFundingState: String? = null,
    @SerialName("campaign_status") val campaignStatus: String? = null,
    val status: String = "open",
    val revision: Int = 1,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("follower_count") val followerCount: Int = 0,
    @SerialName("tester_count") val testerCount: Int = 0,
    val following: Boolean = false,
    @SerialName("wants_test") val wantsTest: Boolean = false,
    val tags: List<String> = emptyList(),
    val media: List<String> = emptyList(),
    @SerialName("need_count") val needCount: Int = 0,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class WorkItem(
    val id: String,
    @SerialName("author_skr") val authorSkr: String,
    val name: String,
    val summary: String,
    val description: String,
    @SerialName("store_url") val storeUrl: String,
    @SerialName("store_package") val storePackage: String? = null,
    val category: String,
    val tags: List<String> = emptyList(),
    @SerialName("icon_key") val iconKey: String,
    val screenshots: List<String> = emptyList(),
    @SerialName("demo_url") val demoUrl: String? = null,
    @SerialName("moderation_status") val moderationStatus: String = "published",
    @SerialName("public_visibility") val publicVisibility: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("promoted_until") val promotedUntil: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class StoreAppItem(
    @SerialName("android_package") val androidPackage: String,
    @SerialName("display_name") val displayName: String,
    val subtitle: String = "",
    val description: String = "",
    @SerialName("subtitle_zh") val subtitleZh: String? = null,
    @SerialName("description_zh") val descriptionZh: String? = null,
    @SerialName("category_name") val categoryName: String? = null,
    @SerialName("category_name_zh") val categoryNameZh: String? = null,
    @SerialName("icon_url") val iconUrl: String? = null,
    @SerialName("publisher_name") val publisherName: String? = null,
    @SerialName("publisher_website") val publisherWebsite: String? = null,
    @SerialName("store_url") val storeUrl: String,
    val rating: Double? = null,
    @SerialName("review_count") val reviewCount: Int = 0,
    val source: String = "Solana dApp Store",
)

@Serializable data class NeedListResponse(val items: List<NeedItem> = emptyList())
@Serializable data class WorkListResponse(val promoted: List<WorkItem> = emptyList(), val items: List<WorkItem> = emptyList())
@Serializable data class SearchResponse(val needs: List<NeedItem> = emptyList(), val works: List<WorkItem> = emptyList(), val storeApps: List<StoreAppItem> = emptyList())
@Serializable data class StoreAppListResponse(val items: List<StoreAppItem> = emptyList())
@Serializable data class DiscoveryResponse(val testing: List<NeedItem> = emptyList(), val resolved: List<NeedItem> = emptyList(), val feedback: List<NeedItem> = emptyList(), val popular: List<NeedItem> = emptyList())

@Serializable
data class PublicConfig(
    val categories: List<String>,
    val recommendation: RecommendationConfig,
    val environment: String,
    val catalog: CatalogStats = CatalogStats(),
)

@Serializable data class CatalogStats(val active: Int = 0, val translated: Int = 0)

@Serializable data class RecommendationConfig(val priceSkr: Int, val durationDays: Int)

@Serializable data class ChallengeRequest(val walletAddress: String)
@Serializable
data class ChallengeResponse(
    val challengeId: String,
    val message: String,
    val nonce: String,
    val issuedAt: String,
    val expirationTime: String,
    val domain: String,
    val uri: String,
    val chainId: String,
)

@Serializable
data class VerifyRequest(
    val challengeId: String,
    val walletAddress: String,
    val signedMessage: String,
    val signature: String,
    val acceptTerms: Boolean,
    val confirmAge: Boolean,
    val locale: String,
)

@Serializable data class AuthUser(val skrDomain: String, val walletAddress: String)
@Serializable data class VerifyResponse(val token: String, val expiresAt: String, val user: AuthUser)

@Serializable
data class CreateNeedRequest(
    val title: String,
    val problem: String,
    val solutionIdea: String,
    val audience: String,
    val category: String,
    val tags: List<String>,
    val format: String = "structured",
    val requestType: String = "free",
    val budgetSkr: Int? = null,
    val kind: String = "need",
    val feedbackType: String? = null,
    val storePackage: String? = null,
    val revision: Int? = null,
)

@Serializable
data class CreateWorkRequest(
    val name: String,
    val summary: String,
    val description: String,
    val category: String,
    val tags: List<String>,
    val iconKey: String,
    val screenshotKeys: List<String>,
    val demoUrl: String? = null,
    val storePackage: String? = null,
)

@Serializable data class CreatedResponse(val id: String, val createdAt: String? = null, val status: String? = null)
@Serializable data class ReactionResponse(val active: Boolean)
@Serializable data class ApiErrorResponse(val error: String)

@Serializable
data class CommentItem(
    val id: String,
    @SerialName("author_skr") val authorSkr: String,
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: String,
    @SerialName("parent_id") val parentId: String? = null,
    val body: String,
    @SerialName("response_kind") val responseKind: String = "discussion",
    @SerialName("linked_store_package") val linkedStorePackage: String? = null,
    @SerialName("linked_app_name") val linkedAppName: String? = null,
    @SerialName("linked_work_id") val linkedWorkId: String? = null,
    @SerialName("linked_work_name") val linkedWorkName: String? = null,
    @SerialName("outcome_status") val outcomeStatus: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    @SerialName("created_at") val createdAt: String,
)

@Serializable data class CommentListResponse(val items: List<CommentItem> = emptyList())
@Serializable data class CreateCommentRequest(val body: String, val parentId: String? = null, val responseKind: String = "discussion", val linkedStorePackage: String? = null, val linkedWorkId: String? = null)
@Serializable data class FollowRequest(val wantsTest: Boolean)
@Serializable data class AppFollowState(val following: Boolean = false)
@Serializable data class ProgressRequest(val status: String, val body: String, val revision: Int, val linkedStorePackage: String? = null, val linkedWorkId: String? = null)
@Serializable data class MediaUploadResponse(val key: String, val url: String)

@Serializable
data class PromotionOrderResponse(
    val orderId: String,
    val network: String,
    val mintAddress: String,
    val receiverAddress: String,
    val amountSkr: Int,
    val baseUnits: String,
    val expiresAt: String,
)

@Serializable data class PromotionConfirmResponse(val status: String, val startsAt: String, val endsAt: String, val simulated: Boolean)

@Serializable data class PublicProfile(@SerialName("skr_domain") val skrDomain: String, val bio: String? = null, @SerialName("social_url") val socialUrl: String? = null, val locale: String = "en", @SerialName("created_at") val createdAt: String)
@Serializable data class MeResponse(val profile: PublicProfile, val needs: List<NeedItem> = emptyList(), val works: List<WorkItem> = emptyList())
@Serializable data class NotificationPayload(val targetType: String? = null, val targetId: String? = null, val workId: String? = null, val title: String? = null, val actor: String? = null, val status: String? = null, val decision: String? = null)
@Serializable data class NotificationItem(val id: String, val type: String, @SerialName("created_at") val createdAt: String, @SerialName("read_at") val readAt: String? = null, val payload: NotificationPayload = NotificationPayload())
@Serializable data class NotificationListResponse(val items: List<NotificationItem> = emptyList())
@Serializable data class BlockedUser(val skrDomain: String, val createdAt: String)
@Serializable data class BlockListResponse(val items: List<BlockedUser> = emptyList())
@Serializable data class BlockActionResponse(val blocked: Boolean)
@Serializable data class ReportRequest(val targetType: String, val targetId: String, val reason: String, val details: String = "")
@Serializable data class UpdateProfileRequest(val bio: String, val socialUrl: String)
@Serializable data class UpdatedResponse(val updated: Boolean)

@Serializable data class ConversationItem(val id: String, @SerialName("need_id") val needId: String, val title: String, @SerialName("peer_skr") val peerSkr: String, @SerialName("updated_at") val updatedAt: String, @SerialName("unread_count") val unreadCount: Int = 0)
@Serializable data class ConversationList(val items: List<ConversationItem>, val nextCursor: String? = null)
@Serializable data class ChatMessage(val id: String, val seq: Long, @SerialName("sender_skr") val senderSkr: String, val body: String, @SerialName("created_at") val createdAt: String, @SerialName("deleted_at") val deletedAt: String? = null)
@Serializable data class MessageList(val items: List<ChatMessage>, val nextCursor: Long? = null)
@Serializable data class SendMessageRequest(val body: String, val clientId: String)

@Serializable data class DonationConfig(val enabled: Boolean = false, val receiverAddress: String, val mintAddress: String, val network: String)
@Serializable data class DonationQuote(val quoteId: String, val payerAddress: String, val receiverAddress: String, val mintAddress: String, val network: String, val amountSkr: Int, val baseUnits: String, val transaction: String, val networkFeeLamports: String, val accountRentLamports: String, val expiresAt: String)
@Serializable data class DonationConfirmation(val status: String, val signature: String)
