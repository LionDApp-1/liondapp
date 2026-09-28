package top.oneion.liondapp.ui

import android.content.res.Configuration
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

@Composable
internal fun appStringResource(@StringRes id: Int): String {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val language = LocalAppLanguage.current
    // Dialog windows can restore platform resources instead of the app's selected locale.
    val resources = remember(context, configuration, language) {
        context.createConfigurationContext(Configuration(configuration).apply {
            setLocale(Locale.forLanguageTag(language))
        }).resources
    }
    return resources.getString(id)
}
