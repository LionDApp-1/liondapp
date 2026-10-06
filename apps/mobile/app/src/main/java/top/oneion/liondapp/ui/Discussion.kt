package top.oneion.liondapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import top.oneion.liondapp.model.CommentItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DiscussionSheet(
    comments: List<CommentItem>,
    author: String,
    signedIn: Boolean,
    loading: Boolean,
    error: String?,
    sending: Boolean,
    sort: String,
    draft: String,
    replyTo: CommentItem?,
    close: () -> Unit,
    changeSort: (String) -> Unit,
    changeDraft: (String) -> Unit,
    reply: (CommentItem) -> Unit,
    clearReply: () -> Unit,
    post: () -> Unit,
    signIn: () -> Unit,
    retry: () -> Unit,
    like: (CommentItem) -> Unit,
    profile: (String) -> Unit,
    openApp: (String) -> Unit,
    openWork: (String) -> Unit,
) {
    val dark = MaterialTheme.colorScheme.background.luminance() < .5f
    val colors = MaterialTheme.colorScheme.copy(
        surface = if (dark) Color(0xFF19191F) else Color.White,
        surfaceVariant = if (dark) Color(0xFF25252D) else Color(0xFFF2F2F5),
        onSurface = if (dark) Color(0xFFEAEAF0) else Color(0xFF212127),
        onSurfaceVariant = if (dark) Color(0xFF96969F) else Color(0xFF73737D),
        outlineVariant = if (dark) Color(0xFF35353D) else Color(0xFFE5E5EA),
    )
    MaterialTheme(colorScheme = colors) {
        ModalBottomSheet(
            onDismissRequest = close,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = colors.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            dragHandle = null,
        ) {
            Column(Modifier.fillMaxWidth().fillMaxHeight(.82f).testTag("discussion_sheet")) {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(uiText("${comments.size} comments", "共 ${comments.size} 条评论"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp, letterSpacing = 0.sp), fontWeight = FontWeight.SemiBold)
                    var sortMenu by remember { mutableStateOf(false) }
                    Box {
                        TextButton({ sortMenu = true }) {
                            Text(if (sort == "latest") uiText("Newest", "最新") else uiText("Top", "最热"), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                            Spacer(Modifier.width(4.dp))
                            Icon(Icons.AutoMirrored.Outlined.Sort, uiText("Sort comments", "评论排序"), Modifier.size(18.dp), tint = colors.onSurfaceVariant)
                        }
                        DropdownMenu(sortMenu, { sortMenu = false }) {
                            listOf("top" to uiText("Top comments", "最热评论"), "latest" to uiText("Newest first", "最新评论")).forEach { (value, label) ->
                                DropdownMenuItem(text = { Text(label) }, onClick = { sortMenu = false; if (value != sort) changeSort(value) }, trailingIcon = { if (value == sort) Icon(Icons.Outlined.Check, null, Modifier.size(18.dp)) })
                            }
                        }
                    }
                    IconButton(close) { Icon(Icons.Outlined.Close, uiText("Close comments", "关闭评论"), tint = colors.onSurfaceVariant) }
                }
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp))
                val roots = comments.filter { it.parentId == null || comments.none { parent -> parent.id == it.parentId } }
                val replies = comments.groupBy { it.parentId }
                LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("discussion_list"), contentPadding = PaddingValues(start = 18.dp, end = 14.dp, top = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    if (error != null) item {
                        Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(userFacingError(error), style = MaterialTheme.typography.bodyMedium, color = colors.error)
                            TextButton(retry) { Icon(Icons.Outlined.Refresh, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(uiText("Retry", "重试")) }
                        }
                    }
                    if (comments.isEmpty() && !loading && error == null) item {
                        Column(Modifier.fillMaxWidth().padding(vertical = 70.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(36.dp), tint = colors.onSurfaceVariant.copy(alpha = .6f))
                            Text(uiText("No comments yet", "还没有评论"), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                        }
                    }
                    items(roots, key = { it.id }) { root ->
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            DiscussionComment(root, author, false, sending, { like(root) }, { reply(root) }, profile, openApp, openWork)
                            val children = replies[root.id].orEmpty()
                            if (children.isNotEmpty()) {
                                var expanded by rememberSaveable(root.id) { mutableStateOf(false) }
                                if (expanded) children.sortedBy { it.createdAt }.forEach { child ->
                                    DiscussionComment(child, author, true, sending, { like(child) }, { reply(root) }, profile, openApp, openWork)
                                }
                                TextButton({ expanded = !expanded }, Modifier.padding(start = 52.dp).heightIn(min = 40.dp), contentPadding = PaddingValues(0.dp)) {
                                    Box(Modifier.width(20.dp).height(1.dp).background(colors.outlineVariant))
                                    Spacer(Modifier.width(10.dp))
                                    Text(if (expanded) uiText("Hide replies", "收起回复") else uiText("View ${children.size} replies", "展开 ${children.size} 条回复"), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                                    Spacer(Modifier.width(4.dp))
                                    Icon(if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, Modifier.size(17.dp), tint = colors.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                HorizontalDivider(color = colors.outlineVariant.copy(alpha = .5f))
                DiscussionComposer(signedIn, sending, draft, replyTo, changeDraft, clearReply, post, signIn)
            }
        }
    }
}

@Composable
private fun DiscussionComment(
    comment: CommentItem,
    postAuthor: String,
    nested: Boolean,
    busy: Boolean,
    like: () -> Unit,
    reply: () -> Unit,
    profile: (String) -> Unit,
    openApp: (String) -> Unit,
    openWork: (String) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().padding(start = if (nested) 52.dp else 0.dp), verticalAlignment = Alignment.Top) {
        Surface(Modifier.size(if (nested) 28.dp else 38.dp).clickable { profile(comment.authorSkr) }, shape = CircleShape, color = colors.surfaceVariant) {
            Box(contentAlignment = Alignment.Center) {
                Text(comment.authorSkr.take(1).uppercase(), style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(if (nested) 10.dp else 14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.authorSkr, Modifier.weight(1f, fill = false).clickable { profile(comment.authorSkr) }, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (comment.authorSkr == postAuthor) {
                    Spacer(Modifier.width(6.dp))
                    Text(uiText("Author", "作者"), Modifier.background(colors.surfaceVariant, RoundedCornerShape(3.dp)).padding(horizontal = 4.dp, vertical = 1.dp), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
                }
            }
            if (comment.responseKind != "discussion") Text(responseLabel(comment.responseKind), style = MaterialTheme.typography.labelSmall, color = colors.secondary)
            Text(comment.body, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 23.sp, letterSpacing = 0.sp))
            comment.outcomeStatus?.let { Text(statusLabel(it), style = MaterialTheme.typography.labelMedium, color = colors.secondary) }
            comment.linkedStorePackage?.let { packageName ->
                TextButton({ openApp(packageName) }, contentPadding = PaddingValues(0.dp)) { Icon(Icons.Outlined.Apps, null, Modifier.size(16.dp)); Spacer(Modifier.width(5.dp)); Text(comment.linkedAppName ?: packageName, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelMedium) }
            }
            if (comment.linkedWorkId != null && comment.linkedWorkName != null) TextButton({ openWork(comment.linkedWorkId) }, contentPadding = PaddingValues(0.dp)) { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(16.dp)); Spacer(Modifier.width(5.dp)); Text(comment.linkedWorkName, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(commentDate(comment.createdAt), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant.copy(alpha = .7f))
                TextButton(reply, enabled = !busy, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp), modifier = Modifier.heightIn(min = 40.dp)) { Text(uiText("Reply", "回复"), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant) }
                TextButton(like, enabled = !busy, contentPadding = PaddingValues(start = 8.dp, end = 0.dp, top = 0.dp, bottom = 0.dp), modifier = Modifier.heightIn(min = 40.dp)) {
                    Icon(Icons.Outlined.FavoriteBorder, uiText("Like comment by ${comment.authorSkr}", "喜欢 ${comment.authorSkr} 的评论"), Modifier.size(20.dp), tint = colors.onSurfaceVariant)
                    if (comment.likeCount > 0) { Spacer(Modifier.width(4.dp)); Text(comment.likeCount.toString(), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant) }
                }
            }
        }
    }
}

private fun commentDate(value: String): String = runCatching {
    DateTimeFormatter.ofPattern("MM-dd").withZone(ZoneId.systemDefault()).format(Instant.parse(value))
}.getOrDefault("")

@Composable
private fun DiscussionComposer(signedIn: Boolean, sending: Boolean, draft: String, replyTo: CommentItem?, change: (String) -> Unit, clearReply: () -> Unit, post: () -> Unit, signIn: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(replyTo?.id, signedIn) { if (replyTo != null && signedIn) { focus.requestFocus(); keyboard?.show() } }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        replyTo?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(uiText("Reply to ${it.authorSkr}", "回复 ${it.authorSkr}"), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                    Text(it.body, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant.copy(alpha = .7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton(clearReply) { Icon(Icons.Outlined.Close, uiText("Cancel reply", "取消回复"), Modifier.size(18.dp), tint = colors.onSurfaceVariant) }
            }
        }
        if (!signedIn) {
            Surface(onClick = signIn, Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), color = colors.surfaceVariant) {
                Row(Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(uiText("Sign in to comment", "登录后留下你的想法"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp), tint = colors.onSurfaceVariant)
                }
            }
        } else {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextField(draft, change, Modifier.weight(1f).focusRequester(focus).testTag("comment_draft"), enabled = !sending,
                    placeholder = { Text(uiText("Leave your thoughts", "留下你的想法吧"), style = MaterialTheme.typography.bodyMedium) }, maxLines = 4,
                    textStyle = MaterialTheme.typography.bodyMedium, shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(focusedContainerColor = colors.surfaceVariant, unfocusedContainerColor = colors.surfaceVariant, disabledContainerColor = colors.surfaceVariant, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, disabledIndicatorColor = Color.Transparent),
                )
                FilledIconButton(post, enabled = draft.isNotBlank() && !sending, modifier = Modifier.size(48.dp).testTag("send_comment")) {
                    if (sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Icon(Icons.AutoMirrored.Outlined.Send, uiText("Post comment", "发布评论"), Modifier.size(21.dp))
                }
            }
        }
    }
}

@Composable
internal fun DiscussionEntry(count: Int, open: () -> Unit) {
    Surface(Modifier.fillMaxWidth().navigationBarsPadding(), color = MaterialTheme.colorScheme.background) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(onClick = open, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Text(uiText("Leave your thoughts", "留下你的想法吧"), Modifier.padding(horizontal = 18.dp, vertical = 13.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(open) { Icon(Icons.Outlined.ChatBubbleOutline, uiText("Open comments", "打开评论"), Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text(count.toString()) }
            }
        }
    }
}
