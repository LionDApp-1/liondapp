package top.oneion.liondapp.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.Shapes
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val LionGold = Color(0xFFD8A72F)
val LionGreen = Color(0xFF0CBF79)
val LionInk = Color(0xFF171918)
val LionPaper = Color(0xFFF7F8F6)
val LionCoral = Color(0xFFD65A4A)
private val SignalLime = Color(0xFFB7F5D1)
private val CoolMist = Color(0xFFE5EBE8)

private val LightColors = lightColorScheme(
    primary = LionInk,
    onPrimary = Color.White,
    primaryContainer = SignalLime,
    onPrimaryContainer = Color(0xFF10150B),
    secondary = LionGreen,
    secondaryContainer = Color(0xFFD4F7E7),
    onSecondaryContainer = Color(0xFF062C1E),
    tertiary = LionGold,
    tertiaryContainer = Color(0xFFFFE9AD),
    onTertiaryContainer = Color(0xFF2B2105),
    error = LionCoral,
    background = LionPaper,
    surface = Color.White,
    surfaceVariant = CoolMist,
    outline = Color(0xFF737871),
    outlineVariant = Color(0xFFD7DDDA),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFF2F4F0),
    onPrimary = LionInk,
    primaryContainer = SignalLime,
    onPrimaryContainer = Color(0xFF10150B),
    secondary = Color(0xFF29D995),
    secondaryContainer = Color(0xFF0A3B2A),
    onSecondaryContainer = Color(0xFFB9F4D8),
    tertiary = Color(0xFFE1B84F),
    tertiaryContainer = Color(0xFF372F13),
    onTertiaryContainer = Color(0xFFFFE9AD),
    error = Color(0xFFFFB4A9),
    background = Color(0xFF0C1715),
    onBackground = Color(0xFFF4F7F5),
    onSurface = Color(0xFFF4F7F5),
    onSurfaceVariant = Color(0xFFA5B7AE),
    surface = Color(0xFF192522),
    surfaceVariant = Color(0xFF25312E),
    outline = Color(0xFF8C938B),
    outlineVariant = Color(0xFF2C3935),
)

@Composable
fun LionDAppTheme(darkTheme: Boolean = true, content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
    }
    val base = Typography()
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = base.copy(
            headlineLarge = base.headlineLarge.copy(fontSize = 32.sp, lineHeight = 38.sp, letterSpacing = (-0.7).sp),
            headlineSmall = base.headlineSmall.copy(fontSize = 25.sp, lineHeight = 32.sp, letterSpacing = (-0.4).sp),
            titleMedium = base.titleMedium.copy(fontSize = 18.sp, lineHeight = 24.sp),
            bodyMedium = base.bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
        ),
        shapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp)),
        content = content,
    )
}
