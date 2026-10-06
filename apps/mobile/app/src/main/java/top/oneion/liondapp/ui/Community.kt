package top.oneion.liondapp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import top.oneion.liondapp.LionUiState
import top.oneion.liondapp.LionViewModel
import top.oneion.liondapp.model.*

internal inline fun <reified T> jsonStateSaver(): Saver<T, String> = Saver(
    save = { Json.encodeToString(it) }, restore = { Json.decodeFromString<T>(it) },
)

@Composable
internal fun statusLabel(status: String): String = when (status) {
    "needs_info" -> uiText("More detail needed", "待补充信息")
    "suggested" -> uiText("Suggestion received", "已有建议")
    "testing" -> uiText("Seeking testers", "招募测试")
    "resolved" -> uiText("Author confirmed solved", "作者确认已解决")
    "unresolved" -> uiText("Still unresolved", "仍未解决")
    else -> uiText("Open", "待回应")
}

@Composable
internal fun feedbackLabel(type: String?): String = when (type) {
    "issue" -> uiText("Issue", "遇到问题")
    "praise" -> uiText("Praise", "值得表扬")
    else -> uiText("Suggestion", "改进建议")
}

@Composable
internal fun NeedMeta(need: NeedItem, showApp: Boolean = true) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if(need.campaignId!=null) {
            Text(need.appName?:need.storePackage.orEmpty(),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.secondary)
            Text(if(need.campaignRewardUnits=="0")uiText("Free testing invitation", "免费测试邀请") else "${skrUnits(need.campaignRewardUnits?:"0")} SKR · "+uiText("per approved tester", "每位通过验收的测试者"),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.secondary)
            if(need.campaignFundingState=="simulated")Text(uiText("Simulation · no real SKR", "模拟活动 · 无真实 SKR"),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.tertiary)
        }
        if (showApp && need.kind == "feedback") Text("${need.appName ?: need.storePackage.orEmpty()} · ${feedbackLabel(need.feedbackType)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
        Text(statusLabel(need.status), style = MaterialTheme.typography.labelMedium, color = if (need.status == "resolved") MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
        if (need.requestType == "paid_development") Text(uiText("Intended budget: ${need.budgetSkr} SKR", "预算意向：${need.budgetSkr} SKR"), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
internal fun CommunityFilters(kind: String?, status: String?, paid: Boolean, change: (String?, String?, Boolean) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item { FilterChip(kind == null, { change(null, status, paid) }, { Text(uiText("All", "全部")) }) }
        item { FilterChip(kind == "need", { change("need", status, paid) }, { Text(uiText("Questions", "问题")) }) }
        item { FilterChip(kind == "feedback", { change("feedback", status, paid) }, { Text(uiText("dApp feedback", "dApp 评价")) }) }
        item { FilterChip(status == "testing", { change(kind, if (status == "testing") null else "testing", paid) }, { Text(uiText("Testing", "招募测试")) }) }
        item { FilterChip(status == "resolved", { change(kind, if (status == "resolved") null else "resolved", paid) }, { Text(uiText("Solved", "已解决")) }) }
        item { FilterChip(paid, { change(kind, status, !paid) }, { Text(uiText("With budget", "有预算")) }) }
    }
}

@Composable
internal fun DiscoverScreen(state: LionUiState, modifier: Modifier, viewModel: LionViewModel, signIn: () -> Unit, open: (DetailTarget) -> Unit) {
    val language = LocalAppLanguage.current
    var catalog by rememberSaveable { mutableStateOf(false) }
    val sections = listOf(
        uiText("Seeking testers", "正在招募测试") to state.discovery.testing,
        uiText("Recently solved", "最近有了结果") to state.discovery.resolved,
        uiText("dApp experiences", "dApp 使用体验") to state.discovery.feedback,
        uiText("Community questions", "大家共同关心") to state.discovery.popular,
    )
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp,12.dp,20.dp,32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            DiscoveryBanner(
                uiText("LIONDAPP COMMUNITY", "LIONDAPP 社区"),
                uiText("Find your next\nuseful dApp.", "找到下一个\n真正有用的 dApp。"),
                uiText("Real experiences from Seeker users.", "来自 Seeker 用户的真实体验。"),
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DiscoverMetric(Icons.Outlined.Apps, "${state.config?.catalog?.active ?: 0}", uiText("Store apps", "商店应用"), Modifier.weight(1f))
                DiscoverMetric(Icons.Outlined.Forum, state.discovery.feedback.size.toString(), uiText("Experiences", "体验反馈"), Modifier.weight(1f))
            }
        }
        item {
            OutlinedButton({ catalog = true }, Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Icon(Icons.Outlined.Search, null); Spacer(Modifier.width(8.dp))
                Text(uiText("Browse official Store apps", "浏览官方商店应用"), Modifier.weight(1f))
                Icon(Icons.Outlined.ChevronRight, null)
            }
        }
        sections.forEach { (title, needs) ->
            if (needs.isNotEmpty()) {
                item { SectionTitle(title, Modifier.padding(top = 8.dp)) }
                items(needs.take(4), key = { "$title-${it.id}" }) { need ->
                    NeedCard(need, { if (state.skrDomain == null) signIn() else viewModel.toggleNeed(need.id) }, { viewModel.loadProfile(need.authorSkr) }) { open(need.toDetailTarget()) }
                }
            }
        }
        if (sections.all { it.second.isEmpty() }) item { Text(uiText("No community activity yet", "暂无社区动态"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.promoted.isNotEmpty()) {
            item { SectionTitle(uiText("Recommendations", "推荐作品")) }
            items(state.promoted, key = { "promoted-${it.id}" }) { work -> WorkCard(work, { if (state.skrDomain == null) signIn() else viewModel.toggleWork(work.id) }, { viewModel.loadProfile(work.authorSkr) }) { open(work.toDetailTarget()) } }
        }
        if (state.works.isNotEmpty()) {
            item { SectionTitle(uiText("Community apps", "社区作品"), Modifier.padding(top = 8.dp)) }
            items(state.works, key = { "work-${it.id}" }) { work -> WorkCard(work, { if (state.skrDomain == null) signIn() else viewModel.toggleWork(work.id) }, { viewModel.loadProfile(work.authorSkr) }) { open(work.toDetailTarget()) } }
        }
    }
    if (catalog) CatalogPicker(state, viewModel, { catalog = false }) { catalog = false; open(it.toDetailTarget(language)) }
}

@Composable
internal fun CatalogPicker(state: LionUiState, viewModel: LionViewModel, close: () -> Unit, select: (StoreAppItem) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query) { if (query.isNotBlank()) delay(300); viewModel.searchCatalog(query.trim()) }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.statusBarsPadding().navigationBarsPadding().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(close) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, uiText("Back", "返回")) }
                    Text(uiText("Solana dApp Store", "Solana dApp Store"), style = MaterialTheme.typography.titleLarge)
                }
                OutlinedTextField(query, { query = it.take(100) }, Modifier.fillMaxWidth(), singleLine = true, leadingIcon = { Icon(Icons.Outlined.Search, null) }, label = { Text(uiText("Search apps", "搜索应用")) })
                when {
                    state.catalogLoading -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    state.catalogError != null -> Column { Text(userFacingError(state.catalogError), color = MaterialTheme.colorScheme.error); TextButton({ viewModel.searchCatalog(query) }) { Text(uiText("Retry", "重试")) } }
                    state.catalogResults.isEmpty() -> Text(uiText("No matching apps", "未找到匹配应用"), Modifier.padding(vertical = 24.dp))
                    else -> LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) { items(state.catalogResults, key = { it.androidPackage }) { StoreAppCard(it) { select(it) } } }
                }
            }
        }
    }
}

@Composable
internal fun CommunityComposer(state: LionUiState, viewModel: LionViewModel, editing: NeedItem?, initialApp: StoreAppItem?, feedback: Boolean, close: () -> Unit, signIn: () -> Unit, submit: (CreateNeedRequest) -> Unit) {
    var kind by rememberSaveable { mutableStateOf(editing?.kind ?: if (feedback) "feedback" else "need") }
    var feedbackType by rememberSaveable { mutableStateOf(editing?.feedbackType ?: "suggestion") }
    var title by rememberSaveable { mutableStateOf(editing?.title.orEmpty()) }
    var body by rememberSaveable { mutableStateOf(editing?.problem.orEmpty()) }
    var solution by rememberSaveable { mutableStateOf(editing?.solutionIdea.orEmpty()) }
    var audience by rememberSaveable { mutableStateOf(editing?.audience.orEmpty()) }
    var category by rememberSaveable { mutableStateOf(editing?.category ?: "其他") }
    var budget by rememberSaveable { mutableStateOf(editing?.budgetSkr?.toString().orEmpty()) }
    var withBudget by rememberSaveable { mutableStateOf(editing?.requestType == "paid_development") }
    var format by rememberSaveable { mutableStateOf(editing?.format ?: "structured") }
    var packageName by rememberSaveable { mutableStateOf(initialApp?.androidPackage ?: editing?.storePackage) }
    var appName by rememberSaveable { mutableStateOf(initialApp?.displayName ?: editing?.appName) }
    var picker by rememberSaveable { mutableStateOf(false) }
    var advanced by rememberSaveable { mutableStateOf(false) }
    val budgetValid = !withBudget || budget.toIntOrNull()?.let { it in 1..1_000_000_000 } == true
    val hasDraft = body.isNotBlank() || title.isNotBlank() || packageName != null
    ComposerShell(if (editing != null) uiText("Edit post", "编辑内容") else if (kind == "feedback") uiText("Share dApp feedback", "评价 dApp") else uiText("Ask the community", "提出问题"), hasDraft, close, !state.publishingNeed) {
        if (editing == null && initialApp == null) ChoiceMenu(kind, listOf("need" to uiText("Question", "提出问题"), "feedback" to uiText("dApp feedback", "评价 dApp"))) { kind = it; format = "structured" }
        if (kind == "feedback") {
            OutlinedButton({ picker = true }, Modifier.fillMaxWidth(), enabled = !state.publishingNeed) { Icon(Icons.Outlined.Apps, null); Spacer(Modifier.width(8.dp)); Text(appName ?: uiText("Choose a Store dApp", "选择已上架的 dApp"), Modifier.weight(1f)) }
            FeedbackTypeChips(feedbackType) { feedbackType = it }
        }
        FormSectionHeading(if (kind == "feedback") uiText("Feedback details", "体验详情") else uiText("Your question", "你的问题"))
        FormField(uiText("Short title (optional)", "一句话概括（可选）"), title) { title = it.take(120) }
        FormField(if (kind == "feedback") uiText("Your experience", "你的体验与见解") else uiText("What are you trying to do? What is getting in the way?", "你想做什么？遇到了什么困难？"), body, 5) { body = it.take(5000) }
        TextButton({ advanced = !advanced }) { Text(uiText("More details", "补充信息")); Icon(if (advanced) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null) }
        if (advanced) {
            FormSectionHeading(uiText("Supporting details", "补充信息"))
            FormField(uiText("Suggested approach (optional)", "解决建议（可选）"), solution, 3) { solution = it.take(5000) }
            FormField(uiText("Who else is affected? (optional)", "还有谁会遇到？（可选）"), audience, 2) { audience = it.take(500) }
            ChoiceMenu(category, state.config?.categories.orEmpty().filter { it != "天马行空" }.map { it to categoryLabel(it) }) { category = it }
            if (kind == "need") {
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(format == "wild", { format = if (it) "wild" else "structured" }); Text(uiText("Wild idea", "天马行空")) }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(withBudget, { withBudget = it }); Text(uiText("I have a development budget", "我有开发预算")) }
                if (withBudget) {
                    FormField(uiText("Intended budget · whole SKR", "预算意向 · 整数 SKR"), budget) { budget = it.filter(Char::isDigit).take(10) }
                    Text(uiText("Self-reported budget. No payment or delivery guarantee.", "预算由你自行填写，不代表付款或交付担保。"), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        state.error?.let { Text(userFacingError(it), color = MaterialTheme.colorScheme.error) }
        Button({
            if (state.skrDomain == null) signIn()
            else submit(CreateNeedRequest(title.trim().ifBlank { body.trim().lineSequence().first().take(100) },body.trim(),solution.trim(),audience.trim(),category,editing?.tags.orEmpty(),
                format = if (kind == "feedback") "structured" else format,
                requestType = if (withBudget && kind == "need") "paid_development" else "free",
                budgetSkr = if (withBudget && kind == "need") budget.toIntOrNull() else null,
                kind = kind,feedbackType = if (kind == "feedback") feedbackType else null,
                storePackage = if (kind == "feedback") packageName else null,revision = editing?.revision))
        }, Modifier.fillMaxWidth(), enabled = body.isNotBlank() && (kind != "feedback" || packageName != null) && budgetValid && !state.publishingNeed) {
            if (state.publishingNeed) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Text(if (state.skrDomain == null) uiText("Sign in to publish", "登录并发布") else if (editing != null) uiText("Save", "保存") else uiText("Publish", "发布"))
        }
    }
    if (picker) CatalogPicker(state,viewModel,{ picker = false }) { packageName = it.androidPackage; appName = it.displayName; picker = false }
}

@Composable
private fun FeedbackTypeChips(value: String, change: (String) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item { FilterChip(value == "issue", { change("issue") }, label = { Text(feedbackLabel("issue")) }, leadingIcon = { Icon(Icons.Outlined.ReportProblem, null, Modifier.size(16.dp)) }) }
        item { FilterChip(value == "suggestion", { change("suggestion") }, label = { Text(feedbackLabel("suggestion")) }, leadingIcon = { Icon(Icons.Outlined.Lightbulb, null, Modifier.size(16.dp)) }) }
        item { FilterChip(value == "praise", { change("praise") }, label = { Text(feedbackLabel("praise")) }, leadingIcon = { Icon(Icons.Outlined.FavoriteBorder, null, Modifier.size(16.dp)) }) }
    }
}

@Composable
internal fun ChoiceMenu(value: String, options: List<Pair<String,String>>, change: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton({ expanded = true }, Modifier.fillMaxWidth()) { Text(options.firstOrNull { it.first == value }?.second ?: value, Modifier.weight(1f)); Icon(Icons.Outlined.ExpandMore, null) }
        DropdownMenu(expanded, { expanded = false }) { options.forEach { (id,label) -> DropdownMenuItem({ Text(label) }, { change(id); expanded = false }) } }
    }
}

@Composable
internal fun NeedActions(need: NeedItem, state: LionUiState, viewModel: LionViewModel, signIn: () -> Unit, respond: () -> Unit, progress: () -> Unit) {
    val canUpdate = need.authorSkr == state.skrDomain && need.campaignId == null
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton({ if (state.skrDomain == null) signIn() else viewModel.followNeed(need,!need.following) }, Modifier.weight(1f), enabled = !state.communityBusy) {
            Icon(if (need.following) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(if (need.following) uiText("Following", "已关注") else uiText("Follow", "关注"))
        }
        Button({ if (state.skrDomain == null) signIn() else if(canUpdate)progress() else respond() }, Modifier.weight(1f), enabled = !state.communityBusy) {
            Text(if(canUpdate)uiText("Update progress", "更新进展或结果") else uiText("Respond", "回应"))
        }
    }
    if(need.campaignId == null && need.authorSkr != state.skrDomain) Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .4f)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(uiText("I am willing to test", "我愿意参与测试"), style = MaterialTheme.typography.bodyMedium)
                Text(uiText("An interest signal, not a campaign reservation.", "表达测试意愿，不等于活动报名。"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(need.wantsTest, { if (state.skrDomain == null) signIn() else viewModel.followNeed(need,true,it) }, enabled = !state.communityBusy)
        }
    }
}

@Composable
internal fun responseLabel(kind: String): String = when (kind) {
    "clarification" -> uiText("Ask for detail", "询问细节")
    "suggestion" -> uiText("Suggest a solution", "提供建议")
    "progress" -> uiText("Share progress", "分享进展")
    "testing" -> uiText("Invite testing", "邀请测试")
    "outcome" -> uiText("Author's result", "作者反馈结果")
    else -> uiText("Discussion", "讨论")
}

@Composable
internal fun ResponseComposer(state: LionUiState, viewModel: LionViewModel, need: NeedItem?, outcome: Boolean, close: () -> Unit) {
    if (need == null) return
    var body by rememberSaveable(need.id) { mutableStateOf("") }
    var kind by rememberSaveable(need.id) { mutableStateOf("suggestion") }
    var status by rememberSaveable(need.id) { mutableStateOf(need.status) }
    var packageName by rememberSaveable { mutableStateOf<String?>(null) }
    var appName by rememberSaveable { mutableStateOf<String?>(null) }
    var workId by rememberSaveable { mutableStateOf("") }
    var picker by rememberSaveable { mutableStateOf(false) }
    ComposerShell(if (outcome) uiText("Update progress", "更新进展与结果") else uiText("Respond", "回应"), body.isNotBlank(), close, !state.communityBusy) {
        if (outcome) ChoiceMenu(status, listOf("open","needs_info","suggested","testing","resolved","unresolved").map { it to statusLabel(it) }) { status = it }
        else ChoiceMenu(kind, listOf("discussion","clarification","suggestion","progress","testing").map { it to responseLabel(it) }) { kind = it }
        FormField(uiText("Your response", "具体回应"),body,5) { body = it.take(2000) }
        OutlinedButton({ picker = true }, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Apps,null); Spacer(Modifier.width(8.dp)); Text(appName ?: uiText("Link a Store app (optional)", "关联商店应用（可选）"),Modifier.weight(1f)) }
        if (packageName != null) TextButton({ packageName = null; appName = null }) { Text(uiText("Remove app link", "取消应用关联")) }
        val works = state.myWorks.filter { it.moderationStatus == "published" && it.publicVisibility != "hidden_policy" }
        if (works.isNotEmpty()) ChoiceMenu(workId, listOf("" to uiText("Link my work (optional)", "关联我的作品（可选）")) + works.map { it.id to it.name }) { workId = it }
        if (outcome && status == "resolved") Text(uiText("This records your own experience.", "这个状态记录你自己的使用结果。"),style = MaterialTheme.typography.bodySmall)
        state.error?.let { Text(userFacingError(it), color = MaterialTheme.colorScheme.error) }
        Button({
            if (outcome) viewModel.updateProgress(need,status,body.trim(),packageName,workId.ifBlank { null }) { if (it) close() }
            else viewModel.comment("need",need.id,body.trim(),responseKind = kind,linkedStorePackage = packageName,linkedWorkId = workId.ifBlank { null }) { if (it) close() }
        },Modifier.fillMaxWidth(),enabled = body.isNotBlank() && !state.communityBusy) { Text(uiText("Publish", "发布")) }
    }
    if (picker) CatalogPicker(state,viewModel,{ picker = false }) { packageName = it.androidPackage; appName = it.displayName; picker = false }
}

@Composable
internal fun CommentLinks(comment: CommentItem, viewModel: LionViewModel, open: (DetailTarget) -> Unit) {
    val language = LocalAppLanguage.current
    if (comment.responseKind != "discussion") Text(responseLabel(comment.responseKind), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
    comment.outcomeStatus?.let { Text(statusLabel(it),style = MaterialTheme.typography.labelMedium) }
    comment.linkedStorePackage?.let { packageName -> TextButton({ viewModel.openApp(packageName) { open(it.toDetailTarget(language)) } }) { Icon(Icons.Outlined.Apps,null,Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(comment.linkedAppName ?: packageName) } }
    if (comment.linkedWorkName != null && comment.linkedWorkId != null) TextButton({ viewModel.openWork(comment.linkedWorkId) { open(it.toDetailTarget()) } }) { Text(comment.linkedWorkName) }
}

@Composable
internal fun CommunityNotifications(state: LionUiState, viewModel: LionViewModel, close: () -> Unit, openCampaign: (String) -> Unit = {}, open: (DetailTarget) -> Unit) {
    LaunchedEffect(state.skrDomain) { viewModel.loadNotifications() }
    Dialog(onDismissRequest = close,properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.statusBarsPadding().navigationBarsPadding().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { IconButton(close) { Icon(Icons.AutoMirrored.Outlined.ArrowBack,uiText("Back", "返回")) }; Text(uiText("Updates", "消息与进展"),style = MaterialTheme.typography.titleLarge) }
                state.error?.let {
                    Text(userFacingError(it), Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.error)
                    TextButton({ viewModel.loadNotifications() }) { Text(uiText("Retry", "重试")) }
                }
                if (state.notifications.isEmpty()) Text(uiText("No updates yet", "暂无消息"),Modifier.padding(20.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.notifications,key = { it.id }) { notification ->
                        val payload = notification.payload
                        val label = when (notification.type) {
                            "need_progress" -> uiText("Progress updated", "进展有了更新")
                            "need_edited" -> uiText("Post updated", "内容已更新")
                            "work_review" -> uiText("Work review", "作品审核")
                            "app_feedback" -> uiText("New app feedback", "关注的应用有新评价")
                            "promotion_started" -> uiText("Recommendation started", "推荐已开始")
                            "testing_update" -> uiText("Testing update", "测试活动进展")
                            else -> uiText("New response", "收到新回应")
                        }
                        Column(Modifier.fillMaxWidth().clickable {
                            val targetId = payload.targetId ?: payload.workId
                            if (targetId != null) {
                                if (payload.targetType == "campaign") { openCampaign(targetId); viewModel.readNotification(notification.id) }
                                else if (payload.targetType == "need") viewModel.loadNeed(targetId) { open(it.toDetailTarget()); viewModel.readNotification(notification.id) }
                                else viewModel.openWork(targetId) { open(it.toDetailTarget()); viewModel.readNotification(notification.id) }
                            } else viewModel.readNotification(notification.id)
                        }.padding(vertical = 16.dp, horizontal = 8.dp),verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (notification.readAt == null) Box(Modifier.size(7.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                                Text(testingTime(notification.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            payload.title?.let { Text(it,style = MaterialTheme.typography.titleSmall,fontWeight = FontWeight.SemiBold,maxLines = 2,overflow = TextOverflow.Ellipsis) }
                            payload.actor?.let { Text(it,style = MaterialTheme.typography.bodySmall,color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            payload.status?.let { Text(statusLabel(it),style = MaterialTheme.typography.labelMedium) }
                            payload.decision?.let { Text(if (it == "published") uiText("Approved", "审核通过") else uiText("Not approved", "审核未通过")) }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
