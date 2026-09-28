package top.oneion.liondapp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import top.oneion.liondapp.LionUiState
import top.oneion.liondapp.LionViewModel
import top.oneion.liondapp.model.ChatMessage

@Composable
internal fun RequestBadge(type: String, budget: Int?) {
    val paid = type == "paid_development"
    Surface(shape = RoundedCornerShape(10.dp), color = if (paid) Color(0xFF40351C) else MaterialTheme.colorScheme.surfaceVariant) {
        Text(if (paid) uiText("Paid development · ${budget ?: "—"} SKR", "付费开发 · ${budget ?: "—"} SKR") else uiText("Free request", "免费诉求"),
            Modifier.padding(horizontal = 10.dp, vertical = 7.dp), color = if (paid) Color(0xFFF4D48B) else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun InboxDialog(state: LionUiState, viewModel: LionViewModel, close: () -> Unit) {
    val lifecycle = LocalLifecycleOwner.current
    LaunchedEffect(lifecycle, state.activeChat?.id) {
        lifecycle.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            if (state.activeChat == null) while (true) { viewModel.loadConversations(); delay(15000) }
        }
    }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.systemBarsPadding().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(close) { Text(uiText("Back", "返回")) }
                    Text(uiText("Messages", "私信"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    TextButton({ viewModel.loadConversations() }) { Text(uiText("Refresh", "刷新")) }
                }
                state.chatError?.let { Text(userFacingError(it), color = MaterialTheme.colorScheme.error) }
                if (state.conversations.isEmpty()) Text(uiText("No conversations yet. Open a need and select Discuss this project.", "暂无私信。在需求详情点击“联系需求方”，开始讨论项目。"), Modifier.padding(20.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.conversations, key = { it.id }) { chat ->
                        Card(onClick = { viewModel.openChat(chat) }) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(chat.peerSkr, fontWeight = FontWeight.Bold)
                                Text(chat.title, maxLines = 2)
                                if (chat.unreadCount > 0) Text(uiText("${chat.unreadCount} unread", "${chat.unreadCount} 条未读"), color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    if (state.conversationCursor != null) item { TextButton({ viewModel.loadConversations(true) }) { Text(uiText("Load more", "加载更多对话")) } }
                }
            }
        }
    }
}

@Composable
internal fun ChatDialog(state: LionUiState, viewModel: LionViewModel) {
    val chat = state.activeChat ?: return
    val draft = state.chatDraft
    var report by remember { mutableStateOf<ChatMessage?>(null) }
    var delete by remember { mutableStateOf<ChatMessage?>(null) }
    var block by remember { mutableStateOf(false) }
    var discard by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current
    val listState = rememberLazyListState()
    val leave = { if (draft.isNotBlank() || state.chatSending) discard = true else viewModel.closeChat() }
    LaunchedEffect(chat.id, lifecycle) {
        lifecycle.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) { viewModel.refreshChat(); delay(7000) }
        }
    }
    LaunchedEffect(state.messages.lastOrNull()?.id) {
        if (!listState.canScrollForward || state.messages.lastOrNull()?.senderSkr == state.skrDomain) listState.animateScrollToItem(state.messages.size)
    }
    Dialog(onDismissRequest = leave, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.systemBarsPadding().imePadding()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(leave) { Text(uiText("Back", "返回")) }
                    Text(chat.peerSkr, Modifier.weight(1f).clickable { viewModel.loadProfile(chat.peerSkr) }, fontWeight = FontWeight.Bold)
                    TextButton({ block = true }) { Text(uiText("Block", "屏蔽")) }
                }
                Text(chat.title, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleSmall, maxLines = 2)
                Text(uiText("Discuss scope and delivery here. LionDApp does not collect project payments or guarantee delivery. Never share keys or recovery phrases. Messages are moderated, not end-to-end encrypted.", "在此商议需求与交付。平台不代收项目款，不担保交付；请勿分享私钥或助记词。消息经过内容审核，不是端到端加密。"), Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        if (state.messageCursor != null) TextButton({ viewModel.loadOlderMessages() }) { Text(uiText("Earlier messages", "加载更早消息")) }
                        if (state.messages.isEmpty()) Text(uiText("Introduce yourself and ask about the project.", "介绍一下自己，聊聊项目的具体需求。"))
                    }
                    items(state.messages, key = { it.id }) { message ->
                        val own = message.senderSkr == state.skrDomain
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = if (own) Alignment.End else Alignment.Start) {
                            Surface(shape = RoundedCornerShape(16.dp), color = if (own) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant) {
                                Text(if (message.deletedAt != null) uiText("Message removed", "消息已移除") else message.body, Modifier.padding(12.dp), color = if (own) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(runCatching { java.time.Instant.parse(message.createdAt).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("MM-dd HH:mm")) }.getOrDefault(""), style = MaterialTheme.typography.labelSmall)
                                if (message.deletedAt == null) TextButton({ if (own) delete = message else report = message }, contentPadding = PaddingValues(horizontal = 8.dp)) { Text(if (own) uiText("Remove", "撤回") else uiText("Report", "举报")) }
                            }
                        }
                    }
                }
                state.chatError?.let { Text(userFacingError(it), Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Bottom) {
                    OutlinedTextField(draft, viewModel::editChatDraft, Modifier.weight(1f), enabled = !state.chatSending, placeholder = { Text(uiText("Message", "输入消息")) }, maxLines = 5, supportingText = { Text("${draft.length}/2000") })
                    TextButton({ viewModel.sendChat() }, enabled = draft.isNotBlank() && !state.chatSending) { Text(if (state.chatSending) uiText("Sending…", "发送中…") else uiText("Send", "发送")) }
                }
            }
        }
    }
    if (discard) AlertDialog(onDismissRequest = { discard = false }, title = { Text(uiText("Leave conversation?", "离开对话？")) }, text = { Text(uiText("Unsent text will be discarded. A message already sending may still arrive.", "未发送的文字将丢弃。正在发送的消息仍可能送达。")) }, confirmButton = { TextButton({ discard = false; viewModel.closeChat() }) { Text(uiText("Leave", "离开")) } }, dismissButton = { TextButton({ discard = false }) { Text(uiText("Keep writing", "继续编辑")) } })
    if (block) AlertDialog(onDismissRequest = { block = false }, title = { Text(uiText("Block this user?", "屏蔽此用户？")) }, text = { Text(uiText("Neither of you can send new messages while blocked. Existing messages remain available for reporting.", "屏蔽后双方不能发送新消息，已有消息保留，便于举报。")) }, confirmButton = { TextButton({ viewModel.blockUser(chat.peerSkr) { if (it) { block = false; viewModel.closeChat() } } }) { Text(uiText("Block", "屏蔽")) } }, dismissButton = { TextButton({ block = false }) { Text(uiText("Cancel", "取消")) } })
    delete?.let { message -> AlertDialog(onDismissRequest = { delete = null }, title = { Text(uiText("Remove this message?", "撤回这条消息？")) }, text = { Text(uiText("It will be hidden for both participants. Existing reports may retain evidence for review.", "撤回后双方不再显示正文；已有举报证据可能保留以供审核。")) }, confirmButton = { TextButton({ viewModel.deleteChatMessage(message.id); delete = null }) { Text(uiText("Remove", "撤回")) } }, dismissButton = { TextButton({ delete = null }) { Text(uiText("Cancel", "取消")) } }) }
    report?.let { message ->
        var reason by rememberSaveable(message.id) { mutableStateOf("") }
        var sent by remember { mutableStateOf(false) }
        AlertDialog(onDismissRequest = { report = null }, title = { Text(if (sent) uiText("Report received", "举报已收到") else uiText("Report message", "举报消息")) },
            text = { if (sent) Text(uiText("An administrator can review this reported message.", "管理员可以查看被举报的这条消息并处理。")) else OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(uiText("Reason", "举报原因")) }) },
            confirmButton = { TextButton({ if (sent) report = null else viewModel.reportChatMessage(message.id, reason) { sent = true } }, enabled = sent || reason.isNotBlank()) { Text(if (sent) uiText("Done", "完成") else uiText("Submit", "提交")) } }, dismissButton = { if (!sent) TextButton({ report = null }) { Text(uiText("Cancel", "取消")) } })
    }
}
