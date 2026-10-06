package top.oneion.liondapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TestingEntry(
    val id: String,
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("tester_skr") val testerSkr: String,
    val status: String,
    val body: String = "",
    @SerialName("evidence_url") val evidenceUrl: String = "",
    @SerialName("review_reason") val reviewReason: String = "",
    @SerialName("appeal_reason") val appealReason: String = "",
    @SerialName("resolution_reason") val resolutionReason: String = "",
    @SerialName("correction_count") val correctionCount: Int = 0,
    val revision: Int = 1,
    @SerialName("submit_by") val submitBy: String,
    @SerialName("submitted_at") val submittedAt: String? = null,
    @SerialName("appeal_by") val appealBy: String? = null,
    @SerialName("payment_signature") val paymentSignature: String? = null,
)

@Serializable
data class TestingCampaign(
    val id: String,
    @SerialName("creator_skr") val creatorSkr: String,
    @SerialName("store_package") val storePackage: String,
    @SerialName("post_id") val postId: String? = null,
    @SerialName("app_name") val appName: String,
    @SerialName("app_icon") val appIcon: String? = null,
    val title: String,
    val description: String,
    @SerialName("app_version") val appVersion: String,
    val requirements: String,
    @SerialName("min_characters") val minCharacters: Int,
    @SerialName("reservation_hours") val reservationHours: Int,
    val capacity: Int,
    @SerialName("reward_units") val rewardUnits: String,
    @SerialName("fee_units") val feeUnits: String,
    @SerialName("total_units") val totalUnits: String,
    val deadline: String,
    val status: String,
    val revision: Int = 1,
    @SerialName("funding_state") val fundingState: String,
    val remaining: Int = 0,
    val occupied: Int = 0,
    val approved: Int = 0,
    val paid: Int = 0,
    val pending: Int = 0,
    @SerialName("own_entry") val ownEntry: TestingEntry? = null,
    @SerialName("refunded_units") val refundedUnits: String = "0",
    @SerialName("reward_pool_units") val rewardPoolUnits: String = "0",
    @SerialName("locked_units") val lockedUnits: String = "0",
    @SerialName("refundable_units") val refundableUnits: String = "0",
    @SerialName("fee_paid_units") val feePaidUnits: String = "0",
)

@Serializable data class CampaignListResponse(val items: List<TestingCampaign> = emptyList(), val nextCursor: String? = null)
@Serializable data class TestingEntriesResponse(val items: List<TestingEntry> = emptyList())
@Serializable data class CampaignConfig(val paymentMode: String = "disabled", val feeBps: Int = 1000)
@Serializable data class CreateCampaignRequest(val title: String, val description: String, val appVersion: String, val requirements: String, val storePackage: String, val minCharacters: Int, val capacity: Int, val reservationHours: Int, val rewardSkr: String, val deadline: String, val revision: Int? = null)
@Serializable data class TestingReportRequest(val revision: Int, val body: String, val evidenceUrl: String)
@Serializable data class TestingReviewRequest(val revision: Int, val decision: String, val reason: String = "")
@Serializable data class TestingActionRequest(val revision: Int, val reason: String = "")
