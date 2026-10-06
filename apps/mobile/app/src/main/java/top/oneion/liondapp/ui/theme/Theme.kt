package top.oneion.liondapp.ui.theme

import android.app.Activity
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

private val LightColors = lightColorScheme(
    primary = Color(0xFF0066CC),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEAF3FF),
    onPrimaryContainer = Color(0xFF004B9A),
    secondary = Color(0xFF0066CC),
    secondaryContainer = Color(0xFFEAF3FF),
    onSecondaryContainer = Color(0xFF004B9A),
    tertiary = LionGold,
    tertiaryContainer = Color(0xFFFFE9AD),
    onTertiaryContainer = Color(0xFF2B2105),
    error = LionCoral,
    background = Color(0xFFF5F5F7),
    surface = Color.White,
    surfaceVariant = Color(0xFFF2F2F7),
    outline = Color(0xFF737871),
    outlineVariant = Color(0xFFE5E5EA),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF64A8FF),
    onPrimary = Color(0xFF071B35),
    primaryContainer = Color(0xFF182C47),
    onPrimaryContainer = Color(0xFFCDE3FF),
    secondary = Color(0xFF64A8FF),
    secondaryContainer = Color(0xFF182C47),
    onSecondaryContainer = Color(0xFFCDE3FF),
    tertiary = Color(0xFFE1B84F),
    tertiaryContainer = Color(0xFF372F13),
    onTertiaryContainer = Color(0xFFFFE9AD),
    error = Color(0xFFFFB4A9),
    background = Color(0xFF101012),
    onBackground = Color(0xFFF5F5F7),
    onSurface = Color(0xFFF5F5F7),
    onSurfaceVariant = Color(0xFFACACB3),
    surface = Color(0xFF1C1C1E),
    surfaceVariant = Color(0xFF2C2C2E),
    outline = Color(0xFF8C938B),
    outlineVariant = Color(0xFF353538),
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
            bodyLarge = base.bodyLarge.copy(fontSize = 15.sp, lineHeight = 24.sp, letterSpacing = 0.sp),
        ),
        shapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(22.dp)),
        content = content,
    )
}
