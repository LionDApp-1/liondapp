package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
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

@RunWith(AndroidJUnit4::class)
class CampaignAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var vm: LionViewModel
    private lateinit var engine: MockEngine
    private val json = Json { encodeDefaults = true }
    private val report = "I tested the daily interaction on Seeker. The flow was quick and easy to follow. The transaction confirmation was clear. A more specific retry message after connection loss would help."
    private val entry = TestingEntry("result", "campaign", "tester.skr", "reserved", submitBy=Instant.now().plusSeconds(86400).toString())
    private val campaign = TestingCampaign("campaign", "maker.skr", "app.one", appName="Lionance", title="Test the daily interaction on Seeker", description="Try the daily interaction flow and share what worked, what failed, and what you would improve.", appVersion="1.0", requirements="Complete one daily interaction on Seeker. Describe the confirmation, loading and retry behavior. Include a specific improvement or a successful result.", minCharacters=100, reservationHours=24, capacity=100, rewardUnits="10000000", feeUnits="1000000", totalUnits="1100000000", deadline=Instant.now().plusSeconds(7*86400).toString(), status="open", fundingState="simulated", remaining=99, occupied=1, rewardPoolUnits="1000000000", lockedUnits="11000000", refundableUnits="1089000000")

    private fun start(item: TestingCampaign=campaign, identity: String?=null, entries: List<TestingEntry> = emptyList(), submitError: Boolean=false) {
        val prefix="campaign-"+UUID.randomUUID()
        val context=object: ContextWrapper(compose.activity.applicationContext) {
            override fun getApplicationContext(): Context=this
            override fun getSharedPreferences(name: String,mode: Int)=baseContext.getSharedPreferences("$prefix-$name",mode)
        }
        if(identity!=null)SessionStore(context).save("isolated-qa-session",identity)
        engine=MockEngine { request ->
            val path=request.url.encodedPath
            val error=submitError && path.endsWith("/submit")
            val payload=when {
                error -> """{"error":"moderation_unavailable"}"""
                path=="/v1/campaigns/config" -> """{"paymentMode":"simulation","feeBps":1000}"""
                path=="/v1/campaigns" -> json.encodeToString(CampaignListResponse(listOf(item)))
                path=="/v1/campaigns/campaign/entries" -> json.encodeToString(TestingEntriesResponse(entries))
                path=="/v1/campaigns/campaign" -> json.encodeToString(item)
                path=="/v1/config" -> """{"categories":["其他"],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}"""
                path=="/v1/me" -> json.encodeToString(MeResponse(PublicProfile(identity?:"tester.skr",createdAt="2026-10-04")))
                path=="/v1/store-apps" -> json.encodeToString(StoreAppListResponse(listOf(StoreAppItem("app.one","Lionance",storeUrl="solanadappstore://details?id=app.one"))))
                else -> """{"items":[]}"""
            }
            respond(payload,if(error)HttpStatusCode.ServiceUnavailable else HttpStatusCode.OK,headersOf(HttpHeaders.ContentType,"application/json"))
        }
        compose.runOnIdle {vm=LionViewModel(context,ApiClient(engine))}
    }

    @After fun close() {if(::engine.isInitialized)engine.close()}

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val bitmap=instrumentation.uiAutomation.takeScreenshot()
        val folder=File(instrumentation.targetContext.getExternalFilesDir(null),"campaign-evidence").apply {mkdirs()}
        File(folder,"$name.png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
        bitmap.recycle()
    }

    @Test fun availableCampaignShowsNetRewardAndSimulationAndRequiresSignInForPrivateLists() {
        start()
        var opened: String?=null
        var signIn=false
        compose.setContent {CompositionLocalProvider(LocalAppLanguage provides "en") {LionDAppTheme {
            val state by vm.state.collectAsState()
            Surface(Modifier.fillMaxSize()) {CampaignsScreen(state,Modifier,vm,{signIn=true},{},{opened=it})}
        }}}
        compose.waitUntil(5000){vm.state.value.campaigns.isNotEmpty()}
        compose.onNodeWithText("10 SKR").assertIsDisplayed()
        compose.onNodeWithText("Simulation · no real SKR").assertIsDisplayed()
        screenshot("01-testing-feed-en")
        compose.onNodeWithText("Hosted").performClick()
        assertTrue(signIn)
        compose.onNodeWithText(campaign.title).performClick()
        assertEquals(campaign.id,opened)
    }

    @Test fun detailKeepsJoinVisibleWhileReadingRequirements() {
        start()
        var signIn=false
        compose.setContent {CompositionLocalProvider(LocalAppLanguage provides "en") {LionDAppTheme {
            val state by vm.state.collectAsState()
            CampaignDetail("campaign",state,vm,{},{signIn=true},{})
        }}}
        compose.waitUntil(5000){vm.state.value.campaign!=null}
        compose.onNodeWithTag("campaign_primary_action").assertIsDisplayed()
        compose.onNodeWithText("Test requirements").assertIsDisplayed()
        screenshot("02-testing-detail-en")
        compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("Rewards & spots"))
        compose.onNodeWithTag("campaign_primary_action").assertIsDisplayed().performClick()
        assertTrue(signIn)
    }

    @Test fun reportChecksEffectiveCharactersAndPreservesTextOnFailure() {
        start(campaign.copy(ownEntry=entry),"tester.skr",submitError=true)
        compose.setContent {CompositionLocalProvider(LocalAppLanguage provides "en") {LionDAppTheme {
            val state by vm.state.collectAsState()
            CampaignDetail("campaign",state,vm,{},{},{})
        }}}
        compose.waitUntil(5000){vm.state.value.campaign!=null}
        compose.onNodeWithTag("campaign_primary_action").performClick()
        compose.onNodeWithText("What you tested and what happened").performTextInput("a"+" \n\u200b".repeat(40))
        compose.onNodeWithText("Submit for review").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("What you tested and what happened").performScrollTo().performTextReplacement(report)
        compose.onNodeWithText("Submit for review").performScrollTo().assertIsEnabled().performClick()
        compose.waitUntil(5000){vm.state.value.campaignError=="moderation_unavailable"}
        compose.onNodeWithText("What you tested and what happened").performScrollTo().assertTextContains(report)
        screenshot("03-report-draft-error-en")
    }

    @Test fun hostReviewShowsCriteriaAndRequiresARejectionReason() {
        val submitted=entry.copy(status="submitted",body=report,submittedAt=Instant.now().toString(),revision=2)
        start(campaign,"maker.skr",listOf(submitted))
        compose.setContent {CompositionLocalProvider(LocalAppLanguage provides "en") {LionDAppTheme {
            val state by vm.state.collectAsState()
            CampaignDetail("campaign",state,vm,{},{},{})
        }}}
        compose.waitUntil(5000){vm.state.value.campaignEntries.isNotEmpty()}
        compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("Host overview"))
        screenshot("04-host-balances-en")
        compose.onNodeWithTag("campaign_detail_list").performScrollToNode(hasText("Review result"))
        compose.onNodeWithText("Review result").performClick()
        compose.onNodeWithText(campaign.requirements).assertIsDisplayed()
        compose.onNodeWithText("Approve").performScrollTo().performClick()
        compose.onNodeWithText("Reject with reason").performClick()
        compose.onNodeWithText("Confirm review").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Reason against the published criteria").performScrollTo().performTextInput("The requested retry test is missing.")
        compose.onNodeWithText("Confirm review").performScrollTo().assertIsEnabled()
        screenshot("05-review-result-en")
    }
}
