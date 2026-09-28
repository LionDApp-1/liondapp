package top.oneion.liondapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.net.Uri
import android.util.Log
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import top.oneion.liondapp.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.data.ApiException
import top.oneion.liondapp.data.SessionStore
import top.oneion.liondapp.model.CreateNeedRequest
import top.oneion.liondapp.model.CreateWorkRequest
import top.oneion.liondapp.model.CommentItem
import top.oneion.liondapp.model.BlockedUser
import top.oneion.liondapp.model.NeedItem
import top.oneion.liondapp.model.PublicConfig
import top.oneion.liondapp.model.WorkItem
import top.oneion.liondapp.model.StoreAppItem
import top.oneion.liondapp.model.NotificationItem
import top.oneion.liondapp.model.ReportRequest
import top.oneion.liondapp.model.PublicProfile
import top.oneion.liondapp.wallet.WalletAuthManager
import top.oneion.liondapp.wallet.allowsTips

data class LionUiState(
    val publishingNeed: Boolean = false,
    val donationConfig: DonationConfig? = null,
    val donationQuote: DonationQuote? = null,
    val donationStatus: String? = null,
    val donationSignature: String? = null,
    val donationBusy: Boolean = false,
    val donationError: String? = null,
    val conversations: List<ConversationItem> = emptyList(),
    val conversationCursor: String? = null,
    val activeChat: ConversationItem? = null,
    val messages: List<ChatMessage> = emptyList(),
    val messageCursor: Long? = null,
    val chatLoading: Boolean = false,
    val chatSending: Boolean = false,
    val chatError: String? = null,
    val chatDraft: String = "",
    val chatClientId: String = UUID.randomUUID().toString(),
    val loading: Boolean = true,
    val authenticating: Boolean = false,
    val needs: List<NeedItem> = emptyList(),
    val works: List<WorkItem> = emptyList(),
    val promoted: List<WorkItem> = emptyList(),
    val storeApps: List<StoreAppItem> = emptyList(),
    val config: PublicConfig? = null,
    val skrDomain: String? = null,
    val error: String? = null,
    val comments: List<CommentItem> = emptyList(),
    val myNeeds: List<NeedItem> = emptyList(),
    val myWorks: List<WorkItem> = emptyList(),
    val notifications: List<NotificationItem> = emptyList(),
    val blockedUsers: List<BlockedUser> = emptyList(),
    val searchActive: Boolean = false,
    val profilePreview: PublicProfile? = null,
    val profileNeeds: List<NeedItem> = emptyList(),
    val profileWorks: List<WorkItem> = emptyList(),
    val myProfile: PublicProfile? = null,
    val workSubmission: WorkSubmissionState = WorkSubmissionState(),
)

enum class WorkSubmissionPhase { Idle, Uploading, Creating, Success, Error }

data class WorkSubmissionState(
    val phase: WorkSubmissionPhase = WorkSubmissionPhase.Idle,
    val currentImage: Int = 0,
    val totalImages: Int = 0,
    val errorCode: String? = null,
)

class LionViewModel internal constructor(context: Context, private val api: ApiClient) : ViewModel() {
    constructor(context: Context) : this(context, ApiClient())

    private val appContext = context.applicationContext
    private val sessions = SessionStore(context.applicationContext)
    private val wallet = WalletAuthManager(api)
    private val donationWallet = top.oneion.liondapp.wallet.DonationWallet()
    private val tipPreferences = context.applicationContext.getSharedPreferences("liondapp_tip_receipt", Context.MODE_PRIVATE)
    private val mutableState = MutableStateFlow(LionUiState(skrDomain = sessions.skrDomain))
    val state: StateFlow<LionUiState> = mutableState.asStateFlow()
    private val chatRefreshMutex = Mutex()
    private var chatGeneration = 0L
    private var profileGeneration = 0L

    override fun onCleared() {
        api.close()
        super.onCleared()
    }

    init {
        api.sessionToken = sessions.token
        refresh()
        loadMe()
        loadConversations()
    }

    fun refresh(needSort: String = "latest", workSort: String = "latest", needCategory: String? = null, workCategory: String? = null) {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loading = true, error = null)
            runCatching {
                Triple(api.config(), api.needs(needSort, needCategory), api.works(workSort, workCategory))
            }.onSuccess { (config, needs, works) ->
                mutableState.value = mutableState.value.copy(
                    loading = false,
                    config = config,
                    needs = needs.items,
                    works = works.items,
                    storeApps = emptyList(),
                    promoted = works.promoted,
                    searchActive = false,
                )
            }.onFailure { error ->
                val sessionExpired = clearExpiredSession(error)
                mutableState.value = mutableState.value.copy(loading = false, error = if (sessionExpired) null else error.message)
            }
        }
    }

    fun search(query: String) {
        if (query.trim().length < 2) return refresh()
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loading = true, error = null)
            runCatching { api.search(query.trim()) }
                .onSuccess { mutableState.value = mutableState.value.copy(loading = false, needs = it.needs, works = it.works, storeApps = it.storeApps, promoted = emptyList(), searchActive = true) }
                .onFailure {
                    val sessionExpired = clearExpiredSession(it)
                    mutableState.value = mutableState.value.copy(loading = false, error = if (sessionExpired) null else it.message)
                }
        }
    }

    fun signIn(sender: ActivityResultSender, language: String) {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(authenticating = true, error = null)
            runCatching { wallet.signIn(sender, language) }
                .onSuccess { response ->
                    api.sessionToken = response.token
                    sessions.save(response.token, response.user.skrDomain)
                    mutableState.value = mutableState.value.copy(authenticating = false, skrDomain = response.user.skrDomain)
                    loadMe()
                    loadConversations()
                }
                .onFailure { mutableState.value = mutableState.value.copy(authenticating = false, error = it.message) }
        }
    }

    fun signOut() {
        val token = api.sessionToken
        api.sessionToken = null
        sessions.clear()
        clearAccountState()
        if (token != null) viewModelScope.launch { runCatching { api.logout(token) } }
    }

    fun publishNeed(request: CreateNeedRequest, onDone: (Boolean) -> Unit) {
        if (mutableState.value.publishingNeed) return
        mutableState.value = mutableState.value.copy(publishingNeed = true, error = null)
        viewModelScope.launch {
            try { api.createNeed(request); onDone(true) }
            catch (e: Exception) { if (e is CancellationException) throw e; mutableState.value = mutableState.value.copy(error = e.message); onDone(false) }
            finally { mutableState.value = mutableState.value.copy(publishingNeed = false) }
        }
    }

    fun publishWork(request: CreateWorkRequest, imageUris: List<Uri>, onDone: (Boolean) -> Unit) {
        if (mutableState.value.workSubmission.phase in setOf(WorkSubmissionPhase.Uploading, WorkSubmissionPhase.Creating)) return
        viewModelScope.launch {
            val total = imageUris.size
            mutableState.value = mutableState.value.copy(
                error = null,
                workSubmission = WorkSubmissionState(WorkSubmissionPhase.Uploading, currentImage = 1, totalImages = total),
            )
            runCatching {
                require(total in 3..6) { "work_images_3_to_6_required" }
                val uploaded = uploadImages(imageUris)
                mutableState.value = mutableState.value.copy(
                    workSubmission = WorkSubmissionState(WorkSubmissionPhase.Creating, totalImages = total),
                )
                api.createWork(request.copy(iconKey = uploaded.first(), screenshotKeys = uploaded.drop(1)))
            }.onSuccess {
                mutableState.value = mutableState.value.copy(
                    workSubmission = WorkSubmissionState(WorkSubmissionPhase.Success, totalImages = total),
                )
                onDone(true)
            }.onFailure { error ->
                val previous = mutableState.value.workSubmission
                val code = if (clearExpiredSession(error)) "session_expired" else classifyWorkSubmissionError(error)
                Log.e(
                    "LionDAppUpload",
                    "phase=${previous.phase} image=${previous.currentImage}/${previous.totalImages} code=${code} type=${error.javaClass.simpleName}",
                )
                mutableState.value = mutableState.value.copy(
                    error = code,
                    workSubmission = previous.copy(phase = WorkSubmissionPhase.Error, errorCode = code),
                )
                onDone(false)
            }
        }
    }

    fun resetWorkSubmission() {
        mutableState.value = mutableState.value.copy(workSubmission = WorkSubmissionState())
    }

    fun toggleNeed(id: String) = launchMutation { api.reactToNeed(id); refresh() }
    fun toggleWork(id: String) = launchMutation { api.reactToWork(id); refresh() }
    fun toggleComment(id: String, kind: String, targetId: String) = launchMutation { api.reactToComment(id); loadComments(kind, targetId) }

    fun loadComments(kind: String, id: String) {
        mutableState.value = mutableState.value.copy(comments = emptyList())
        viewModelScope.launch {
            runCatching { api.comments(kind, id) }
                .onSuccess { mutableState.value = mutableState.value.copy(comments = it.items) }
                .onFailure {
                    val sessionExpired = clearExpiredSession(it)
                    mutableState.value = mutableState.value.copy(error = if (sessionExpired) null else it.message)
                }
        }
    }

    fun comment(kind: String, id: String, body: String, parentId: String? = null, onDone: (Boolean) -> Unit = {}) = launchMutation(onDone) {
        api.comment(kind, id, body, parentId)
        loadComments(kind, id)
    }

    fun promoteWork(id: String, onDone: (Boolean) -> Unit) = launchMutation(onDone) {
        val order = api.createPromotionOrder(id)
        if (order.network != "simulation") error("onchain_payment_requires_wallet_approval")
        api.simulatePromotion(order.orderId)
        refresh()
    }

    fun loadDonation() {
        val identity = mutableState.value.skrDomain ?: return
        mutableState.value = mutableState.value.copy(donationQuote = null, donationError = null,
            donationSignature = tipPreferences.getString("$identity.signature", null),
            donationStatus = tipPreferences.getString("$identity.status", null))
        viewModelScope.launch {
            try { val config = api.donationConfig(); if (mutableState.value.skrDomain == identity) mutableState.value = mutableState.value.copy(donationConfig = config) }
            catch (e: Exception) { if (e is CancellationException) throw e; mutableState.value = mutableState.value.copy(donationError = e.message) }
        }
    }
    fun prepareDonation(amount: Int) {
        if (mutableState.value.donationBusy || mutableState.value.donationStatus != null) return
        val identity = mutableState.value.skrDomain ?: return
        mutableState.value = mutableState.value.copy(donationBusy = true, donationQuote = null, donationError = null)
        viewModelScope.launch {
            try { val quote = api.donationQuote(amount); if (mutableState.value.skrDomain == identity) mutableState.value = mutableState.value.copy(donationQuote = quote) }
            catch (e: Exception) { if (e is CancellationException) throw e; mutableState.value = mutableState.value.copy(donationError = e.message) }
            finally { mutableState.value = mutableState.value.copy(donationBusy = false) }
        }
    }
    fun sendDonation(sender: ActivityResultSender) {
        val quote = mutableState.value.donationQuote ?: return
        val identity = mutableState.value.skrDomain ?: return
        if (mutableState.value.donationBusy || mutableState.value.donationStatus != null) return
        if (!mutableState.value.donationConfig.allowsTips(BuildConfig.DONATIONS_ENABLED)) {
            mutableState.value = mutableState.value.copy(donationError = "donations_disabled")
            return
        }
        // Persist before launching the wallet. Even a lost wallet callback must not lead to an automatic second payment.
        if (!tipPreferences.edit().putString("$identity.quote", quote.quoteId).putString("$identity.status", "unknown").remove("$identity.signature").commit()) {
            mutableState.value = mutableState.value.copy(donationError = "receipt_storage_unavailable")
            return
        }
        mutableState.value = mutableState.value.copy(donationBusy = true, donationError = null, donationStatus = "unknown")
        viewModelScope.launch {
            try {
                val signature = donationWallet.send(sender, quote)
                tipPreferences.edit().putString("$identity.signature", signature).putString("$identity.status", "pending").commit()
                if (mutableState.value.skrDomain == identity) mutableState.value = mutableState.value.copy(donationSignature = signature, donationStatus = "pending")
                checkDonationInternal(identity, quote.quoteId, signature)
            } catch (e: Exception) { if (e is CancellationException) throw e; if (mutableState.value.skrDomain == identity) mutableState.value = mutableState.value.copy(donationError = e.message) }
            finally { mutableState.value = mutableState.value.copy(donationBusy = false, donationQuote = null) }
        }
    }
    private suspend fun checkDonationInternal(identity: String, quoteId: String, signature: String) {
        val result = api.confirmDonation(quoteId, signature)
        tipPreferences.edit().putString("$identity.status", result.status).commit()
        if (mutableState.value.skrDomain == identity) mutableState.value = mutableState.value.copy(donationStatus = result.status)
    }
    fun checkDonation() {
        val identity = mutableState.value.skrDomain ?: return
        val quoteId = tipPreferences.getString("$identity.quote", null) ?: return
        val signature = tipPreferences.getString("$identity.signature", null) ?: return
        if (mutableState.value.donationBusy) return
        mutableState.value = mutableState.value.copy(donationBusy = true, donationError = null)
        viewModelScope.launch {
            try { checkDonationInternal(identity, quoteId, signature) }
            catch (e: Exception) { if (e is CancellationException) throw e; mutableState.value = mutableState.value.copy(donationError = e.message) }
            finally { mutableState.value = mutableState.value.copy(donationBusy = false) }
        }
    }
    fun resetDonationReceipt() {
        val identity = mutableState.value.skrDomain ?: return
        if (mutableState.value.donationBusy) return
        tipPreferences.edit().remove("$identity.quote").remove("$identity.signature").remove("$identity.status").apply()
        mutableState.value = mutableState.value.copy(donationQuote = null, donationStatus = null, donationSignature = null, donationError = null)
    }

    fun loadConversations(older: Boolean = false) {
        val token = api.sessionToken ?: return
        val cursor = if (older) mutableState.value.conversationCursor ?: return else null
        viewModelScope.launch {
            try {
                val result = api.conversations(cursor)
                if (api.sessionToken == token) mutableState.value = mutableState.value.copy(
                    conversations = (mutableState.value.conversations + result.items).associateBy { it.id }.values.sortedWith(compareByDescending<ConversationItem> { it.updatedAt }.thenByDescending { it.id }),
                    conversationCursor = if (older || mutableState.value.conversations.size <= 50) result.nextCursor else mutableState.value.conversationCursor,
                )
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (api.sessionToken == token && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(chatError = e.message)
            }
        }
    }

    fun contactNeed(needId: String, title: String, author: String) {
        val token = api.sessionToken ?: return
        if (mutableState.value.chatLoading) return
        mutableState.value = mutableState.value.copy(chatLoading = true, chatError = null)
        viewModelScope.launch {
            try {
                val result = api.startConversation(needId)
                if (api.sessionToken == token) {
                    openChat(ConversationItem(result.id, needId, title, author, ""))
                    loadConversations()
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (api.sessionToken == token && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(error = e.message)
            } finally { if (api.sessionToken == token) mutableState.value = mutableState.value.copy(chatLoading = false) }
        }
    }

    fun openChat(chat: ConversationItem) {
        chatGeneration++
        mutableState.value = mutableState.value.copy(activeChat = chat, messages = emptyList(), messageCursor = null, chatError = null,
            chatDraft = "", chatClientId = UUID.randomUUID().toString(), chatSending = false)
    }
    fun closeChat() {
        chatGeneration++
        mutableState.value = mutableState.value.copy(activeChat = null, messages = emptyList(), messageCursor = null, chatError = null,
            chatDraft = "", chatClientId = UUID.randomUUID().toString(), chatSending = false)
        loadConversations()
    }

    fun editChatDraft(text: String) {
        if (mutableState.value.activeChat == null || mutableState.value.chatSending || text.length > 2000) return
        mutableState.value = mutableState.value.copy(chatDraft = text, chatClientId = UUID.randomUUID().toString())
    }

    // Only foreground callers poll. Refresh the loaded window as well as new messages so
    // withdrawals on earlier pages cannot remain visible and bursts cannot leave a gap.
    suspend fun refreshChat(older: Boolean = false) {
        val chat = mutableState.value.activeChat ?: return
        val token = api.sessionToken ?: return
        val generation = chatGeneration
        fun current() = api.sessionToken == token && chatGeneration == generation
        chatRefreshMutex.withLock {
            if (!current()) return
            val cursor = if (older) mutableState.value.messageCursor ?: return else null
            val floor = if (older) null else mutableState.value.messages.firstOrNull()?.seq
            try {
                var page = api.messages(chat.id, cursor)
                if (!current()) return
                val received = page.items.toMutableList()
                while (!older && floor != null && page.nextCursor != null && page.nextCursor!! > floor) {
                    page = api.messages(chat.id, page.nextCursor)
                    if (!current()) return
                    received.addAll(page.items)
                }
                val messages = if (older) (mutableState.value.messages + received).distinctBy { it.id }.sortedBy { it.seq }
                    else received.filter { floor == null || it.seq >= floor }.distinctBy { it.id }.sortedBy { it.seq }
                val nextCursor = if (!older && floor != null && received.any { it.seq < floor }) floor else page.nextCursor
                mutableState.value = mutableState.value.copy(messages = messages, messageCursor = nextCursor, chatError = null)
                if (!older) messages.lastOrNull()?.let { api.readMessages(chat.id, it.seq) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (current() && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(chatError = e.message)
            }
        }
    }
    fun loadOlderMessages() = viewModelScope.launch { refreshChat(true) }

    fun sendChat() {
        val state = mutableState.value
        val chat = state.activeChat ?: return
        val token = api.sessionToken ?: return
        if (state.chatSending || state.chatDraft.isBlank()) return
        val generation = chatGeneration
        fun current() = api.sessionToken == token && chatGeneration == generation
        mutableState.value = state.copy(chatSending = true, chatError = null)
        viewModelScope.launch {
            try {
                api.sendMessage(chat.id, state.chatDraft.trim(), state.chatClientId)
                if (current()) {
                    mutableState.value = mutableState.value.copy(chatDraft = "", chatClientId = UUID.randomUUID().toString())
                    refreshChat()
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (current() && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(chatError = e.message)
            } finally { if (current()) mutableState.value = mutableState.value.copy(chatSending = false) }
        }
    }
    fun deleteChatMessage(messageId: String) {
        val chat = mutableState.value.activeChat ?: return
        val token = api.sessionToken ?: return
        val generation = chatGeneration
        viewModelScope.launch {
            try {
                api.deleteMessage(chat.id, messageId)
                if (api.sessionToken == token && chatGeneration == generation) refreshChat()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (api.sessionToken == token && chatGeneration == generation && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(chatError = e.message)
            }
        }
    }
    fun reportChatMessage(messageId: String, reason: String, done: () -> Unit) {
        val chat = mutableState.value.activeChat ?: return
        val token = api.sessionToken ?: return
        val generation = chatGeneration
        viewModelScope.launch {
            try {
                api.reportMessage(chat.id, messageId, reason)
                if (api.sessionToken == token && chatGeneration == generation) done()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (api.sessionToken == token && chatGeneration == generation && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(chatError = e.message)
            }
        }
    }

    fun loadMe() {
        val token = api.sessionToken ?: return
        viewModelScope.launch {
            try {
                val me = api.me()
                if (api.sessionToken != token) return@launch
                val notifications = api.notifications()
                if (api.sessionToken != token) return@launch
                val blocks = api.blocks()
                if (api.sessionToken == token) mutableState.value = mutableState.value.copy(myProfile = me.profile, myNeeds = me.needs, myWorks = me.works, notifications = notifications.items, blockedUsers = blocks.items)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (api.sessionToken == token && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(error = e.message)
            }
        }
    }

    fun deleteNeed(id: String) = launchMutation { api.deleteNeed(id); loadMe(); refresh() }
    fun deleteWork(id: String, onDone: (Boolean) -> Unit = {}) = launchMutation(onDone) { api.deleteWork(id); loadMe(); refresh() }

    fun deleteAccount(onDone: (Boolean) -> Unit) = launchMutation(onDone) {
        api.deleteAccount()
        signOut()
    }

    fun report(targetType: String, targetId: String, reason: String, details: String, onDone: (Boolean) -> Unit) = launchMutation(onDone) {
        api.report(ReportRequest(targetType, targetId, reason, details))
    }

    fun blockUser(skrDomain: String, onDone: (Boolean) -> Unit) = launchMutation(onDone) {
        api.blockUser(skrDomain)
        clearProfile()
        loadMe()
        refresh()
    }

    fun unblockUser(skrDomain: String) = launchMutation {
        api.unblockUser(skrDomain)
        loadMe()
        refresh()
    }

    fun loadProfile(skrDomain: String) {
        val generation = ++profileGeneration
        val token = api.sessionToken
        mutableState.value = mutableState.value.copy(profilePreview = null, profileNeeds = emptyList(), profileWorks = emptyList())
        viewModelScope.launch {
            try {
                val profile = api.profile(skrDomain)
                if (profileGeneration == generation && api.sessionToken == token) mutableState.value = mutableState.value.copy(
                    profilePreview = profile.profile, profileNeeds = profile.needs, profileWorks = profile.works)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (profileGeneration == generation && api.sessionToken == token && !clearExpiredSession(e)) mutableState.value = mutableState.value.copy(error = e.message)
            }
        }
    }

    fun clearProfile() {
        profileGeneration++
        mutableState.value = mutableState.value.copy(profilePreview = null, profileNeeds = emptyList(), profileWorks = emptyList())
    }

    fun updateProfile(bio: String, socialUrl: String, onDone: (Boolean) -> Unit) = launchMutation(onDone) {
        api.updateProfile(bio, socialUrl)
        loadMe()
    }

    private suspend fun uploadImages(uris: List<Uri>): List<String> = uris.mapIndexed { index, uri ->
        mutableState.value = mutableState.value.copy(
            workSubmission = WorkSubmissionState(
                phase = WorkSubmissionPhase.Uploading,
                currentImage = index + 1,
                totalImages = uris.size,
            ),
        )
        val source = appContext.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8 * 1024)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= 8 * 1024 * 1024) { "image_too_large" }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("image_read_failed")
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(source, 0, source.size, options)
        require(options.outWidth > 0 && options.outHeight > 0) { "invalid_image" }
        var sample = 1
        while (options.outWidth / sample > 1920 || options.outHeight / sample > 1920) sample *= 2
        val bitmap = BitmapFactory.decodeByteArray(source, 0, source.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: error("invalid_image")
        val encoded = ByteArrayOutputStream()
        var quality = 82
        do {
            encoded.reset()
            val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
            check(bitmap.compress(format, quality, encoded)) { "image_encode_failed" }
            quality -= 8
        } while (encoded.size() > 2 * 1024 * 1024 && quality >= 50)
        bitmap.recycle()
        require(encoded.size() <= 2 * 1024 * 1024) { "image_too_large" }
        uploadImageWithRetry(encoded.toByteArray()).key
    }

    private suspend fun uploadImageWithRetry(bytes: ByteArray): top.oneion.liondapp.model.MediaUploadResponse {
        var lastError: Throwable? = null
        repeat(2) { attempt ->
            try {
                return api.uploadImage(bytes, "image/webp")
            } catch (error: Throwable) {
                lastError = error
                if (error is ApiException || !hasCause<IOException>(error) || attempt == 1) throw error
                delay(750)
            }
        }
        throw lastError ?: error("request_failed")
    }

    private fun classifyWorkSubmissionError(error: Throwable): String {
        if (error is ApiException) return error.code
        return when {
            hasCause<FileNotFoundException>(error) -> "image_read_failed"
            hasCause<SecurityException>(error) -> "image_permission_lost"
            hasCause<SocketTimeoutException>(error) -> "network_timeout"
            hasCause<UnknownHostException>(error) -> "network_dns"
            hasCause<SSLException>(error) -> "network_tls"
            hasCause<ConnectException>(error) -> "network_connect"
            hasCause<IOException>(error) -> "network_io"
            hasCause<OutOfMemoryError>(error) -> "image_memory_failed"
            else -> error.message?.takeIf { it.matches(Regex("[a-z0-9_]{3,80}")) } ?: "unexpected_upload_error"
        }
    }

    private inline fun <reified T : Throwable> hasCause(error: Throwable): Boolean {
        var current: Throwable? = error
        repeat(8) {
            if (current is T) return true
            current = current?.cause
        }
        return false
    }

    private fun clearExpiredSession(error: Throwable): Boolean {
        val expired = error is ApiException && error.code in setOf("authentication_required", "invalid_session", "session_expired")
        if (!expired) return false
        api.sessionToken = null
        sessions.clear()
        clearAccountState()
        return true
    }

    private fun clearAccountState() {
        chatGeneration++
        profileGeneration++
        mutableState.value = mutableState.value.copy(
            donationQuote = null, donationStatus = null, donationSignature = null, donationError = null,
            conversations = emptyList(), conversationCursor = null, activeChat = null, messages = emptyList(), messageCursor = null,
            chatError = null, chatDraft = "", chatClientId = UUID.randomUUID().toString(), chatSending = false, chatLoading = false,
            skrDomain = null, myProfile = null, myNeeds = emptyList(), myWorks = emptyList(), notifications = emptyList(), blockedUsers = emptyList(),
            profilePreview = null, profileNeeds = emptyList(), profileWorks = emptyList(),
        )
    }

    private fun launchMutation(onDone: (Boolean) -> Unit = {}, action: suspend () -> Unit) {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(error = null)
            runCatching { action() }
                .onSuccess { onDone(true) }
                .onFailure {
                    val error = if (clearExpiredSession(it)) "session_expired" else it.message
                    mutableState.value = mutableState.value.copy(error = error)
                    onDone(false)
                }
        }
    }
}
