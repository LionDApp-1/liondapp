package top.oneion.liondapp

import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.*
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
import java.io.File
import java.util.UUID
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.model.NeedItem
import top.oneion.liondapp.model.WorkItem
import top.oneion.liondapp.model.StoreAppItem
import top.oneion.liondapp.model.CommentItem
import top.oneion.liondapp.ui.*
import top.oneion.liondapp.ui.theme.LionDAppTheme

@RunWith(AndroidJUnit4::class)
class PostDetailAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var engine: MockEngine
    private lateinit var vm: LionViewModel
    private var edited = false
    private val need = NeedItem("gamefi-example", "example.skr", "做一个gamefi游戏", "我觉得如果把梦境放在游戏里会很好玩", "做一款视频生成dapp，加入解梦的功能", "所有人群", "游戏", requestType = "paid_development", budgetSkr = 10000, createdAt = "2026-10-04T09:00:00.000Z")
    private fun show(language: String, dark: Boolean, target: DetailTarget = need.toDetailTarget()) {
        val prefix="detail-"+UUID.randomUUID()
        val context=object: ContextWrapper(compose.activity.applicationContext) {
            override fun getApplicationContext(): Context = this
            override fun getSharedPreferences(name: String, mode: Int) = baseContext.getSharedPreferences("$prefix-$name",mode)
        }
        engine=MockEngine { respond(if(it.url.encodedPath=="/v1/config") """{"categories":["游戏"],"recommendation":{"priceSkr":10,"durationDays":7},"environment":"devnet"}""" else "{}",headers=headersOf(HttpHeaders.ContentType,"application/json")) }
        compose.runOnIdle { vm=LionViewModel(context,ApiClient(engine)) }
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides language) { LionDAppTheme(darkTheme=dark) {
            DetailDialog(target,LionUiState(loading=false,skrDomain="example.skr",detailNeed=if(target.kind=="need")need else null,comments=if(target.kind=="work") List(3) { index -> CommentItem("sample-$index", "tester.skr", "work", target.id, body="Synthetic feedback for UI acceptance.", createdAt="2026-10-06T02:00:00.000Z") } else emptyList()),{}, {},vm,compose.activity,{}, {},{edited=true})
        } } }
    }
    @After fun close() { if(::engine.isInitialized)engine.close() }
    private fun shot(name: String) {
        val directory=File(compose.activity.getExternalFilesDir(null),"detail-evidence").apply {mkdirs()}
        compose.waitForIdle()
        Thread.sleep(350) // Native Dialog enter animation is outside the Compose clock.
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(directory,"$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
        bitmap.recycle()
    }
    @Test fun chineseGameFiDetailKeepsContentAndSeparatesParticipation() {
        show("zh",true)
        compose.onAllNodesWithText(need.title).assertCountEquals(1)
        compose.onNodeWithTag("post_topic").assertIsDisplayed()
        compose.onNodeWithTag("post_content").assertIsDisplayed()
        compose.onNodeWithText(need.problem).assertIsDisplayed()
        shot("gamefi-zh-top")
        compose.onNodeWithTag("post_approach").performScrollTo()
        compose.onNodeWithText(need.solutionIdea).assertIsDisplayed()
        compose.onNodeWithText("进展与参与").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("预算意向：10000 SKR").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("更新进展或结果").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("打开评论").assertIsDisplayed()
        shot("gamefi-zh-participation")
        compose.onNodeWithContentDescription("帖子选项").performClick()
        compose.onNodeWithText("编辑帖子").performClick()
        assertTrue(edited)
    }
    @Test fun englishControlsWorkWithOriginalChineseUserContentInLightTheme() {
        show("en",false)
        compose.onAllNodesWithText(need.title).assertCountEquals(1)
        compose.onNodeWithText("The need").assertIsDisplayed()
        compose.onNodeWithText(need.problem).assertIsDisplayed()
        shot("gamefi-en-light-top")
        compose.onNodeWithContentDescription("Open comments").performClick()
        compose.onNodeWithTag("discussion_sheet").assertIsDisplayed()
        compose.onNodeWithText("No comments yet").assertIsDisplayed()
    }
    // Synthetic identity with the public showcase's media and short original description.
    private val lionance = WorkItem("lionance-example", "example.skr", "Lionance", "一键交互", "一键交互", "", category = "DeFi", tags = listOf("defi"), iconKey = "uploads/lan.skr/f80b9323-e4a6-44b0-b4fa-934333d0aed3.webp", screenshots = listOf("uploads/lan.skr/009c124b-72f9-4f06-a868-f40585ba0a40.webp", "uploads/lan.skr/f7242a12-a1b3-4a4e-bb7d-f8e42bee7856.webp"), likeCount = 1, commentCount = 3, createdAt = "2026-09-09T08:04:24.707Z")

    @Test fun lionanceShowcaseUsesItsIconPreviewAndActualMetricsWithoutInventingAStoreLink() {
        show("en", false, lionance.toDetailTarget())
        compose.onAllNodesWithText("Lionance").assertCountEquals(1)
        compose.onNodeWithContentDescription("Lionance app icon").assertIsDisplayed()
        compose.onNodeWithTag("app_metrics").assertIsDisplayed()
        compose.onNodeWithText("APPRECIATIONS").assertIsDisplayed()
        compose.onNodeWithText("VIEW IN STORE").assertDoesNotExist()
        compose.onNodeWithText("Preview").assertIsDisplayed()
        Thread.sleep(1500) // Optional public media; assertions do not depend on network success.
        shot("lionance-en-light-top")
        compose.onNodeWithTag("detail_list").performScrollToNode(hasText("About this app"))
        compose.onNodeWithText("About this app").assertIsDisplayed()
        compose.onNodeWithTag("detail_list").performScrollToNode(hasText("Information"))
        compose.onNodeWithText("Information").assertIsDisplayed()
        shot("lionance-en-light-information")
        compose.onNodeWithTag("detail_list").performScrollToNode(hasText("DISCUSS"))
        compose.onNodeWithText("DISCUSS").performClick()
        compose.onNodeWithTag("discussion_sheet").assertIsDisplayed()
    }

    @Test fun longAppDescriptionCanExpandAndStoreActionRequiresLeavingConfirmation() {
        val body = (1..20).joinToString("\n") { "Feature $it: detailed community description." }
        val app = StoreAppItem("example.app", "Example app", subtitle = "A useful Seeker tool", description = body, storeUrl = "solanadappstore://details?id=example.app")
        show("en", true, app.toDetailTarget("en"))
        compose.onNodeWithText("VIEW IN STORE").performClick()
        compose.onNodeWithText("Leave LionDApp?").assertIsDisplayed()
        compose.onNodeWithText("Cancel").performClick()
        compose.onNodeWithText("More").performScrollTo().performClick()
        compose.onNodeWithText(body).assertExists()
        compose.onNodeWithText("Less").performScrollTo().performClick()
        compose.onNodeWithText("More").assertExists()
        compose.onNodeWithTag("detail_list").performScrollToNode(hasText("Information"))
        compose.onNodeWithText("Information").assertIsDisplayed()
        shot("app-en-dark-information")
    }

    @Test fun chineseLionanceShowsStructuredSectionsAndAnIndependentDiscussionEntry() {
        show("zh", true, lionance.toDetailTarget())
        compose.onAllNodesWithText("Lionance").assertCountEquals(1)
        compose.onNodeWithText("获得点赞").assertIsDisplayed()
        compose.onNodeWithText("应用预览").assertIsDisplayed()
        Thread.sleep(1500)
        shot("lionance-zh-dark-top")
        compose.onNodeWithTag("detail_list").performScrollToNode(hasText("应用信息"))
        compose.onNodeWithText("应用信息").assertIsDisplayed()
        compose.onNodeWithText("2026年9月9日").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("打开评论").performClick()
        compose.onNodeWithTag("discussion_sheet").assertIsDisplayed()
    }

}
