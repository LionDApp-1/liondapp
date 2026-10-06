package top.oneion.liondapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import top.oneion.liondapp.model.NeedItem

@Composable
internal fun PostHero(need: NeedItem, profile: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().testTag("post_topic").padding(top = 8.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
            Surface(Modifier.size(76.dp), shape = RoundedCornerShape(18.dp), color = colors.surfaceVariant) {
                Box(contentAlignment = Alignment.Center) { Icon(if (need.category == "游戏") Icons.Outlined.SportsEsports else if (need.kind == "feedback") Icons.Outlined.RateReview else Icons.Outlined.Lightbulb, null, Modifier.size(34.dp), tint = colors.primary) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (need.kind == "feedback") feedbackLabel(need.feedbackType) else categoryLabel(need.category), style = MaterialTheme.typography.labelMedium, color = colors.primary, fontWeight = FontWeight.SemiBold)
                Text(need.title, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp, lineHeight = 33.sp), fontWeight = FontWeight.Bold)
                Text(if (need.format == "wild") uiText("A community idea", "社区灵感") else uiText("Community post", "社区帖子"), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            }
        }
        Row(Modifier.fillMaxWidth().clickable(onClick = profile).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(Modifier.size(30.dp), shape = CircleShape, color = colors.surfaceVariant) { Box(contentAlignment = Alignment.Center) { Text(need.authorSkr.take(1).uppercase(), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant) } }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(need.authorSkr, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(detailDate(need.createdAt), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
            Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = colors.onSurfaceVariant)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            DetailMetric(uiText("ALSO NEED THIS", "共同需求"), need.needCount.toString(), modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = colors.outlineVariant)
            DetailMetric(uiText("FOLLOWING", "关注进展"), need.followerCount.toString(), modifier = Modifier.weight(1f))
            VerticalDivider(Modifier.height(38.dp), color = colors.outlineVariant)
            DetailMetric(if (need.campaignId == null) uiText("READY TO TEST", "测试意愿") else uiText("COMMENTS", "评论"), (if (need.campaignId == null) need.testerCount else need.commentCount).toString(), modifier = Modifier.weight(1f))
        }
    }
}

@Composable
internal fun PostSection(title: String, tag: String, content: @Composable ColumnScope.() -> Unit) {
    // Section headings and hairlines carry hierarchy; icons are reserved for actions/status.
    DetailSection(title, tag, content = content)
}

@Composable
internal fun PostBody(value: String) {
    Text(value, style = MaterialTheme.typography.bodyLarge)
}

@Composable
internal fun PostProgress(need: NeedItem) {
    val colors = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().background(colors.surfaceVariant, RoundedCornerShape(14.dp)).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(if (need.status == "resolved") Icons.Outlined.CheckCircle else Icons.Outlined.Timelapse, null, Modifier.size(24.dp), tint = colors.primary)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(statusLabel(need.status), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(uiText("Progress is reported by the author.", "进展由作者自行报告。"), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        }
    }
}
