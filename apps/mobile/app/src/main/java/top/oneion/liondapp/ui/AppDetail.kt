package top.oneion.liondapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import top.oneion.liondapp.model.NeedItem

/** A local detail palette: neutral reading surfaces and a single blue action color. */
@Composable
internal fun AppDetailTheme(content: @Composable () -> Unit) {
    val dark = MaterialTheme.colorScheme.background.luminance() < .5f
    val colors = MaterialTheme.colorScheme.copy(
        primary = if (dark) Color(0xFF64A8FF) else Color(0xFF0066CC),
        onPrimary = if (dark) Color(0xFF071B35) else Color.White,
        secondary = if (dark) Color(0xFF64A8FF) else Color(0xFF0066CC),
        primaryContainer = if (dark) Color(0xFF182C47) else Color(0xFFEAF3FF),
        onPrimaryContainer = if (dark) Color(0xFFCDE3FF) else Color(0xFF004B9A),
        secondaryContainer = if (dark) Color(0xFF182C47) else Color(0xFFEAF3FF),
        onSecondaryContainer = if (dark) Color(0xFFCDE3FF) else Color(0xFF004B9A),
        background = if (dark) Color(0xFF101012) else Color.White,
        surface = if (dark) Color(0xFF101012) else Color.White,
        surfaceVariant = if (dark) Color(0xFF232326) else Color(0xFFF2F2F7),
        surfaceContainer = if (dark) Color(0xFF232326) else Color(0xFFF2F2F7),
        onBackground = if (dark) Color(0xFFF5F5F7) else Color(0xFF1D1D1F),
        onSurface = if (dark) Color(0xFFF5F5F7) else Color(0xFF1D1D1F),
        onSurfaceVariant = if (dark) Color(0xFFACACB3) else Color(0xFF6E6E73),
        outlineVariant = if (dark) Color(0xFF353538) else Color(0xFFE5E5EA),
        outline = if (dark) Color(0xFF83838B) else Color(0xFF86868B),
    )
    val typography = MaterialTheme.typography
    MaterialTheme(colorScheme = colors, typography = typography.copy(
        titleLarge = typography.titleLarge.copy(fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-.3).sp),
        bodyLarge = typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 24.sp, letterSpacing = 0.sp),
        labelLarge = typography.labelLarge.copy(letterSpacing = 0.sp),
    ), content = content)
}

@Composable
internal fun DetailSection(title: String, tag: String, trailing: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().testTag(tag)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(Modifier.padding(vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                trailing?.invoke()
            }
            content()
        }
    }
}

@Composable
internal fun DetailMetric(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector? = null, modifier: Modifier = Modifier) {
    Column(modifier.heightIn(min = 98.dp).padding(horizontal = 6.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (icon != null) Icon(icon, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        else Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (icon != null) Text(value, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
internal fun AppDetailHero(target: DetailTarget, openStore: () -> Unit, discuss: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().testTag("app_hero").padding(top = 8.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Box(Modifier.size(94.dp).clip(RoundedCornerShape(22.dp)).background(colors.surfaceVariant), contentAlignment = Alignment.Center) {
                Text(target.title.take(1).uppercase(), fontSize = 38.sp, fontWeight = FontWeight.Bold, color = colors.onSurfaceVariant)
                val model = target.work?.iconKey?.takeIf(String::isNotBlank)?.let(::mediaUrl) ?: target.storeApp?.iconUrl
                AsyncImage(model = model, contentDescription = uiText("${target.title} app icon", "${target.title} 应用图标"), modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(target.title, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 25.sp, lineHeight = 30.sp), fontWeight = FontWeight.Bold)
                target.summary?.takeIf(String::isNotBlank)?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                Text(if (target.kind == "work") uiText("Community showcase", "社区作品") else uiText("Solana dApp Store", "Solana dApp Store"), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (target.url != null) Button(openStore, shape = CircleShape, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp)) {
                Text(uiText("VIEW IN STORE", "前往商店"), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
            }
            else if (target.kind == "work") Button(discuss, shape = CircleShape, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp)) { Text(uiText("DISCUSS", "参与讨论"), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge) }
            Spacer(Modifier.weight(1f))
            if (target.kind == "work" && target.url != null) IconButton(discuss) { Icon(Icons.Outlined.ChatBubbleOutline, uiText("Discuss app", "讨论作品"), tint = colors.primary) }
        }
    }
}

@Composable
internal fun AppDetailMetrics(target: DetailTarget) {
    Row(Modifier.fillMaxWidth().testTag("app_metrics"), verticalAlignment = Alignment.CenterVertically) {
        if (target.work != null) {
            DetailMetric(uiText("APPRECIATIONS", "获得点赞"), target.work.likeCount.toString(), modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = MaterialTheme.colorScheme.outlineVariant)
            DetailMetric(uiText("DISCUSSION", "作品讨论"), target.work.commentCount.toString(), modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = MaterialTheme.colorScheme.outlineVariant)
            DetailMetric(uiText("CATEGORY", "分类"), categoryLabel(target.work.category), Icons.Outlined.Apps, Modifier.weight(1f))
        } else {
            val app = target.storeApp
            DetailMetric(uiText("STORE RATING", "商店评分"), app?.rating?.let { String.format(Locale.US, "%.1f", it) } ?: "—", modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = MaterialTheme.colorScheme.outlineVariant)
            DetailMetric(uiText("STORE REVIEWS", "商店评价"), (app?.reviewCount ?: 0).toString(), modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = MaterialTheme.colorScheme.outlineVariant)
            DetailMetric(uiText("PLATFORM", "平台"), "Seeker", Icons.Outlined.Smartphone, Modifier.weight(1f))
        }
    }
}

@Composable
internal fun AppPreview(media: List<String>, title: String) {
    DetailSection(uiText("Preview", "应用预览"), "app_preview") {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(media) { index, key ->
                AsyncImage(model = mediaUrl(key), contentDescription = uiText("$title screenshot ${index + 1}", "$title 截图 ${index + 1}"), modifier = Modifier.width(210.dp).height(350.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentScale = ContentScale.Fit)
            }
        }
    }
}

@Composable
internal fun ExpandableDescription(value: String) {
    var expanded by rememberSaveable(value) { mutableStateOf(false) }
    var overflows by remember(value) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, style = MaterialTheme.typography.bodyLarge, maxLines = if (expanded) Int.MAX_VALUE else 6, overflow = TextOverflow.Ellipsis, onTextLayout = { if (!expanded) overflows = it.hasVisualOverflow })
        if (overflows || expanded) TextButton({ expanded = !expanded }, contentPadding = PaddingValues(0.dp)) { Text(if (expanded) uiText("Less", "收起") else uiText("More", "展开全文")) }
    }
}

@Composable
internal fun AppFeedbackRow(need: NeedItem, open: () -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("app_feedback_${need.id}").clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = open).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(feedbackLabel(need.feedbackType), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            Text(detailDate(need.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(need.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(need.problem, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(need.authorSkr, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
        }
    }
    Spacer(Modifier.height(12.dp))
}

@Composable
internal fun DetailInfoRow(label: String, value: String, action: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).then(if (action != null) Modifier.clickable(onClick = action) else Modifier).padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(.85f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, Modifier.weight(1.15f), style = MaterialTheme.typography.bodyMedium, color = if (action != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, maxLines = 4, overflow = TextOverflow.Ellipsis)
        if (action != null) Icon(Icons.Outlined.ChevronRight, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun detailDate(value: String): String {
    val zh = LocalAppLanguage.current == "zh"
    return runCatching { DateTimeFormatter.ofPattern(if (zh) "yyyy年M月d日" else "MMM d, yyyy", if (zh) Locale.SIMPLIFIED_CHINESE else Locale.ENGLISH).withZone(ZoneId.systemDefault()).format(Instant.parse(value)) }.getOrDefault(value.take(10))
}

@Composable
internal fun ProfileGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, Modifier.padding(start = 4.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), content = content)
        }
    }
}

@Composable
internal fun ProfileContentLink(title: String, subtitle: String? = null, click: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = click).heightIn(min = 58.dp).padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun FormSectionHeading(title: String) {
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    }
}
