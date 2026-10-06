package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import io.ktor.http.content.TextContent
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.data.SessionStore
import top.oneion.liondapp.model.*
import top.oneion.liondapp.ui.ChatDialog
import top.oneion.liondapp.ui.LocalAppLanguage
import top.oneion.liondapp.ui.theme.LionDAppTheme

/** Runs in top.oneion.liondapp.qa. Every HTTP request uses MockEngine, never a live API. */
@RunWith(AndroidJUnit4::class)
class MessagingAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var vm: LionViewModel
    private lateinit var context: IsolatedContext
    private lateinit var backend: Backend
    private lateinit var factory: ViewModelProvider.Factory
    private val chat = ConversationItem("chat", "need", "Mobile prototype", "maker.skr", "2026-09-16T00:00:00Z")

    private fun start() {
        backend = Backend()
        compose.runOnIdle {
            context = IsolatedContext(compose.activity.applicationContext)
            SessionStore(context).save("synthetic-session", "dev.skr")
            factory = viewModelFactory { initializer { LionViewModel(context, ApiClient(backend.engine)) } }
            vm = ViewModelProvider(compose.activity, factory)[LionViewModel::class.java]
            vm.openChat(chat)
        }
        compose.waitUntil(5_000) { !vm.state.value.loading && vm.state.value.myProfile != null }
    }

    private fun showChat() = compose.setContent {
        val state by vm.state.collectAsState()
        CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme { ChatDialog(state, vm) } }
    }

    private fun refresh(older: Boolean = false) = runBlocking { vm.refreshChat(older) }

    @After fun cleanUp() {
        if (::vm.isInitialized) compose.runOnIdle { compose.activity.viewModelStore.clear() }
        if (::backend.isInitialized) { backend.release.complete(Unit); backend.engine.close() }
        if (::context.isInitialized) context.clearTestPreferences()
    }

    @Test fun activityRecreationRetainsConversationDraftAndRetryIdentity() {
        start()
        showChat()
        compose.onNode(hasSetTextAction()).performTextInput("Keep my project questions")
        val previous = vm
        val retryId = vm.state.value.chatClientId
        compose.activityRule.scenario.recreate()
        compose.activityRule.scenario.onActivity { activity ->
            vm = ViewModelProvider(activity, factory)[LionViewModel::class.java]
            assertSame(previous, vm)
            assertEquals("chat", vm.state.value.activeChat?.id)
            assertEquals("Keep my project questions", vm.state.value.chatDraft)
            assertEquals(retryId, vm.state.value.chatClientId)
        }
    }

    @Test fun failedSendRetainsDraftAndIdAndRetryCreatesOneMessage() {
        start()
        backend.failAfterSaving = true
        showChat()
        compose.onNode(hasSetTextAction()).performTextInput("Please describe the first milestone")
        compose.onNodeWithText("Send", useUnmergedTree = true).performClick()
        compose.waitUntil(5_000) { !vm.state.value.chatSending && vm.state.value.chatError != null }
        assertEquals("Please describe the first milestone", vm.state.value.chatDraft)
        val retryId = vm.state.value.chatClientId
        compose.onNodeWithText("Send", useUnmergedTree = true).performClick()
        compose.waitUntil(5_000) { !vm.state.value.chatSending && vm.state.value.chatDraft.isEmpty() }
        assertEquals(1, backend.messages.size)
        assertEquals(listOf(retryId, retryId), backend.sentIds.toList())
        compose.onNodeWithText("Please describe the first milestone").assertIsDisplayed()
    }

    @Test fun sendingAcrossActivityRecreationClearsTheRetainedDraft() {
        start()
        backend.delaySend = true
        compose.runOnIdle { vm.editChatDraft("A question sent during rotation"); vm.sendChat() }
        compose.waitUntil(5_000) { backend.entered.isCompleted }
        compose.activityRule.scenario.recreate()
        backend.release.complete(Unit)
        compose.waitUntil(5_000) { !vm.state.value.chatSending }
        assertEquals("", vm.state.value.chatDraft)
        assertEquals(1, vm.state.value.messages.size)
    }

    @Test fun logoutDiscardsLateProfileAndMessageResponses() {
        start()
        backend.delayReads = true
        compose.runOnIdle { vm.loadMe(); vm.loadOlderMessages() }
        // A first-page refresh is independent of Compose and can be held while signing out.
        val job = CompletableDeferred<Unit>()
        val worker = Thread { runBlocking { vm.refreshChat(); job.complete(Unit) } }.apply { start() }
        compose.waitUntil(5_000) { backend.entered.isCompleted }
        compose.runOnIdle { vm.signOut() }
        backend.release.complete(Unit)
        runBlocking { job.await() }
        worker.join(5_000)
        compose.waitForIdle()
        assertNull(vm.state.value.skrDomain)
        assertNull(vm.state.value.myProfile)
        assertNull(vm.state.value.activeChat)
        assertTrue(vm.state.value.messages.isEmpty())
        assertTrue(vm.state.value.conversations.isEmpty())
    }

    @Test fun refreshIncludesLargeIncomingBurstAndRemovalsOnOlderPages() {
        start()
        for (n in 1..55) backend.messages.add(message(n))
        refresh()
        assertEquals(50, vm.state.value.messages.size)
        refresh(older = true)
        assertEquals(55, vm.state.value.messages.size)
        backend.messages[0] = message(1).copy(body = "", deletedAt = "2026-09-16T01:00:00Z")
        for (n in 56..120) backend.messages.add(message(n))
        refresh()
        assertEquals((1L..120L).toList(), vm.state.value.messages.map { it.seq })
        assertEquals("", vm.state.value.messages.first().body)
        assertNotNull(vm.state.value.messages.first().deletedAt)
        assertNull(vm.state.value.messageCursor)
    }

    @Test fun reopeningSameChatDoesNotApplyAnEarlierSendCallback() {
        start()
        backend.delaySend = true
        compose.runOnIdle { vm.editChatDraft("Earlier send"); vm.sendChat() }
        compose.waitUntil(5_000) { backend.entered.isCompleted }
        compose.runOnIdle { vm.closeChat(); vm.openChat(chat); vm.editChatDraft("New draft") }
        backend.release.complete(Unit)
        compose.waitUntil(5_000) { backend.messages.size == 1 }
        compose.waitForIdle()
        assertEquals("New draft", vm.state.value.chatDraft)
        assertFalse(vm.state.value.chatSending)
    }

    private fun message(n: Int) = ChatMessage("m$n", n.toLong(), "maker.skr", "Message $n", "2026-09-16T00:00:00Z")

    private class IsolatedContext(base: Context) : ContextWrapper(base) {
        private val prefix = "qa_${UUID.randomUUID()}_"
        private val names = mutableSetOf<String>()
        override fun getApplicationContext(): Context = this
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
            names.add(prefix + name)
            return super.getSharedPreferences(prefix + name, mode)
        }
        fun clearTestPreferences() { names.forEach { baseContext.deleteSharedPreferences(it) } }
    }

    private class Backend {
        val messages = CopyOnWriteArrayList<ChatMessage>()
        val sentIds = CopyOnWriteArrayList<String>()
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        @Volatile var failAfterSaving = false
        @Volatile var delaySend = false
        @Volatile var delayReads = false
        val engine = MockEngine { request ->
            val path = request.url.encodedPath
            if (delayReads && (path == "/v1/me" || path.endsWith("/messages"))) {
                entered.complete(Unit); release.await()
            }
            var status = HttpStatusCode.OK
            val body = when {
                path == "/v1/discover" -> "{}"
                path == "/v1/config" -> """{"categories":[],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}"""
                path == "/v1/me" -> """{"profile":{"skr_domain":"dev.skr","created_at":"2026-09-16T00:00:00Z"}}"""
                path == "/v1/needs" || path == "/v1/works" || path == "/v1/notifications" || path == "/v1/blocks" || path == "/v1/conversations" || path == "/v1/following" || path == "/v1/following-apps" -> """{"items":[]}"""
                path.endsWith("/messages") && request.method == HttpMethod.Post -> {
                    if (delaySend) { entered.complete(Unit); release.await() }
                    val payload = Json.decodeFromString<SendMessageRequest>((request.body as TextContent).text)
                    sentIds.add(payload.clientId)
                    if (messages.none { it.id == payload.clientId }) messages.add(ChatMessage(payload.clientId, 1, "dev.skr", payload.body, "2026-09-16T00:00:00Z"))
                    if (failAfterSaving) { failAfterSaving = false; throw IOException("network_io") }
                    Json.encodeToString(CreatedResponse(payload.clientId))
                }
                path.endsWith("/messages") -> {
                    val before = request.url.parameters["before"]?.toLong() ?: Long.MAX_VALUE
                    val rows = messages.filter { it.seq < before }.sortedByDescending { it.seq }
                    val page = rows.take(50).reversed()
                    Json.encodeToString(MessageList(page, if (rows.size > 50) page.first().seq else null))
                }
                path.endsWith("/read") -> """{"updated":true}"""
                path == "/v1/auth/logout" -> { status = HttpStatusCode.NoContent; "" }
                else -> error("Unexpected test HTTP request: ${request.method.value} $path")
            }
            respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
        }
    }
}
