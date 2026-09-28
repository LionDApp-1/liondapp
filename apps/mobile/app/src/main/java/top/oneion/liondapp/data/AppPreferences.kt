package top.oneion.liondapp.data

import android.content.Context
import androidx.core.content.edit

class AppPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("liondapp_preferences", Context.MODE_PRIVATE)

    val language: String
        get() = preferences.getString(LANGUAGE_KEY, DEFAULT_LANGUAGE)
            ?.takeIf { it in SUPPORTED_LANGUAGES }
            ?: DEFAULT_LANGUAGE

    fun setLanguage(language: String) {
        require(language in SUPPORTED_LANGUAGES)
        preferences.edit { putString(LANGUAGE_KEY, language) }
    }

    private companion object {
        const val LANGUAGE_KEY = "language"
        const val DEFAULT_LANGUAGE = "en"
        val SUPPORTED_LANGUAGES = setOf("en", "zh")
    }
}
