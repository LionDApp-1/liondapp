package top.oneion.liondapp.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.http.contentType
import io.ktor.http.content.ByteArrayContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import top.oneion.liondapp.BuildConfig
import top.oneion.liondapp.model.ApiErrorResponse
import top.oneion.liondapp.model.BlockActionResponse
import top.oneion.liondapp.model.BlockListResponse
import top.oneion.liondapp.model.ChallengeRequest
import top.oneion.liondapp.model.ChallengeResponse
import top.oneion.liondapp.model.CreateNeedRequest
import top.oneion.liondapp.model.CreateWorkRequest
import top.oneion.liondapp.model.CreatedResponse
import top.oneion.liondapp.model.CommentListResponse
import top.oneion.liondapp.model.CreateCommentRequest
import top.oneion.liondapp.model.MediaUploadResponse
import top.oneion.liondapp.model.MeResponse
import top.oneion.liondapp.model.NotificationListResponse
import top.oneion.liondapp.model.ReportRequest
import top.oneion.liondapp.model.UpdateProfileRequest
import top.oneion.liondapp.model.UpdatedResponse
import top.oneion.liondapp.model.NeedListResponse
import top.oneion.liondapp.model.PublicConfig
import top.oneion.liondapp.model.PromotionConfirmResponse
import top.oneion.liondapp.model.PromotionOrderResponse
import top.oneion.liondapp.model.ReactionResponse
import top.oneion.liondapp.model.SearchResponse
import top.oneion.liondapp.model.StoreAppListResponse
import top.oneion.liondapp.model.VerifyRequest
import top.oneion.liondapp.model.VerifyResponse
import top.oneion.liondapp.model.WorkListResponse

import top.oneion.liondapp.model.*

class ApiException(val code: String, val statusCode: Int? = null) : Exception(code)

class ApiClient internal constructor(engine: HttpClientEngine) {
    constructor() : this(OkHttp.create())

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val client = HttpClient(engine) {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    var sessionToken: String? = null

    fun close() = client.close()

    suspend fun config(): PublicConfig = get("/v1/config")
    suspend fun needs(sort: String, category: String? = null): NeedListResponse = get("/v1/needs?sort=$sort${category?.let { "&category=" + java.net.URLEncoder.encode(it, Charsets.UTF_8.name()) } ?: ""}")
    suspend fun works(sort: String, category: String? = null): WorkListResponse = get("/v1/works?sort=$sort${category?.let { "&category=" + java.net.URLEncoder.encode(it, Charsets.UTF_8.name()) } ?: ""}")
    suspend fun search(query: String): SearchResponse = get("/v1/search?q=${java.net.URLEncoder.encode(query, Charsets.UTF_8.name())}")
    suspend fun storeApps(query: String = ""): StoreAppListResponse = get("/v1/store-apps${if (query.isBlank()) "" else "?q=" + java.net.URLEncoder.encode(query, Charsets.UTF_8.name())}")
    suspend fun challenge(walletAddress: String): ChallengeResponse = post("/v1/auth/challenge", ChallengeRequest(walletAddress))
    suspend fun verify(request: VerifyRequest): VerifyResponse = post("/v1/auth/verify", request)
    suspend fun logout(token: String) {
        val response = client.post(BuildConfig.API_BASE_URL + "/v1/auth/logout") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        if (!response.status.isSuccess()) throw ApiException(runCatching { response.body<ApiErrorResponse>().error }.getOrDefault("request_failed"))
    }
    suspend fun createNeed(request: CreateNeedRequest): CreatedResponse = post("/v1/needs", request, true)
    suspend fun createWork(request: CreateWorkRequest): CreatedResponse = post("/v1/works", request, true)
    suspend fun reactToNeed(id: String): ReactionResponse = post("/v1/needs/$id/reaction", emptyMap<String, String>(), true)
    suspend fun reactToWork(id: String): ReactionResponse = post("/v1/works/$id/reaction", emptyMap<String, String>(), true)
    suspend fun reactToComment(id: String): ReactionResponse = post("/v1/comments/$id/reaction", emptyMap<String, String>(), true)
    suspend fun report(request: ReportRequest): CreatedResponse = post("/v1/reports", request, true)
    suspend fun comments(kind: String, id: String, sort: String = "top"): CommentListResponse = get("/v1/${kind}s/$id/comments?sort=$sort")
    suspend fun comment(kind: String, id: String, body: String, parentId: String? = null): CreatedResponse =
        post("/v1/${kind}s/$id/comments", CreateCommentRequest(body, parentId), true)
    suspend fun uploadImage(bytes: ByteArray, mimeType: String): MediaUploadResponse {
        val response = client.post(BuildConfig.API_BASE_URL + "/v1/media") {
            authorize()
            setBody(ByteArrayContent(bytes, ContentType.parse(mimeType)))
        }
        return response.decode()
    }
    suspend fun deleteNeed(id: String) = delete("/v1/needs/$id")
    suspend fun deleteWork(id: String) = delete("/v1/works/$id")
    suspend fun me(): MeResponse = get("/v1/me")
    suspend fun notifications(): NotificationListResponse = get("/v1/notifications")
    suspend fun blocks(): BlockListResponse = get("/v1/blocks")
    suspend fun blockUser(skrDomain: String): BlockActionResponse = post("/v1/blocks/$skrDomain", emptyMap<String, String>(), true)
    suspend fun unblockUser(skrDomain: String) = delete("/v1/blocks/$skrDomain")
    suspend fun deleteAccount() = delete("/v1/me")
    suspend fun profile(skrDomain: String): MeResponse = get("/v1/profiles/$skrDomain")
    suspend fun updateProfile(bio: String, socialUrl: String): UpdatedResponse = put("/v1/me", UpdateProfileRequest(bio, socialUrl))
    suspend fun createPromotionOrder(id: String): PromotionOrderResponse = post("/v1/works/$id/promotion-order", emptyMap<String, String>(), true)
    suspend fun simulatePromotion(orderId: String): PromotionConfirmResponse = post("/v1/promotion-orders/$orderId/simulate-confirm", emptyMap<String, String>(), true)

    suspend fun donationConfig(): DonationConfig = get("/v1/donations/config")
    suspend fun donationQuote(amount: Int): DonationQuote = post("/v1/donations/quote", mapOf("amountSkr" to amount), true)
    suspend fun confirmDonation(id: String, signature: String): DonationConfirmation = post("/v1/donations/$id/confirm", mapOf("signature" to signature), true)
    suspend fun conversations(before: String? = null): ConversationList = get("/v1/conversations" + (before?.let { "?before=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: ""))
    suspend fun startConversation(needId: String): CreatedResponse = post("/v1/conversations", mapOf("needId" to needId), true)
    suspend fun messages(id: String, before: Long? = null): MessageList = get("/v1/conversations/$id/messages" + (before?.let { "?before=$it" } ?: ""))
    suspend fun sendMessage(id: String, text: String, clientId: String): CreatedResponse = post("/v1/conversations/$id/messages", SendMessageRequest(text, clientId), true)
    suspend fun readMessages(id: String, lastSeq: Long): UpdatedResponse = post("/v1/conversations/$id/read", mapOf("lastSeq" to lastSeq), true)
    suspend fun deleteMessage(id: String, messageId: String) = delete("/v1/conversations/$id/messages/$messageId")
    suspend fun reportMessage(id: String, messageId: String, reason: String): Map<String, Boolean> = post("/v1/conversations/$id/messages/$messageId/report", mapOf("reason" to reason), true)

    private suspend inline fun <reified T> get(path: String): T {
        val response = client.get(BuildConfig.API_BASE_URL + path) { authorize() }
        return response.decode()
    }

    private suspend inline fun <reified T, reified B> post(path: String, body: B, authenticated: Boolean = false): T {
        val response = client.post(BuildConfig.API_BASE_URL + path) {
            contentType(ContentType.Application.Json)
            setBody(body)
            if (authenticated) authorize()
        }
        return response.decode()
    }

    private suspend inline fun <reified T, reified B> put(path: String, body: B): T {
        val response = client.put(BuildConfig.API_BASE_URL + path) {
            contentType(ContentType.Application.Json)
            setBody(body)
            authorize()
        }
        return response.decode()
    }

    private suspend fun delete(path: String) {
        val response = client.delete(BuildConfig.API_BASE_URL + path) { authorize() }
        if (!response.status.isSuccess()) throw ApiException(runCatching { response.body<ApiErrorResponse>().error }.getOrDefault("request_failed"))
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authorize() {
        sessionToken?.let { header(HttpHeaders.Authorization, "Bearer $it") }
    }

    private suspend inline fun <reified T> io.ktor.client.statement.HttpResponse.decode(): T {
        if (!status.isSuccess()) {
            val statusCode = status.value
            val rawBody = runCatching { bodyAsText() }.getOrDefault("")
            val code = runCatching { json.decodeFromString<ApiErrorResponse>(rawBody).error }
                .getOrElse { "http_${statusCode}" }
            throw ApiException(code, statusCode)
        }
        return body()
    }
}
