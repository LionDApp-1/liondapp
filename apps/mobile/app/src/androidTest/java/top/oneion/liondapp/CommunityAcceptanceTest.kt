package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.model.*
import top.oneion.liondapp.ui.*
import top.oneion.liondapp.ui.theme.LionDAppTheme

@RunWith(AndroidJUnit4::class)
class CommunityAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var vm: LionViewModel
    private lateinit var engine: MockEngine
    private val app = StoreAppItem("app.one", "Useful App", storeUrl = "solanadappstore://details?id=app.one")

    private fun start(offlineCatalogOnce: Boolean = false) {
        val prefix = "community-" + UUID.randomUUID()
        val context = object : ContextWrapper(compose.activity.applicationContext) {
            override fun getApplicationContext(): Context = this
            override fun getSharedPreferences(name: String, mode: Int) = baseContext.getSharedPreferences("$prefix-$name", mode)
        }
        var catalogFailed = false
        engine = MockEngine {
            val path = it.url.encodedPath
            if (path == "/v1/store-apps" && offlineCatalogOnce && !catalogFailed) {
                catalogFailed = true
                throw java.io.IOException("connection closed")
            }
            val error = when (path) {
                "/v1/works/deleted" -> "work_not_found"
                "/v1/needs/deleted" -> "content_not_found"
                else -> null
            }
            respond(if (error != null) """{"error":"$error"}""" else if (path == "/v1/config") """{"categories":["其他"],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}""" else if (path == "/v1/store-apps") """{"items":[{"android_package":"app.one","display_name":"Useful App","store_url":"solanadappstore://details?id=app.one"}]}""" else "{}", status = if (error != null) HttpStatusCode.NotFound else HttpStatusCode.OK, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        compose.runOnIdle { vm = LionViewModel(context, ApiClient(engine)) }
    }

    @After fun close() { if (::engine.isInitialized) engine.close() }

    @Test fun anonymousDraftSurvivesSignInAndDoesNotRequireAProductProposal() {
        start()
        val state = mutableStateOf(LionUiState(loading = false))
        var askedSignIn = false
        var submitted: CreateNeedRequest? = null
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            CommunityComposer(state.value, vm, null, null, false, {}, { askedSignIn = true }) { submitted = it }
        } } }
        compose.onNodeWithText("What are you trying to do? What is getting in the way?").performTextInput("I cannot find a convenient payment app")
        compose.onNodeWithText("Sign in to publish").performScrollTo().performClick()
        assertTrue(askedSignIn); assertNull(submitted)
        compose.runOnIdle { state.value = state.value.copy(skrDomain = "tester.skr") }
        compose.onNodeWithText("Publish").performScrollTo().performClick()
        assertEquals("I cannot find a convenient payment app", submitted?.problem)
        assertEquals("", submitted?.solutionIdea); assertEquals("", submitted?.audience)
    }

    @Test fun selectedAppAndPraiseSurviveSavedStateRestoration() {
        start()
        val restoration = StateRestorationTester(compose)
        var submitted: CreateNeedRequest? = null
        restoration.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            CommunityComposer(LionUiState(loading = false, skrDomain = "tester.skr"), vm, null, app, true, {}, {}) { submitted = it }
        } } }
        compose.onNodeWithText("Suggestion").performClick()
        compose.onNodeWithText("Praise").performClick()
        compose.onNodeWithText("Your experience").performTextInput("The new interface is much easier to use")
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("Useful App").assertIsDisplayed()
        compose.onNodeWithText("Publish").performScrollTo().performClick()
        assertEquals("feedback", submitted?.kind)
        assertEquals("praise", submitted?.feedbackType)
        assertEquals("app.one", submitted?.storePackage)
        assertEquals("The new interface is much easier to use", submitted?.problem)
    }

    @Test fun editingKeepsRecordRevisionAndAppAssociationAfterRestoration() {
        start()
        val need = NeedItem("existing", "tester.skr", "Feedback", "Original experience", "", "", "其他", kind = "feedback", storePackage = "app.one", appName = "Useful App", feedbackType = "issue", revision = 7, createdAt = "2026-10-04")
        val restoration = StateRestorationTester(compose)
        var submitted: CreateNeedRequest? = null
        restoration.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            CommunityComposer(LionUiState(loading = false, skrDomain = "tester.skr"), vm, need, null, true, {}, {}) { submitted = it }
        } } }
        compose.onNodeWithText("Your experience").performTextReplacement("Updated with reproduction steps")
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("Save").performScrollTo().performClick()
        assertEquals(7, submitted?.revision)
        assertEquals("app.one", submitted?.storePackage)
        assertEquals("Updated with reproduction steps", submitted?.problem)
    }

    private fun unavailableNotification(targetType: String) {
        start()
        var navigated = false
        val notification = NotificationItem("old", if (targetType == "need") "need_progress" else "work_review", "2026-10-04", payload = NotificationPayload(targetType = targetType, targetId = "deleted", title = "Unavailable post"))
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            val state by vm.state.collectAsState()
            CommunityNotifications(state.copy(notifications = listOf(notification)), vm, {}) { navigated = true }
        } } }
        compose.onNodeWithText("Unavailable post").performClick()
        compose.waitUntil(5000) { vm.state.value.error != null }
        compose.onNodeWithText("This content is no longer available.").assertIsDisplayed()
        compose.onNodeWithText("Unavailable post").assertIsDisplayed()
        assertFalse(navigated)
    }

    @Test fun unavailableWorkNotificationShowsAnErrorInTheDialog() = unavailableNotification("work")
    @Test fun unavailableNeedNotificationShowsAnErrorInTheDialog() = unavailableNotification("need")

    @Test fun offlineCatalogShowsNetworkMessageAndRetryRestoresSelection() {
        start(offlineCatalogOnce = true)
        var selected: StoreAppItem? = null
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            val state by vm.state.collectAsState()
            CatalogPicker(state, vm, {}) { selected = it }
        } } }
        compose.waitUntil(5000) { vm.state.value.catalogError != null }
        compose.onNodeWithText("Unable to connect. Check your network and retry.").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()
        compose.waitUntil(5000) { vm.state.value.catalogResults.isNotEmpty() }
        compose.onNodeWithText("Useful App").performClick()
        assertEquals("app.one", selected?.androidPackage)
        assertNull(vm.state.value.catalogError)
    }
}
