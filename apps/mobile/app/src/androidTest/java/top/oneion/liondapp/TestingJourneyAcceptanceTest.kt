package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.Instant
import java.util.UUID
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.data.SessionStore
import top.oneion.liondapp.model.*
import top.oneion.liondapp.ui.*
import top.oneion.liondapp.ui.theme.LionDAppTheme

/** Stateful UI/API-client exercise; synthetic identities never reach the public API.
 * The real Worker lifecycle and access checks are tested separately in Node/SQLite.
 */
@RunWith(AndroidJUnit4::class)
class TestingJourneyAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val json = Json { encodeDefaults = true }

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        val folder = File(instrumentation.targetContext.getExternalFilesDir(null), "testing-journey-evidence").apply { mkdirs() }
        File(folder, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    @Test fun freeJourneyRetainsFailedReportThenCorrectsAndCompletesAcrossTesterAndHost() {
        val fixture = json.parseToJsonElement(InstrumentationRegistry.getInstrumentation().context.assets.open("testing-user-journeys.json").bufferedReader().use { it.readText() }).jsonObject
        fun text(group: String, field: String) = fixture.getValue(group).jsonObject.getValue(field).jsonPrimitive.content
        val report = text("reports", "incomplete")
        val correction = text("review", "correction")
        val corrected = text("reports", "corrected")
        val deadline = Instant.now().plusSeconds(86400).toString()
        val base = TestingCampaign("journey", "maker.skr", "top.lionance.app", appName = "Lionance",
            title = text("campaign", "title"), description = text("campaign", "description"),
            appVersion = text("campaign", "appVersion"), requirements = text("campaign", "requirements"),
            minCharacters = 100, reservationHours = 24, capacity = 2, rewardUnits = "0", feeUnits = "0",
            totalUnits = "0", deadline = deadline, status = "open", fundingState = "free", remaining = 2)
        val actor = mutableStateOf("tester.skr")
        val showNotifications = mutableStateOf(false)
        var opened: String? = null
        var entry: TestingEntry? = null
        var failFirstSubmit = true
        var submitRequests = 0
        var reviewRequests = 0
        var campaignStatus = "open"
        var notificationReads = 0
        val lock = Any()
        val engines = mutableListOf<MockEngine>()
        val viewModels = mutableMapOf<String, LionViewModel>()
        fun item(who: String) = base.copy(status = campaignStatus, remaining = if (entry == null) 2 else 1,
            occupied = if (entry == null) 0 else 1, paid = if (entry?.status == "paid") 1 else 0,
            ownEntry = if (who == "tester.skr") entry else null)
        try {
            for (who in listOf("maker.skr", "tester.skr")) {
                val prefix = "journey-${UUID.randomUUID()}-$who"
                val context = object : ContextWrapper(compose.activity.applicationContext) {
                    override fun getApplicationContext(): Context = this
                    override fun getSharedPreferences(name: String, mode: Int) = baseContext.getSharedPreferences("$prefix-$name", mode)
                }
                SessionStore(context).save("isolated-journey-$who", who)
                val engine = MockEngine { request ->
                    val (payload, status) = synchronized(lock) {
                        val path = request.url.encodedPath
                        var code = HttpStatusCode.OK
                        val data = when {
                            path == "/v1/campaigns/journey/close" -> {
                                assertEquals("maker.skr", who)
                                campaignStatus = "closed"
                                json.encodeToString(item(who))
                            }
                            path == "/v1/campaigns/journey/complete" -> {
                                assertEquals("maker.skr", who)
                                campaignStatus = "completed"
                                json.encodeToString(item(who))
                            }
                            path == "/v1/campaigns/journey/join" -> {
                                assertEquals("tester.skr", who)
                                assertEquals("Bearer isolated-journey-$who", request.headers[HttpHeaders.Authorization])
                                check(entry == null)
                                entry = TestingEntry("result", "journey", who, "reserved", submitBy = deadline)
                                json.encodeToString(item(who))
                            }
                            path == "/v1/testing-entries/result/submit" -> {
                                assertEquals("tester.skr", who)
                                val body = json.decodeFromString<TestingReportRequest>((request.body as TextContent).text)
                                assertEquals(entry!!.revision, body.revision)
                                assertTrue(body.evidenceUrl.isEmpty())
                                submitRequests++
                                if (failFirstSubmit) {
                                    failFirstSubmit = false; code = HttpStatusCode.ServiceUnavailable
                                    """{"error":"moderation_unavailable"}"""
                                } else {
                                    entry = entry!!.copy(status = "submitted", body = body.body, revision = entry!!.revision + 1, submittedAt = Instant.now().toString())
                                    json.encodeToString(entry!!)
                                }
                            }
                            path == "/v1/testing-entries/result/review" -> {
                                assertEquals("maker.skr", who)
                                val body = json.decodeFromString<TestingReviewRequest>((request.body as TextContent).text)
                                assertEquals(entry!!.revision, body.revision)
                                reviewRequests++
                                entry = if (body.decision == "changes") {
                                    assertEquals(correction, body.reason)
                                    entry!!.copy(status = "changes_requested", reviewReason = body.reason, correctionCount = 1, revision = entry!!.revision + 1)
                                } else {
                                    assertEquals("approve", body.decision)
                                    entry!!.copy(status = "paid", reviewReason = "", revision = entry!!.revision + 1, paymentSignature = null)
                                }
                                json.encodeToString(entry!!)
                            }
                            path == "/v1/campaigns/config" -> """{"paymentMode":"disabled","feeBps":1000}"""
                            path == "/v1/campaigns/journey/entries" -> {
                                assertEquals("maker.skr", who)
                                json.encodeToString(TestingEntriesResponse(listOfNotNull(entry)))
                            }
                            path == "/v1/campaigns/journey" -> json.encodeToString(item(who))
                            path == "/v1/campaigns" -> json.encodeToString(CampaignListResponse(
                                if (request.url.parameters["scope"] == "open" && campaignStatus != "open") emptyList() else listOf(item(who))))
                            path == "/v1/notifications" -> json.encodeToString(NotificationListResponse(
                                if (who == "tester.skr" && entry?.status == "paid") listOf(NotificationItem(
                                    "completion", "testing_update", Instant.now().toString(), payload = NotificationPayload(
                                        targetType = "campaign", targetId = "journey", title = "Synthetic completion update"))) else emptyList()))
                            path == "/v1/notifications/completion/read" -> { notificationReads++; "{}" }
                            path == "/v1/me" -> json.encodeToString(MeResponse(PublicProfile(who, createdAt = "2026-10-06")))
                            path == "/v1/config" -> """{"categories":["其他"],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}"""
                            else -> """{"items":[]}"""
                        }
                        data to code
                    }
                    respond(payload, status, headersOf(HttpHeaders.ContentType, "application/json"))
                }
                engines += engine
                compose.runOnIdle { viewModels[who] = LionViewModel(context, ApiClient(engine)) }
            }
            compose.setContent {
                key(actor.value) {
                    val vm = viewModels.getValue(actor.value)
                    val state by vm.state.collectAsState()
                    CompositionLocalProvider(LocalAppLanguage provides "en") {
                        LionDAppTheme {
                            if (showNotifications.value) CommunityNotifications(state, vm, {}, { opened = it }, {})
                            else CampaignDetail("journey", state, vm, {}, { fail("Isolated identities are already signed in") }, {})
                        }
                    }
                }
            }
            fun switch(who: String) {
                compose.runOnIdle { actor.value = who; viewModels.getValue(who).loadCampaign("journey") }
                compose.waitUntil(5000) { viewModels.getValue(who).state.value.campaign != null }
            }
            val tester = viewModels.getValue("tester.skr")
            val maker = viewModels.getValue("maker.skr")
            compose.waitUntil(5000) { tester.state.value.campaign != null }
            compose.onNodeWithText("Join this test").performClick()
            compose.waitUntil(5000) { tester.state.value.campaign?.ownEntry?.status == "reserved" }
            compose.onNodeWithText("Submit testing result").performClick()
            compose.onNodeWithText("What you tested and what happened").performTextInput(report)
            compose.onNodeWithText("Submit for review").performScrollTo().performClick()
            compose.waitUntil(5000) { tester.state.value.campaignError == "moderation_unavailable" }
            compose.onNodeWithText("What you tested and what happened").performScrollTo().assertTextContains(report)
            screenshot("01-failed-submit-retained")
            compose.onNodeWithText("Submit for review").performScrollTo().performClick()
            compose.waitUntil(5000) { tester.state.value.campaign?.ownEntry?.status == "submitted" }
            compose.waitUntil(5000) { tester.state.value.campaigns.firstOrNull()?.ownEntry?.status == "submitted" }
            switch("maker.skr")
            compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("Review result"))
            compose.onNodeWithText("Review result").performClick()
            compose.onNodeWithText("Approve").performScrollTo().performClick()
            compose.onNodeWithText("Request more detail").performClick()
            compose.onNodeWithText("Reason against the published criteria").performScrollTo().performTextInput(correction)
            compose.onNodeWithText("Confirm review").performScrollTo().performClick()
            compose.waitUntil(5000) { maker.state.value.campaignEntries.firstOrNull()?.status == "changes_requested" }
            switch("tester.skr")
            assertEquals("changes_requested", tester.state.value.campaigns.single().ownEntry?.status)
            compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText(correction))
            compose.onNodeWithText(correction).assertIsDisplayed()
            screenshot("02-tester-sees-correction")
            compose.onNodeWithTag("campaign_primary_action").performClick()
            compose.onNodeWithText("What you tested and what happened").performScrollTo().assertTextContains(report).performTextReplacement(corrected)
            compose.onNodeWithText("Submit for review").performScrollTo().performClick()
            compose.waitUntil(5000) { tester.state.value.campaign?.ownEntry?.status == "submitted" }
            switch("maker.skr")
            compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("Review result"))
            compose.onNodeWithText("Review result").performClick()
            compose.onNodeWithText("Confirm review").performScrollTo().performClick()
            compose.waitUntil(5000) { maker.state.value.campaignEntries.firstOrNull()?.status == "paid" }
            switch("tester.skr")
            assertEquals("paid", tester.state.value.campaigns.single().ownEntry?.status)
            compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("My testing result"))
            compose.onNodeWithText("Completed").assertIsDisplayed()
            screenshot("03-free-result-completed")
            compose.runOnIdle {
                assertEquals(corrected, entry!!.body)
                assertEquals(1, entry!!.correctionCount)
                assertNull(entry!!.paymentSignature)
                assertEquals(3, submitRequests) // One failure and two accepted submissions.
                assertEquals(2, reviewRequests)
            }
            compose.runOnIdle { maker.campaignAction("journey", "close") }
            compose.waitUntil(5000) { maker.state.value.campaign?.status == "closed" }
            compose.runOnIdle { maker.campaignAction("journey", "complete") }
            compose.waitUntil(5000) { maker.state.value.campaign?.status == "completed" }
            compose.runOnIdle { tester.loadCampaign("journey") }
            compose.waitUntil(5000) { tester.state.value.campaign?.status == "completed" }
            assertTrue("Completed campaigns must leave the cached Available feed", tester.state.value.campaigns.isEmpty())
            assertTrue("Notifications are initially stale, as on a second phone", tester.state.value.notifications.isEmpty())
            compose.runOnIdle { showNotifications.value = true }
            compose.waitUntil(5000) { tester.state.value.notifications.isNotEmpty() }
            compose.onNodeWithText("Synthetic completion update").assertIsDisplayed().performClick()
            compose.waitUntil(5000) { notificationReads == 1 }
            assertEquals("journey", opened)
        } finally { engines.forEach { it.close() } }
    }
}
