package top.oneion.liondapp

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import java.util.Locale
import top.oneion.liondapp.data.AppPreferences
import top.oneion.liondapp.ui.LocalAppLanguage
import top.oneion.liondapp.ui.LionDApp
import top.oneion.liondapp.ui.theme.LionDAppTheme

class MainActivity : ComponentActivity() {
    private val viewModel: LionViewModel by viewModels {
        viewModelFactory { initializer { LionViewModel(applicationContext) } }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val walletActivityResultSender = ActivityResultSender(this)
        enableEdgeToEdge()
        setContent {
            val preferences = remember { AppPreferences(applicationContext) }
            var language by remember { mutableStateOf(preferences.language) }
            val configuration = remember(language) {
                Configuration(resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) }
            }
            val localizedContext = remember(language) { createConfigurationContext(configuration) }

            CompositionLocalProvider(
                LocalConfiguration provides configuration,
                LocalContext provides localizedContext,
                LocalActivityResultRegistryOwner provides this,
                LocalAppLanguage provides language,
            ) {
                LionDAppTheme {
                    LionDApp(
                        activity = this,
                        walletActivityResultSender = walletActivityResultSender,
                        viewModel = viewModel,
                        language = language,
                        onLanguageChange = { selected ->
                            preferences.setLanguage(selected)
                            language = selected
                        },
                    )
                }
            }
        }
    }
}
