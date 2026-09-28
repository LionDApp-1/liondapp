package top.oneion.liondapp

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.window.Dialog
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import top.oneion.liondapp.ui.LocalAppLanguage
import top.oneion.liondapp.ui.appStringResource
import top.oneion.liondapp.ui.theme.LionDAppTheme

@RunWith(AndroidJUnit4::class)
class LocalizationAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun dialogResourcesFollowSelectedLanguageAcrossChanges() {
        val language = mutableStateOf("en")
        compose.setContent {
            CompositionLocalProvider(LocalAppLanguage provides language.value) {
                LionDAppTheme {
                    Dialog(onDismissRequest = {}) {
                        Column {
                            Text(appStringResource(R.string.works))
                            Text(appStringResource(R.string.comments))
                        }
                    }
                }
            }
        }
        compose.onNodeWithText("Works").assertIsDisplayed()
        compose.onNodeWithText("Comments").assertIsDisplayed()
        compose.runOnIdle { language.value = "zh" }
        compose.onNodeWithText("作品").assertIsDisplayed()
        compose.onNodeWithText("评论").assertIsDisplayed()
        compose.runOnIdle { language.value = "en" }
        compose.onNodeWithText("Works").assertIsDisplayed()
        compose.onNodeWithText("Comments").assertIsDisplayed()
    }
}
