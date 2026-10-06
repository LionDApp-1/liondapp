package top.oneion.liondapp

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import top.oneion.liondapp.model.CommentItem
import top.oneion.liondapp.ui.*
import top.oneion.liondapp.ui.theme.LionDAppTheme

@RunWith(AndroidJUnit4::class)
class DiscussionAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val root = CommentItem("root", "maya.skr", "need", "gamefi", body = "I would start with the game loop. What makes it fun before tokens or rewards are added?", likeCount = 24, createdAt = "2026-10-03T10:00:00Z")
    private val response = CommentItem("reply", "lan.skr", "need", "gamefi", parentId = "root", body = "A short puzzle game could be a good first version.", createdAt = "2026-10-04T10:00:00Z")
    private val second = CommentItem("second", "builder.skr", "need", "gamefi", body = "Make a small playable demo first. I can try it on Seeker and share feedback.", responseKind = "suggestion", likeCount = 9, createdAt = "2026-10-04T09:00:00Z")
    private val third = CommentItem("third", "alex.skr", "need", "gamefi", body = "Which part would players use every day? A clear reason to return would help.", likeCount = 3, createdAt = "2026-10-04T08:00:00Z")
    private var selectedReply: CommentItem? = null
    private var sent: String? = null
    private var liked: String? = null
    private var signedInRequested = false
    private var retryRequested = false
    private lateinit var draft: MutableState<String>
    private lateinit var sending: MutableState<Boolean>

    private fun show(comments: List<CommentItem> = listOf(root, response, second, third), signedIn: Boolean = true, loading: Boolean = false, error: String? = null) {
        draft = mutableStateOf("")
        sending = mutableStateOf(false)
        compose.setContent { CompositionLocalProvider(LocalAppLanguage provides "en") { LionDAppTheme {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.statusBarsPadding().padding(24.dp)) {
                    Text("Make a GameFi game", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(18.dp))
                    Text("lan.skr", style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.height(16.dp))
                    Text("A small game for Seeker players.")
                }
                var reply by remember { mutableStateOf<CommentItem?>(null) }
                var sort by remember { mutableStateOf("top") }
                DiscussionSheet(comments, "lan.skr", signedIn, loading, error, sending.value, sort, draft.value, reply,
                    close = {}, changeSort = { sort = it }, changeDraft = { draft.value = it },
                    reply = { selectedReply = it; reply = it }, clearReply = { reply = null },
                    post = { sent = draft.value }, signIn = { signedInRequested = true }, retry = { retryRequested = true },
                    like = { liked = it.id }, profile = {}, openApp = {}, openWork = {})
            }
        } } }
        compose.waitForIdle()
    }

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "discussion-evidence").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    @Test fun threadsCollapseAndReplyKeepsTheParentAndDraft() {
        show()
        compose.onNodeWithText("4 comments").assertIsDisplayed()
        compose.onNodeWithText(response.body).assertDoesNotExist()
        screenshot("01-populated-comments-en")
        compose.onNodeWithText("View 1 replies").performClick()
        compose.onNodeWithText(response.body).assertIsDisplayed()
        compose.onNodeWithText("Author").assertIsDisplayed()
        compose.onNodeWithContentDescription("Like comment by maya.skr").performClick()
        assertEquals(root.id, liked)
        compose.onAllNodesWithText("Reply")[0].performClick()
        assertEquals(root.id, selectedReply?.id)
        compose.onNodeWithTag("comment_draft").performTextInput("I would enjoy trying a short puzzle demo.")
        compose.onNodeWithText("Reply to maya.skr").assertIsDisplayed()
        screenshot("02-reply-keyboard-en")
        compose.onNodeWithContentDescription("Cancel reply").performClick()
        compose.onNodeWithTag("comment_draft").assertTextContains("I would enjoy trying a short puzzle demo.")
        compose.onNodeWithText("Reply to maya.skr").assertDoesNotExist()
        compose.onNodeWithTag("send_comment").performClick()
        assertEquals("I would enjoy trying a short puzzle demo.", sent)
    }

    @Test fun sortingIsInteractiveAndSendingBlocksDuplicateSubmission() {
        show()
        compose.onNodeWithContentDescription("Sort comments").performClick()
        compose.onNodeWithText("Newest first").performClick()
        compose.onNodeWithText("Newest").assertIsDisplayed()
        compose.onNodeWithTag("send_comment").assertIsNotEnabled()
        compose.onNodeWithTag("comment_draft").performTextInput("My draft")
        compose.runOnIdle { sending.value = true }
        compose.onNodeWithTag("send_comment").assertIsNotEnabled()
        compose.onNodeWithTag("comment_draft").assertIsNotEnabled()
        compose.onNodeWithTag("comment_draft").assertTextContains("My draft")
        assertNull(sent)
    }

    @Test fun emptyAnonymousCommentsHaveAnAuthenticationEntry() {
        show(emptyList(), signedIn = false)
        compose.onNodeWithText("No comments yet").assertIsDisplayed()
        screenshot("03-empty-comments-en")
        compose.onNodeWithText("Sign in to comment").performClick()
        assertTrue(signedInRequested)
        compose.onNodeWithTag("send_comment").assertDoesNotExist()
    }

    @Test fun failedLoadingDoesNotPretendTheDiscussionIsEmpty() {
        show(emptyList(), error = "network_unavailable")
        compose.onNodeWithText("No comments yet").assertDoesNotExist()
        compose.onNodeWithText("Unable to connect. Check your network and retry.").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()
        assertTrue(retryRequested)
    }
}
