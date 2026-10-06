package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.model.*
import top.oneion.liondapp.ui.*
import top.oneion.liondapp.ui.theme.LionDAppTheme

@RunWith(AndroidJUnit4::class)
class ScreenLayoutAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var engine: MockEngine
    private lateinit var vm: LionViewModel
    private fun start() {
        val prefix = "layout-" + UUID.randomUUID()
        val context = object : ContextWrapper(compose.activity.applicationContext) {
            override fun getApplicationContext(): Context = this
            override fun getSharedPreferences(name: String, mode: Int) = baseContext.getSharedPreferences("$prefix-$name", mode)
        }
        engine = MockEngine { respond(if (it.url.encodedPath == "/v1/config") """{"categories":["游戏"],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}""" else "{}", headers = headersOf(HttpHeaders.ContentType, "application/json")) }
        compose.runOnIdle { vm = LionViewModel(context, ApiClient(engine)) }
    }
    @After fun close() { if (::engine.isInitialized) engine.close() }
    private fun shot(name: String) {
        compose.waitForIdle(); Thread.sleep(350)
        val directory = File(compose.activity.getExternalFilesDir(null), "layout-evidence").apply { mkdirs() }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    @Test fun profileGroupsActivityContentAndAccountAndKeepsEditAccessible() {
        start()
        val need = NeedItem("sample", "tester.skr", "Make daily dApp interactions easier to understand", "My original community feedback", "", "", "其他", createdAt = "2026-10-06T02:00:00Z")
        // Register the synthetic wallet launcher before STARTED, like MainActivity.onCreate.
        lateinit var wallet: ActivityResultSender
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        compose.activityRule.scenario.onActivity { wallet = ActivityResultSender(it) }
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme(darkTheme = false) {
            ProfileScreen(LionUiState(loading = false, skrDomain = "tester.skr", myNeeds = listOf(need), following = listOf(need), followingApps = listOf(StoreAppItem("example.app", "Lionance", storeUrl = "solanadappstore://details?id=example.app"))), Modifier.systemBarsPadding(), compose.activity, wallet, vm, "en", {}, {})
        } } }
        compose.onNodeWithText("Activity & profile").assertIsDisplayed()
        compose.onNodeWithText("My questions & feedback").assertIsDisplayed()
        shot("profile-en-light-top")
        compose.onNodeWithText("Account").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Delete account").performScrollTo().assertIsDisplayed()
        shot("profile-en-light-account")
        compose.onNodeWithText("Edit profile").performScrollTo().performClick()
        compose.onNodeWithText("Bio").assertIsDisplayed()
    }
    @Test fun conversationSeparatesContextPrivacyAndMessagesAndRetainsDetails() {
        start()
        val chat = ConversationItem("sample-chat", "sample", "Discuss a simpler onboarding experience for new Seeker users", "builder.skr", "2026-10-06T02:00:00Z")
        val messages = listOf(ChatMessage("sample-1", 1, "builder.skr", "Which part of the onboarding flow was unclear? I would like to understand the first screen you saw.", "2026-10-06T02:01:00Z"), ChatMessage("sample-2", 2, "tester.skr", "The wallet connection worked. A short explanation before the first interaction would help.", "2026-10-06T02:02:00Z"))
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            ChatDialog(LionUiState(loading = false, skrDomain = "tester.skr", activeChat = chat, messages = messages), vm)
        } } }
        compose.onNodeWithText(chat.title).assertIsDisplayed()
        compose.onNodeWithText(messages[0].body).assertIsDisplayed()
        compose.onNodeWithText("Send").assertIsNotEnabled()
        shot("chat-en-dark")
        compose.onNodeWithContentDescription("Conversation information").performClick()
        compose.onNodeWithText("Discuss scope and delivery here. LionDApp does not collect project payments or guarantee delivery. Never share keys or recovery phrases.").assertIsDisplayed()
    }
}
