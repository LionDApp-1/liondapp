package top.oneion.liondapp.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import top.oneion.liondapp.ui.appStringResource as stringResource
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.net.toUri
import coil3.compose.AsyncImage
import top.oneion.liondapp.BuildConfig
import top.oneion.liondapp.LionUiState
import top.oneion.liondapp.LionViewModel
import top.oneion.liondapp.WorkSubmissionPhase
import top.oneion.liondapp.WorkSubmissionState
import top.oneion.liondapp.R
import top.oneion.liondapp.model.CreateNeedRequest
import top.oneion.liondapp.model.CreateWorkRequest
import top.oneion.liondapp.model.NeedItem
import top.oneion.liondapp.model.WorkItem
import top.oneion.liondapp.model.StoreAppItem
import top.oneion.liondapp.ui.theme.LionGold
import top.oneion.liondapp.ui.theme.LionGreen
import top.oneion.liondapp.ui.theme.LionCoral

private enum class MainTab { Needs, Works, Profile }
private enum class NeedComposerMode { Structured, Wild }
internal val LocalAppLanguage = compositionLocalOf { "en" }
private data class DetailTarget(
    val kind: String,
    val id: String,
    val title: String,
    val body: String,
    val author: String,
    val url: String? = null,
    val summary: String? = null,
    val audience: String? = null,
    val media: List<String> = emptyList(),
    val needFormat: String = "structured",
    val requestType: String = "free",
    val budgetSkr: Int? = null,
    val moderationStatus: String? = null,
    val promotedUntil: String? = null,
    val originalBody: String? = null,
    val originalSummary: String? = null,
)

private fun mediaUrl(key: String): String = BuildConfig.API_BASE_URL + "/media/" + key.split("/").joinToString("/") { Uri.encode(it) }

private fun WorkItem.toDetailTarget() = DetailTarget(
    "work", id, name, description, authorSkr, summary = summary,
    media = screenshots, moderationStatus = moderationStatus, promotedUntil = promotedUntil,
)

private fun StoreAppItem.toDetailTarget(language: String) = DetailTarget(
    "store",
    androidPackage,
    displayName,
    if (language == "zh") descriptionZh?.takeIf(String::isNotBlank) ?: description else description,
    source,
    storeUrl,
    summary = if (language == "zh") subtitleZh?.takeIf(String::isNotBlank) ?: subtitle else subtitle,
    originalBody = if (language == "zh" && !descriptionZh.isNullOrBlank()) description else null,
    originalSummary = subtitle,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LionDApp(
    activity: ComponentActivity,
    walletActivityResultSender: ActivityResultSender,
    viewModel: LionViewModel,
    language: String,
    onLanguageChange: (String) -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(MainTab.Needs) }
    var query by rememberSaveable { mutableStateOf("") }
    val keyboard = LocalSoftwareKeyboardController.current
    var showNeedComposer by rememberSaveable { mutableStateOf(false) }
    var showWorkComposer by rememberSaveable { mutableStateOf(false) }
    var detail by remember { mutableStateOf<DetailTarget?>(null) }
    var detailAboveChat by remember { mutableStateOf(false) }
    LaunchedEffect(state.activeChat?.id) { if (state.activeChat != null) { detail = null; detailAboveChat = false } }
    var showInbox by rememberSaveable { mutableStateOf(false) }
    var showLanguageMenu by remember { mutableStateOf(false) }
    val snackbars = remember { SnackbarHostState() }

    val errorMessage = state.error?.let { userFacingError(it) }
    LaunchedEffect(errorMessage) { errorMessage?.let { snackbars.showSnackbar(it) } }
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = {
            Column(Modifier.statusBarsPadding()) {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("LionDApp", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        }
                    },
                    actions = {
                        IconButton(onClick = { if (state.skrDomain == null) tab = MainTab.Profile else { showInbox = true; viewModel.loadConversations() } }) {
                            androidx.compose.material3.BadgedBox(badge = { if (state.conversations.sumOf { it.unreadCount } > 0) androidx.compose.material3.Badge() }) {
                                Icon(Icons.Outlined.ChatBubbleOutline, uiText("Messages", "私信"))
                            }
                        }
                        Box {
                            IconButton(onClick = { showLanguageMenu = true }) {
                                Icon(Icons.Outlined.Language, uiText("Language", "语言"))
                            }
                            DropdownMenu(expanded = showLanguageMenu, onDismissRequest = { showLanguageMenu = false }) {
                                DropdownMenuItem(
                                    text = { Text("English") },
                                    trailingIcon = { if (language == "en") Icon(Icons.Outlined.CheckCircle, null) },
                                    onClick = { onLanguageChange("en"); showLanguageMenu = false },
                                )
                                DropdownMenuItem(
                                    text = { Text("中文") },
                                    trailingIcon = { if (language == "zh") Icon(Icons.Outlined.CheckCircle, null) },
                                    onClick = { onLanguageChange("zh"); showLanguageMenu = false },
                                )
                            }
                        }
                        IconButton(onClick = { viewModel.refresh(); viewModel.loadMe() }) { Icon(Icons.Outlined.Refresh, stringResource(R.string.retry)) }
                        if (tab != MainTab.Profile) IconButton(onClick = {
                if (state.skrDomain == null) tab = MainTab.Profile else if (tab == MainTab.Needs) showNeedComposer = true else {
                    viewModel.resetWorkSubmission()
                    showWorkComposer = true
                }
            }, modifier = Modifier.padding(end = 12.dp).size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape)) { Icon(Icons.Outlined.Add, if (tab == MainTab.Needs) stringResource(R.string.publish_need) else stringResource(R.string.publish_work), tint = MaterialTheme.colorScheme.onPrimaryContainer) }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                    windowInsets = WindowInsets(0, 0, 0, 0),
                )
                if (tab != MainTab.Profile) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                        placeholder = { Text(stringResource(R.string.search_hint), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        leadingIcon = { Icon(Icons.Outlined.Search, null) },
                        trailingIcon = {
                            Row {
                                if (query.trim().length >= 2) IconButton(onClick = { viewModel.search(query); keyboard?.hide() }) { Icon(Icons.Outlined.Search, uiText("Search", "搜索")) }
                                if (query.isNotBlank()) IconButton(onClick = { query = ""; viewModel.refresh() }) { Icon(Icons.Outlined.Close, uiText("Clear", "清除")) }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(30.dp),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { viewModel.search(query); keyboard?.hide() }),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    )
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.background, tonalElevation = 0.dp) {
                NavigationBarItem(tab == MainTab.Needs, { tab = MainTab.Needs }, { Icon(Icons.Outlined.Lightbulb, null) }, label = { Text(stringResource(R.string.needs)) }, colors = storeNavigationColors())
                NavigationBarItem(tab == MainTab.Works, { tab = MainTab.Works }, { Icon(Icons.Outlined.Storefront, null) }, label = { Text(stringResource(R.string.works)) }, colors = storeNavigationColors())
                NavigationBarItem(tab == MainTab.Profile, { tab = MainTab.Profile }, { Icon(Icons.Outlined.PersonOutline, null) }, label = { Text(stringResource(R.string.profile)) }, colors = storeNavigationColors())
            }
        },
    ) { padding ->
        when {
            state.loading && state.needs.isEmpty() && state.works.isEmpty() -> Loading(Modifier.padding(padding))
            tab == MainTab.Needs -> NeedsScreen(state, Modifier.padding(padding), viewModel, { tab = MainTab.Profile }, { detail = it })
            tab == MainTab.Works -> WorksScreen(state, Modifier.padding(padding), viewModel, { tab = MainTab.Profile }, { detail = it })
            else -> ProfileScreen(state, Modifier.padding(padding), activity, walletActivityResultSender, viewModel, language)
        }
    }

    if (showNeedComposer) NeedComposer(state.config?.categories.orEmpty(), state.publishingNeed, state.error, { showNeedComposer = false }) { request ->
        viewModel.publishNeed(request) { if (it) { showNeedComposer = false; viewModel.refresh() } }
    }
    if (showWorkComposer) WorkComposer(state.config?.categories.orEmpty(), state.workSubmission, { showWorkComposer = false }) { request, media ->
        viewModel.publishWork(request, media) { if (it) { viewModel.refresh(); viewModel.loadMe() } }
    }
    detail?.takeUnless { detailAboveChat }?.let { target ->
        DetailDialog(target, state, onClose = { detail = null }, onRequireSignIn = { detail = null; tab = MainTab.Profile }, viewModel = viewModel, activity = activity)
    }
    if (showInbox && state.skrDomain != null) InboxDialog(state, viewModel) { showInbox = false }
    state.activeChat?.let { chat -> key(chat.id) { ChatDialog(state, viewModel) } }
    detail?.takeIf { detailAboveChat }?.let { target ->
        DetailDialog(target, state, onClose = { detail = null; detailAboveChat = false }, onRequireSignIn = { detail = null; detailAboveChat = false; tab = MainTab.Profile }, viewModel = viewModel, activity = activity)
    }
    state.profilePreview?.let { profile -> PublicProfileDialog(profile.skrDomain, state, { viewModel.clearProfile() }, { viewModel.clearProfile(); tab = MainTab.Profile }, viewModel) { viewModel.clearProfile(); detailAboveChat = state.activeChat != null; detail = it } }
}

@Composable
private fun Loading(modifier: Modifier = Modifier) = Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
private fun NeedsScreen(state: LionUiState, modifier: Modifier, viewModel: LionViewModel, onRequireSignIn: () -> Unit, open: (DetailTarget) -> Unit) {
    var sort by rememberSaveable { mutableStateOf("latest") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    val language = LocalAppLanguage.current
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp, 12.dp, 20.dp, 100.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!state.searchActive) item {
            DiscoveryBanner(uiText("THE SEEKER COMMUNITY", "SEEKER 社区"), uiText("Great apps start\nwith your ideas.", "好应用，从你的\n一个想法开始。"), uiText("Discover a need. Inspire the next dApp.", "发现真实需求，让下一个 dApp 在这里诞生。"))
        }
        item { Text(uiText("Paid development first · budgets are self-reported", "付费开发优先 · 预算由需求方自行填写"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item { FeedHeading(if (state.searchActive) uiText("Search results", "搜索结果") else uiText("Community needs", "社区需求"), state.needs.size) }
        item {
            SortRow(listOf("latest" to stringResource(R.string.latest), "needed" to stringResource(R.string.most_needed), "discussed" to stringResource(R.string.most_discussed)), sort) {
                sort = it; viewModel.refresh(needSort = it, needCategory = category)
            }
        }
        item { CategoryFilterRow(state.config?.categories.orEmpty(), category) { category = it; viewModel.refresh(needSort = sort, needCategory = it) } }
        if (state.needs.isEmpty()) item { EmptyState(Icons.Outlined.Lightbulb, stringResource(R.string.empty_needs)) }
        items(state.needs, key = { it.id }) { need -> NeedCard(need, { if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleNeed(need.id) }, author = { viewModel.loadProfile(need.authorSkr) }) {
            open(DetailTarget("need", need.id, need.title, need.problem, need.authorSkr, summary = need.solutionIdea.takeIf(String::isNotBlank), audience = need.audience, media = need.media, needFormat = need.format, requestType = need.requestType, budgetSkr = need.budgetSkr))
        } }
        if (state.searchActive && state.works.isNotEmpty()) {
            item { SectionTitle(uiText("Matching works", "匹配作品"), Modifier.padding(top = 14.dp)) }
            items(state.works, key = { "search-${it.id}" }) { work -> WorkCard(work, { if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleWork(work.id) }, author = { viewModel.loadProfile(work.authorSkr) }) { open(work.toDetailTarget()) } }
        }
        if (state.searchActive && state.storeApps.isNotEmpty()) {
            item { SectionTitle(uiText("Available in Solana dApp Store", "Solana dApp Store 已有应用"), Modifier.padding(top = 14.dp)) }
            items(state.storeApps, key = { "store-${it.androidPackage}" }) { app -> StoreAppCard(app) { open(app.toDetailTarget(language)) } }
        }
    }
}

@Composable
private fun WorksScreen(state: LionUiState, modifier: Modifier, viewModel: LionViewModel, onRequireSignIn: () -> Unit, open: (DetailTarget) -> Unit) {
    var sort by rememberSaveable { mutableStateOf("latest") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    val language = LocalAppLanguage.current
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!state.searchActive && state.promoted.isEmpty()) item {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                DiscoveryBanner(uiText("MADE FOR SEEKER", "为 SEEKER 而造"), uiText("Small teams.\nBig possibilities.", "小小团队，\n创造无限可能。"), uiText("Explore what the community is building.", "探索社区开发者的作品与创意。"))
            }
        }
        item { FeedHeading(uiText("Discover dApps", "发现 dApps"), state.works.size + state.promoted.size, Modifier.padding(horizontal = 20.dp)) }
        if (state.promoted.isNotEmpty()) {
            item { SectionTitle(stringResource(R.string.promoted), Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.promoted, key = { it.id }) { work -> PromotedWorkCard(work) { open(work.toDetailTarget()) } }
                }
            }
        }
        item {
            SortRow(listOf("latest" to stringResource(R.string.latest), "liked" to stringResource(R.string.most_liked), "discussed" to stringResource(R.string.most_discussed)), sort, Modifier.padding(horizontal = 16.dp)) {
                sort = it; viewModel.refresh(workSort = it, workCategory = category)
            }
        }
        item { CategoryFilterRow(state.config?.categories.orEmpty(), category, Modifier.padding(horizontal = 16.dp)) { category = it; viewModel.refresh(workSort = sort, workCategory = it) } }
        if (state.works.isEmpty()) item { EmptyState(Icons.Outlined.Storefront, stringResource(R.string.empty_works), Modifier.padding(horizontal = 16.dp)) }
        items(state.works, key = { it.id }) { work ->
            Box(Modifier.padding(horizontal = 16.dp)) { WorkCard(work, { if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleWork(work.id) }, author = { viewModel.loadProfile(work.authorSkr) }) { open(work.toDetailTarget()) } }
        }
        if (state.searchActive && state.storeApps.isNotEmpty()) {
            item { SectionTitle(uiText("Available in Solana dApp Store", "Solana dApp Store 已有应用"), Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) }
            items(state.storeApps, key = { "store-${it.androidPackage}" }) { app -> Box(Modifier.padding(horizontal = 16.dp)) { StoreAppCard(app) { open(app.toDetailTarget(language)) } } }
        }
    }
}

@Composable
private fun storeNavigationColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = MaterialTheme.colorScheme.background,
    selectedTextColor = MaterialTheme.colorScheme.onBackground,
    indicatorColor = MaterialTheme.colorScheme.primary,
    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
)

@Composable
private fun DiscoveryBanner(eyebrow: String, title: String, subtitle: String) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFF214E41), Color(0xFF162B27), Color(0xFF192723))))) {
        Canvas(Modifier.matchParentSize()) {
            val center = Offset(size.width * .94f, size.height * .38f)
            for (radius in listOf(.22f, .39f, .56f)) {
                drawCircle(Color(0xFF99EDC6).copy(alpha = .12f), size.width * radius, center, style = Stroke(1.5.dp.toPx()))
            }
            drawCircle(Color(0xFFB7F5D1).copy(alpha = .12f), 22.dp.toPx(), Offset(size.width * .82f, size.height * .28f))
        }
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(eyebrow, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.6.sp, color = Color(0xFFB7F5D1), fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.headlineLarge, color = Color.White, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Color(0xFFB4CEC3))
        }
    }
}

@Composable
private fun FeedHeading(title: String, count: Int, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(top = 16.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (count > 0) Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
            Text(count.toString(), Modifier.padding(horizontal = 10.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SortRow(options: List<Pair<String, String>>, selected: String, modifier: Modifier = Modifier, select: (String) -> Unit) {
    LazyRow(modifier, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        items(options) { (value, label) ->
            Column(Modifier.clickable { select(value) }.padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = if (selected == value) FontWeight.Bold else FontWeight.Normal, color = if (selected == value) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Box(Modifier.width(28.dp).height(3.dp).clip(CircleShape).background(if (selected == value) MaterialTheme.colorScheme.primaryContainer else Color.Transparent))
            }
        }
    }
}

@Composable
private fun CategoryFilterRow(categories: List<String>, selected: String?, modifier: Modifier = Modifier, select: (String?) -> Unit) {
    LazyRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(listOf<String?>(null) + categories) { category ->
            FilterChip(selected == category, { select(category) }, { Text(category?.let { categoryLabel(it) } ?: uiText("All", "全部")) }, shape = CircleShape,
                colors = FilterChipDefaults.filterChipColors(containerColor = MaterialTheme.colorScheme.surface, selectedContainerColor = MaterialTheme.colorScheme.primaryContainer, selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer), border = null)
        }
    }
}

@Composable
private fun NeedCard(item: NeedItem, react: () -> Unit, author: () -> Unit = {}, open: () -> Unit) {
    val isWild = item.format == "wild"
    Card(onClick = open, shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = if (isWild) Color(0xFF393349) else MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (isWild) Icons.Outlined.AutoAwesome else Icons.Outlined.Lightbulb, null, Modifier.size(14.dp), tint = if (isWild) Color(0xFFD6C4F5) else MaterialTheme.colorScheme.primaryContainer)
                        Spacer(Modifier.width(6.dp))
                        Text(if (isWild) uiText("Wild Ideas", "天马行空") else categoryLabel(item.category), style = MaterialTheme.typography.labelSmall)
                    }
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
            RequestBadge(item.requestType, item.budgetSkr)
            Text(item.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(item.problem, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.authorSkr, Modifier.weight(1f).clickable(onClick = author), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Stat(Icons.Outlined.ChatBubbleOutline, item.commentCount)
                Spacer(Modifier.width(12.dp))
                Surface(onClick = react, shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Lightbulb, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primaryContainer)
                        Spacer(Modifier.width(6.dp)); Text(item.needCount.toString(), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkCard(item: WorkItem, react: () -> Unit, author: () -> Unit = {}, open: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).clickable(onClick = open).padding(vertical = 16.dp, horizontal = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(model = mediaUrl(item.iconKey), contentDescription = item.name, modifier = Modifier.size(76.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentScale = ContentScale.Crop)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.summary, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(categoryLabel(item.category), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            }
            Spacer(Modifier.width(8.dp))
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
                Icon(Icons.Outlined.ChevronRight, null, Modifier.padding(10.dp).size(20.dp))
            }
        }
        Row(Modifier.padding(start = 92.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(item.authorSkr, Modifier.weight(1f).clickable(onClick = author), style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(react, contentPadding = PaddingValues(horizontal = 8.dp)) { Icon(Icons.Outlined.FavoriteBorder, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(item.likeCount.toString()) }
            Stat(Icons.Outlined.ChatBubbleOutline, item.commentCount)
        }
        HorizontalDivider(Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
    }
}

@Composable
private fun StoreAppCard(item: StoreAppItem, open: () -> Unit) {
    val language = LocalAppLanguage.current
    val subtitle = if (language == "zh") item.subtitleZh?.takeIf(String::isNotBlank) ?: item.subtitle else item.subtitle
    val description = if (language == "zh") item.descriptionZh?.takeIf(String::isNotBlank) ?: item.description else item.description
    val category = if (language == "zh") item.categoryNameZh?.takeIf(String::isNotBlank) ?: item.categoryName else item.categoryName
    Card(onClick = open, shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(model = item.iconUrl, contentDescription = item.displayName, modifier = Modifier.size(72.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentScale = ContentScale.Crop)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(subtitle.ifBlank { description }, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(uiText("Solana dApp Store", if (!item.descriptionZh.isNullOrBlank()) "Solana dApp 商店 · 机器翻译" else "Solana dApp 商店 · 原文"), style = MaterialTheme.typography.labelMedium, color = LionGreen)
                }
                Icon(Icons.Outlined.ChevronRight, null)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                item.rating?.let { Text("★ %.1f".format(it), style = MaterialTheme.typography.labelMedium) }
                Spacer(Modifier.weight(1f))
                category?.let { Text(it, style = MaterialTheme.typography.labelMedium) }
            }
        }
    }
}

@Composable
private fun PromotedWorkCard(item: WorkItem, open: () -> Unit) {
    Card(onClick = open, modifier = Modifier.width(310.dp), shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFF3F7F4))) {
        Box(Modifier.fillMaxWidth().height(230.dp).background(Color(0xFF203A30))) {
            item.screenshots.firstOrNull()?.let { key ->
                AsyncImage(model = mediaUrl(key), contentDescription = item.name, modifier = Modifier.matchParentSize(), contentScale = ContentScale.Crop)
            }
            Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .12f), Color.Black.copy(alpha = .85f)))))
            Surface(Modifier.padding(16.dp), shape = CircleShape, color = Color.Black.copy(alpha = .65f)) {
                Text(stringResource(R.string.promoted), Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, color = Color.White)
            }
            Text(item.summary, Modifier.align(Alignment.BottomStart).padding(20.dp), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(model = mediaUrl(item.iconKey), contentDescription = item.name, modifier = Modifier.size(54.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFDFE8E1)), contentScale = ContentScale.Crop)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, color = Color(0xFF102019), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(categoryLabel(item.category), style = MaterialTheme.typography.bodySmall, color = Color(0xFF5E7268))
            }
            Icon(Icons.Outlined.ChevronRight, null, tint = Color(0xFF102019))
        }
    }
}

@Composable
private fun ProfileScreen(
    state: LionUiState,
    modifier: Modifier,
    activity: ComponentActivity,
    walletActivityResultSender: ActivityResultSender,
    viewModel: LionViewModel,
    language: String,
) {
    var age by rememberSaveable { mutableStateOf(false) }
    var terms by rememberSaveable { mutableStateOf(false) }
    var deleteAccount by rememberSaveable { mutableStateOf(false) }
    var showNotifications by rememberSaveable { mutableStateOf(false) }
    var showDonation by rememberSaveable { mutableStateOf(false) }
    var editProfile by rememberSaveable { mutableStateOf(false) }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (state.skrDomain == null) {
            Icon(painterResource(R.drawable.ic_liondapp), null, Modifier.size(72.dp), tint = Color.Unspecified)
            Text(uiText("Join LionDApp", "加入 LionDApp"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.browse_first), color = MaterialTheme.colorScheme.onSurfaceVariant)
            ConsentRow(age, { age = it }, uiText("I confirm that I am at least 18 years old", "我确认已年满 18 周岁"))
            ConsentRow(terms, { terms = it }, uiText("I accept the Terms, Privacy Policy and Community Rules", "我接受服务条款、隐私政策和社区规则"))
            Column {
                TextButton({ activity.startActivity(Intent(Intent.ACTION_VIEW, "https://liondapp.1ion.top/terms".toUri())) }) { Text(uiText("Terms of Service", "服务条款")) }
                TextButton({ activity.startActivity(Intent(Intent.ACTION_VIEW, "https://liondapp.1ion.top/privacy".toUri())) }) { Text(uiText("Privacy Policy", "隐私政策")) }
                TextButton({ activity.startActivity(Intent(Intent.ACTION_VIEW, "https://liondapp.1ion.top/community".toUri())) }) { Text(uiText("Community Rules", "社区规则")) }
            }
            Button(onClick = { viewModel.signIn(walletActivityResultSender, language) }, enabled = age && terms && !state.authenticating, modifier = Modifier.fillMaxWidth()) {
                if (state.authenticating) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Icon(Icons.Outlined.Verified, null)
                Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.connect_wallet))
            }
        } else {
            Box(Modifier.size(72.dp).background(MaterialTheme.colorScheme.tertiaryContainer, CircleShape), contentAlignment = Alignment.Center) { Text(state.skrDomain.take(1).uppercase(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold) }
            Text(state.skrDomain, Modifier.clickable { viewModel.loadProfile(state.skrDomain) }, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.CheckCircle, null, tint = LionGreen); Spacer(Modifier.width(8.dp)); Text(uiText("Verified Seeker identity", "已验证 Seeker 身份")) }
            HorizontalDivider()
            ProfileLink(Icons.Outlined.NotificationsNone, "${stringResource(R.string.notifications)} (${state.notifications.size})") { showNotifications = true }
            ProfileLink(Icons.AutoMirrored.Outlined.OpenInNew, stringResource(R.string.support)) { activity.startActivity(Intent(Intent.ACTION_VIEW, "https://liondapp.1ion.top/support".toUri())) }
            ProfileLink(Icons.Outlined.FavoriteBorder, uiText("Support LionDApp", "支持 LionDApp · 自愿打赏")) { showDonation = true }
            ProfileLink(Icons.Outlined.PersonOutline, uiText("Edit profile", "编辑资料")) { editProfile = true }
            if (state.myNeeds.isNotEmpty()) {
                SectionTitle(uiText("My needs", "我的需求"))
                state.myNeeds.forEach { item -> OwnedContentRow(item.title, "${item.needCount} · ${item.commentCount}") { viewModel.deleteNeed(item.id) } }
            }
            if (state.myWorks.isNotEmpty()) {
                SectionTitle(uiText("My works", "我的作品"))
                state.myWorks.forEach { item ->
                    val status = when {
                        item.publicVisibility == "hidden_policy" -> uiText("Hidden · Community Rules", "已屏蔽 · 违反社区规则")
                        item.moderationStatus == "published" -> uiText("Published", "已发布")
                        item.moderationStatus == "pending" -> uiText("Awaiting review", "待审核")
                        item.moderationStatus == "rejected" -> uiText("Not approved", "审核未通过")
                        else -> uiText("Not published", "未公开")
                    }
                    OwnedContentRow(item.name, status) { viewModel.deleteWork(item.id) }
                }
            }
            if (state.blockedUsers.isNotEmpty()) {
                SectionTitle(uiText("Blocked users", "已屏蔽用户"))
                state.blockedUsers.forEach { item -> BlockedUserRow(item.skrDomain) { viewModel.unblockUser(item.skrDomain) } }
            }
            OutlinedButton(onClick = viewModel::signOut, modifier = Modifier.fillMaxWidth()) { Text(uiText("Sign out", "退出登录")) }
            TextButton(onClick = { deleteAccount = true }, modifier = Modifier.fillMaxWidth()) { Text(uiText("Delete account", "删除账户"), color = MaterialTheme.colorScheme.error) }
        }
    }
    if (showDonation && state.skrDomain != null) DonationDialog(state, viewModel, walletActivityResultSender) { showDonation = false }
    if (deleteAccount) AlertDialog(onDismissRequest = { deleteAccount = false }, icon = { Icon(Icons.Outlined.DeleteOutline, null) }, title = { Text(uiText("Delete account?", "删除账户？")) }, text = { Text(uiText("Your public profile and content will be removed. Public blockchain transactions cannot be deleted.", "你的公开资料和内容将被移除，公开区块链交易无法删除。")) }, confirmButton = { TextButton({ viewModel.deleteAccount { deleteAccount = false } }) { Text(uiText("Delete", "删除"), color = MaterialTheme.colorScheme.error) } }, dismissButton = { TextButton({ deleteAccount = false }) { Text(uiText("Cancel", "取消")) } })
    if (showNotifications) AlertDialog(onDismissRequest = { showNotifications = false }, title = { Text(stringResource(R.string.notifications)) }, text = { if (state.notifications.isEmpty()) Text(uiText("No notifications", "暂无通知")) else Column(Modifier.fillMaxHeight(.55f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) { state.notifications.forEach { Text("${it.type}\n${it.createdAt}") } } }, confirmButton = { TextButton({ showNotifications = false }) { Text(uiText("Close", "关闭")) } })
    if (editProfile) EditProfileDialog(state.myProfile?.bio.orEmpty(), state.myProfile?.socialUrl.orEmpty(), { editProfile = false }) { bio, social -> viewModel.updateProfile(bio, social) { if (it) editProfile = false } }
}

@Composable private fun ConsentRow(checked: Boolean, change: (Boolean) -> Unit, label: String) = Row(verticalAlignment = Alignment.Top) { Checkbox(checked, change); Text(label, Modifier.padding(top = 12.dp)) }
@Composable private fun ProfileLink(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clickable(onClick = click).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null); Spacer(Modifier.width(12.dp)); Text(label, Modifier.weight(1f)); Icon(Icons.Outlined.ChevronRight, null) }
@Composable private fun OwnedContentRow(title: String, meta: String, delete: () -> Unit) = Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(meta, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }; IconButton(delete) { Icon(Icons.Outlined.DeleteOutline, stringResource(R.string.delete), tint = MaterialTheme.colorScheme.error) } }
@Composable private fun BlockedUserRow(skrDomain: String, unblock: () -> Unit) = Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(skrDomain, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(uiText("Hidden from your feed", "其内容已隐藏"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }; IconButton(unblock) { Icon(Icons.Outlined.Restore, uiText("Unblock", "解除屏蔽")) } }

@Composable
private fun DetailDialog(target: DetailTarget, state: LionUiState, onClose: () -> Unit, onRequireSignIn: () -> Unit, viewModel: LionViewModel, activity: ComponentActivity) {
    var showOriginal by rememberSaveable(target.id) { mutableStateOf(false) }
    var comment by rememberSaveable(target.id) { mutableStateOf("") }
    var replyTo by rememberSaveable(target.id) { mutableStateOf<String?>(null) }
    var pendingUrl by remember { mutableStateOf<String?>(null) }
    var showReport by rememberSaveable(target.id) { mutableStateOf(false) }
    var confirmBlock by rememberSaveable(target.id) { mutableStateOf(false) }
    var confirmDelete by rememberSaveable(target.id) { mutableStateOf(false) }
    var confirmSwitchChat by rememberSaveable(target.id) { mutableStateOf(false) }
    val isOwner = state.skrDomain != null && target.author == state.skrDomain
    val promotionActive = target.promotedUntil?.let { it > java.time.Instant.now().toString() } == true
    LaunchedEffect(target.id) { if (target.kind != "store") viewModel.loadComments(target.kind, target.id) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClose) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, null) }
                    Text(target.title, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                    if (target.kind != "store" && state.skrDomain != null && !isOwner) IconButton({ confirmBlock = true }) { Icon(Icons.Outlined.Block, uiText("Block user", "屏蔽用户")) }
                    if (target.kind != "store" && state.skrDomain != null) IconButton({ showReport = true }) { Icon(Icons.Outlined.Flag, uiText("Report", "举报")) }
                    if (target.kind == "work" && isOwner) IconButton({ confirmDelete = true }) { Icon(Icons.Outlined.DeleteOutline, uiText("Delete work", "删除作品"), tint = MaterialTheme.colorScheme.error) }
                }
                LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    item { if (target.kind == "store") MetaRow(target.author, uiText("Official catalog", "官方目录")) else MetaRow(target.author, if (target.kind == "need") stringResource(R.string.needs) else stringResource(R.string.works), { viewModel.loadProfile(target.author) }) }
                    if (target.kind == "need") item {
                        RequestBadge(target.requestType, target.budgetSkr)
                        if (target.requestType == "paid_development") Text(uiText("Budget stated by the author; payment and delivery are not guaranteed.", "预算由需求方自行填写，不代表已付款或交付担保。"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!isOwner) Button(onClick = {
                            when {
                                state.skrDomain == null -> onRequireSignIn()
                                state.activeChat?.needId == target.id -> onClose()
                                state.activeChat != null && (state.chatDraft.isNotBlank() || state.chatSending) -> confirmSwitchChat = true
                                else -> viewModel.contactNeed(target.id, target.title, target.author)
                            }
                        }, enabled = !state.chatLoading, modifier = Modifier.fillMaxWidth()) { Text(if (state.activeChat?.needId == target.id) uiText("Return to conversation", "返回对话") else uiText("Discuss this project", "联系需求方")) }
                    }
                    item { Text(target.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
                    if (target.originalBody != null) item { Text("机器翻译，仅供参考；请以原文为准。", style = MaterialTheme.typography.bodySmall); TextButton({ showOriginal = !showOriginal }) { Text(if (showOriginal) "查看中文" else "查看原文") } }
                    (if (showOriginal) target.originalSummary else target.summary)?.let { summary -> item { SectionTitle(if (target.kind == "need") uiText("Suggested approach", "建议模式") else uiText("Overview", "简介")); Text(summary, style = MaterialTheme.typography.bodyLarge) } }
                    item {
                        if (target.needFormat == "wild") SectionTitle(uiText("The spark", "灵感构想"))
                        Text(if (showOriginal) target.originalBody ?: target.body else target.body, style = MaterialTheme.typography.bodyLarge)
                    }
                    target.audience?.let { audience -> item { SectionTitle(uiText("Who needs this", "适用人群")); Text(audience) } }
                    if (target.media.isNotEmpty()) item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(target.media) { key -> AsyncImage(model = mediaUrl(key), contentDescription = target.title, modifier = Modifier.width(220.dp).height(360.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentScale = ContentScale.Fit) }
                        }
                    }
                    if (target.url != null) item { Button({ pendingUrl = target.url }, Modifier.fillMaxWidth()) { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null); Spacer(Modifier.width(8.dp)); Text(uiText("Open in Solana dApp Store", "在 Solana dApp Store 中打开")) } }
                    if (BuildConfig.PROMOTION_PURCHASE_ENABLED && target.kind == "work" && isOwner && target.moderationStatus == "published" && !promotionActive && state.config != null) item {
                        OutlinedButton({ viewModel.promoteWork(target.id) {} }, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.RocketLaunch, null); Spacer(Modifier.width(8.dp)); Text(uiText("Recommend for ${state.config.recommendation.priceSkr} SKR / ${state.config.recommendation.durationDays} days", "支付 ${state.config.recommendation.priceSkr} SKR 推荐 ${state.config.recommendation.durationDays} 天")) }
                    }
                    if (target.kind != "store") item { HorizontalDivider(); SectionTitle(stringResource(R.string.comments)) }
                    if (target.kind != "store") items(state.comments, key = { it.id }) { item ->
                        Column(Modifier.padding(start = if (item.parentId != null) 20.dp else 0.dp)) { Text(item.authorSkr, modifier = Modifier.clickable { viewModel.loadProfile(item.authorSkr) }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary); Text(item.body); Row(verticalAlignment = Alignment.CenterVertically) { TextButton({ if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleComment(item.id, target.kind, target.id) }, contentPadding = PaddingValues(horizontal = 4.dp)) { Text("♡ ${item.likeCount}") }; if (item.parentId == null && state.skrDomain != null) TextButton({ replyTo = item.id }) { Text(uiText("Reply", "回复")) } } }
                    }
                }
                state.error?.let { error ->
                    Text(userFacingError(error), Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                if (target.kind != "store" && state.skrDomain != null) Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(comment, { comment = it }, Modifier.weight(1f), placeholder = { Text(if (replyTo == null) uiText("Write a comment", "写评论") else uiText("Write a reply", "写回复")) }, maxLines = 3)
                    TextButton(onClick = { if (comment.isNotBlank()) viewModel.comment(target.kind, target.id, comment, replyTo) { if (it) { comment = ""; replyTo = null } } }) { Text(uiText("Post", "发布")) }
                }
            }
        }
    }
    pendingUrl?.let { url ->
        AlertDialog(onDismissRequest = { pendingUrl = null }, icon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) }, title = { Text(uiText("Leave LionDApp?", "离开 LionDApp？")) }, text = { Text(url.toUri().getQueryParameter("id") ?: url.toUri().host ?: url) }, confirmButton = { TextButton({ activity.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())); pendingUrl = null }) { Text(uiText("Continue", "继续")) } }, dismissButton = { TextButton({ pendingUrl = null }) { Text(uiText("Cancel", "取消")) } })
    }
    if (confirmSwitchChat) AlertDialog(
        onDismissRequest = { confirmSwitchChat = false },
        title = { Text(uiText("Switch conversation?", "切换对话？")) },
        text = { Text(uiText("Unsent text will be discarded. A message already sending may still arrive.", "未发送的文字将丢弃。正在发送的消息仍可能送达。")) },
        confirmButton = { TextButton({ confirmSwitchChat = false; viewModel.contactNeed(target.id, target.title, target.author) }) { Text(uiText("Switch", "切换")) } },
        dismissButton = { TextButton({ confirmSwitchChat = false }) { Text(uiText("Cancel", "取消")) } },
    )
    if (showReport) ReportDialog(target.kind, target.id, { showReport = false }) { reason, details -> viewModel.report(target.kind, target.id, reason, details) { if (it) showReport = false } }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, icon = { Icon(Icons.Outlined.DeleteOutline, null) }, title = { Text(uiText("Delete this work?", "删除这个作品？")) }, text = { Text(uiText("It will disappear from LionDApp and cannot be restored.", "它将从 LionDApp 中移除，且无法恢复。")) }, confirmButton = { TextButton({ viewModel.deleteWork(target.id) { deleted -> if (deleted) onClose() }; confirmDelete = false }) { Text(uiText("Delete", "删除"), color = MaterialTheme.colorScheme.error) } }, dismissButton = { TextButton({ confirmDelete = false }) { Text(uiText("Cancel", "取消")) } })
    if (confirmBlock) AlertDialog(onDismissRequest = { confirmBlock = false }, icon = { Icon(Icons.Outlined.Block, null) }, title = { Text(uiText("Block ${target.author}?", "屏蔽 ${target.author}？")) }, text = { Text(uiText("Their posts and comments will be hidden from your account. You can unblock them from Profile.", "其帖子和评论将对你的账户隐藏，可在个人页面解除屏蔽。")) }, confirmButton = { TextButton({ viewModel.blockUser(target.author) { if (it) { confirmBlock = false; onClose() } } }) { Text(uiText("Block", "屏蔽"), color = MaterialTheme.colorScheme.error) } }, dismissButton = { TextButton({ confirmBlock = false }) { Text(uiText("Cancel", "取消")) } })
}

@Composable
private fun EditProfileDialog(initialBio: String, initialSocial: String, close: () -> Unit, save: (String, String) -> Unit) {
    var bio by rememberSaveable { mutableStateOf(initialBio) }
    var social by rememberSaveable { mutableStateOf(initialSocial) }
    AlertDialog(onDismissRequest = close, title = { Text(uiText("Edit profile", "编辑资料")) }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { FormField(uiText("Bio", "简介"), bio, 4) { bio = it.take(500) }; FormField(uiText("Developer page URL", "开发者主页链接"), social, 2) { social = it.take(500) } } }, confirmButton = { TextButton({ save(bio.trim(), social.trim()) }) { Text(uiText("Save", "保存")) } }, dismissButton = { TextButton(close) { Text(uiText("Cancel", "取消")) } })
}

@Composable
private fun PublicProfileDialog(skrDomain: String, state: LionUiState, close: () -> Unit, onRequireSignIn: () -> Unit, viewModel: LionViewModel, open: (DetailTarget) -> Unit) {
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(close) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, null) }; Text(skrDomain, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.profilePreview?.bio?.let { item { Text(it) } }
                    state.profilePreview?.socialUrl?.let { item { Text(it, color = MaterialTheme.colorScheme.secondary) } }
                    if (state.profileNeeds.isNotEmpty()) item { SectionTitle(uiText("Needs", "需求")) }
                    items(state.profileNeeds, key = { "profile-${it.id}" }) { need -> NeedCard(need, { if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleNeed(need.id) }, author = { viewModel.loadProfile(need.authorSkr) }) { open(DetailTarget("need", need.id, need.title, need.problem, need.authorSkr, summary = need.solutionIdea.takeIf(String::isNotBlank), audience = need.audience, media = need.media, needFormat = need.format, requestType = need.requestType, budgetSkr = need.budgetSkr)) } }
                    if (state.profileWorks.isNotEmpty()) item { SectionTitle(uiText("Works", "作品")) }
                    items(state.profileWorks, key = { "profile-${it.id}" }) { work -> WorkCard(work, { if (state.skrDomain == null) onRequireSignIn() else viewModel.toggleWork(work.id) }, author = { viewModel.loadProfile(work.authorSkr) }) { open(work.toDetailTarget()) } }
                }
            }
        }
    }
}

@Composable
private fun ReportDialog(targetType: String, targetId: String, close: () -> Unit, submit: (String, String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    var details by rememberSaveable { mutableStateOf("") }
    AlertDialog(onDismissRequest = close, icon = { Icon(Icons.Outlined.Flag, null) }, title = { Text(uiText("Report content", "举报内容")) }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { FormField(uiText("Reason", "原因"), reason) { reason = it }; FormField(uiText("Details (optional)", "详细说明（可选）"), details, 3) { details = it } } }, confirmButton = { TextButton({ submit(reason.trim(), details.trim()) }, enabled = reason.isNotBlank()) { Text(uiText("Submit", "提交")) } }, dismissButton = { TextButton(close) { Text(uiText("Cancel", "取消")) } })
}

@Composable
private fun NeedComposer(categories: List<String>, publishing: Boolean, error: String?, close: () -> Unit, submit: (CreateNeedRequest) -> Unit) {
    var mode by rememberSaveable { mutableStateOf(NeedComposerMode.Structured) }
    var title by rememberSaveable { mutableStateOf("") }; var problem by rememberSaveable { mutableStateOf("") }; var solution by rememberSaveable { mutableStateOf("") }; var audience by rememberSaveable { mutableStateOf("") }; var category by rememberSaveable { mutableStateOf(categories.firstOrNull { it != "天马行空" } ?: "其他") }; var tags by rememberSaveable { mutableStateOf("") }
    var paid by rememberSaveable { mutableStateOf(false) }
    var budget by rememberSaveable { mutableStateOf("") }
    val budgetValid = budget.toIntOrNull()?.let { it in 1..1_000_000_000 } == true
    val hasDraft = paid || budget.isNotBlank() || title.isNotBlank() || problem.isNotBlank() || solution.isNotBlank() || audience.isNotBlank() || tags.isNotBlank()
    ComposerShell(if (mode == NeedComposerMode.Wild) uiText("Wild Ideas", "天马行空") else uiText("Publish a need", "发布需求"), hasDraft, close, canClose = !publishing) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(mode == NeedComposerMode.Structured, { mode = NeedComposerMode.Structured }, { Text(uiText("Structured", "结构化需求")) }, leadingIcon = { Icon(Icons.Outlined.Lightbulb, null, Modifier.size(18.dp)) })
            FilterChip(mode == NeedComposerMode.Wild, { mode = NeedComposerMode.Wild }, { Text(uiText("Wild Ideas", "天马行空")) }, leadingIcon = { Icon(Icons.Outlined.AutoAwesome, null, Modifier.size(18.dp), tint = LionGold) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(!paid, { paid = false }, { Text(uiText("Free request", "免费诉求")) })
            FilterChip(paid, { paid = true }, { Text(uiText("Paid development", "付费开发")) })
        }
        if (paid) {
            OutlinedTextField(budget, { budget = it.filter(Char::isDigit).take(10) }, Modifier.fillMaxWidth(), label = { Text(uiText("Intended budget · SKR", "预算意向 · SKR")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                isError = budget.isNotEmpty() && !budgetValid,
                supportingText = { Text(uiText("Whole SKR, 1–1,000,000,000. This is a budget, not a payment.", "填写 1–1,000,000,000 的整数 SKR，仅展示预算，不收款。")) })
        }
        if (mode == NeedComposerMode.Wild) {
            Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = RoundedCornerShape(6.dp)) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).background(LionCoral, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.AutoAwesome, null, tint = Color.White) }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(uiText("No limits. Capture the spark.", "不设边界，记下灵光一现。"), fontWeight = FontWeight.Bold)
                        Text(uiText("What should exist, but doesn't yet?", "什么东西本该存在，却还没有出现？"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            FormField(uiText("Name your spark", "给灵感起个名字"), title) { title = it }
            FormField(uiText("What exists in your imagination?", "你脑海中的构想是什么？"), problem, 8) { problem = it }
            FormField(uiText("Who would love this?", "谁会喜欢这个构想？"), audience, 3) { audience = it }
        } else {
            FormField(uiText("Title", "标题"), title) { title = it }; FormField(uiText("What problem are you facing?", "你遇到了什么问题？"), problem, 5) { problem = it }; FormField(uiText("How could it work?", "希望它如何解决？"), solution, 5) { solution = it }; FormField(uiText("Who is it for?", "适用人群"), audience, 3) { audience = it }; CategoryField(categories.filter { it != "天马行空" }, category) { category = it }; FormField(uiText("Tags, separated by commas", "标签，用逗号分隔"), tags) { tags = it }
        }
        Text(uiText("Published content cannot be edited.", "内容发布后不可编辑。"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
        error?.let { Text(userFacingError(it), color = MaterialTheme.colorScheme.error) }
        val canPublish = !publishing && (!paid || budgetValid) && title.isNotBlank() && problem.isNotBlank() && audience.isNotBlank() && (mode == NeedComposerMode.Wild || solution.isNotBlank())
        Button({
            val request = if (mode == NeedComposerMode.Wild) {
                CreateNeedRequest(title.trim(), problem.trim(), "", audience.trim(), "天马行空", emptyList(), format = "wild")
            } else {
                CreateNeedRequest(title.trim(), problem.trim(), solution.trim(), audience.trim(), category, tags.split(',').map(String::trim).filter(String::isNotEmpty).take(5))
            }
            submit(request.copy(requestType = if (paid) "paid_development" else "free", budgetSkr = if (paid) budget.toIntOrNull() else null))
        }, enabled = canPublish, modifier = Modifier.fillMaxWidth()) { Text(if (publishing) uiText("Reviewing…", "审核中…") else if (mode == NeedComposerMode.Wild) uiText("Release the idea", "放飞构想") else uiText("Publish", "发布")) }
    }
}

@Composable
private fun WorkComposer(categories: List<String>, submission: WorkSubmissionState, close: () -> Unit, submit: (CreateWorkRequest, List<Uri>) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }; var summary by rememberSaveable { mutableStateOf("") }; var description by rememberSaveable { mutableStateOf("") }; var demoUrl by rememberSaveable { mutableStateOf("") }; var category by rememberSaveable { mutableStateOf(categories.firstOrNull() ?: "其他") }; var tags by rememberSaveable { mutableStateOf("") }; var media by rememberSaveable { mutableStateOf(arrayListOf<String>()) }
    var showValidation by rememberSaveable { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6)) { media = ArrayList(it.take(6).map(Uri::toString)) }
    val hasDraft = name.isNotBlank() || summary.isNotBlank() || description.isNotBlank() || demoUrl.isNotBlank() || tags.isNotBlank() || media.isNotEmpty()
    val missing = listOfNotNull(
        uiText("dApp name", "dApp 名称").takeIf { name.isBlank() },
        uiText("one-line introduction", "一句话介绍").takeIf { summary.isBlank() },
        uiText("detailed features", "详细功能").takeIf { description.isBlank() },
        uiText("3-6 images", "3-6 张图片").takeIf { media.size !in 3..6 },
    )
    val submitting = submission.phase == WorkSubmissionPhase.Uploading || submission.phase == WorkSubmissionPhase.Creating
    val succeeded = submission.phase == WorkSubmissionPhase.Success
    ComposerShell(uiText("Submit a work", "提交作品"), hasDraft && !succeeded, close, canClose = !submitting) {
        FormField(uiText("dApp name", "dApp 名称"), name) { name = it }; FormField(uiText("One-line introduction", "一句话介绍"), summary, 2) { summary = it }; FormField(uiText("Detailed features", "详细功能"), description, 6) { description = it }
        FormField(uiText("Demo video URL (optional)", "演示视频链接（可选）"), demoUrl, 2) { demoUrl = it }; CategoryField(categories, category) { category = it }; FormField(uiText("Tags, separated by commas", "标签，用逗号分隔"), tags) { tags = it }
        OutlinedButton(
            { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            enabled = !submitting && !succeeded,
        ) { Text(uiText("Choose images (${media.size}/6, at least 3)", "选择图片（${media.size}/6，至少 3 张）")) }
        Text(uiText("3-6 images required. The first is the icon; the rest are screenshots. Published submissions cannot be edited.", "需要 3-6 张图片。第 1 张作为图标，其余作为展示截图；提交后不可编辑。"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (showValidation && missing.isNotEmpty()) Text(
            uiText("Complete: ", "请补充：") + missing.joinToString(uiText(", ", "、")),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
        WorkSubmissionNotice(submission)
        if (succeeded) {
            Button(close, modifier = Modifier.fillMaxWidth()) { Text(uiText("Done", "完成")) }
        } else {
            Button({
                if (missing.isNotEmpty()) showValidation = true
                else submit(CreateWorkRequest(name.trim(), summary.trim(), description.trim(), category, tags.split(',').map(String::trim).filter(String::isNotEmpty).take(5), "pending", emptyList(), demoUrl.trim().ifBlank { null }), media.map(Uri::parse))
            }, enabled = !submitting, modifier = Modifier.fillMaxWidth()) {
                if (submitting) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (submission.phase == WorkSubmissionPhase.Error) uiText("Retry submission", "重新提交") else uiText("Submit for review", "提交审核"))
            }
        }
    }
}

@Composable
private fun WorkSubmissionNotice(submission: WorkSubmissionState) {
    val text = when (submission.phase) {
        WorkSubmissionPhase.Idle -> return
        WorkSubmissionPhase.Uploading -> uiText(
            "Processing and uploading image ${submission.currentImage} of ${submission.totalImages}...",
            "正在处理并上传第 ${submission.currentImage}/${submission.totalImages} 张图片...",
        )
        WorkSubmissionPhase.Creating -> uiText("Creating the review record...", "正在创建审核记录...")
        WorkSubmissionPhase.Success -> uiText(
            "Submitted for review. You can track it from your profile.",
            "已提交审核，可在个人页面查看进度。",
        )
        WorkSubmissionPhase.Error -> workSubmissionError(submission)
    }
    val isError = submission.phase == WorkSubmissionPhase.Error
    val isSuccess = submission.phase == WorkSubmissionPhase.Success
    Surface(
        color = when {
            isError -> MaterialTheme.colorScheme.errorContainer
            isSuccess -> MaterialTheme.colorScheme.secondaryContainer
            else -> MaterialTheme.colorScheme.surfaceVariant
        },
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            text,
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            color = when {
                isError -> MaterialTheme.colorScheme.onErrorContainer
                isSuccess -> MaterialTheme.colorScheme.onSecondaryContainer
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun workSubmissionError(submission: WorkSubmissionState): String {
    val imagePrefix = submission.currentImage.takeIf { it > 0 }?.let {
        uiText("Image $it failed. ", "第 $it 张图片处理失败。")
    }.orEmpty()
    val detail = when (submission.errorCode) {
        "invalid_image", "invalid_image_signature", "animated_image_not_allowed" -> uiText("Choose a standard JPG, PNG, or WebP image.", "请选择标准 JPG、PNG 或 WebP 图片。")
        "image_read_failed" -> uiText("The selected image can no longer be read. Choose it again.", "已无法读取所选图片，请重新选择。")
        "image_permission_lost" -> uiText("Image access expired. Choose the images again.", "图片访问权限已失效，请重新选择图片。")
        "image_encode_failed" -> uiText("The image could not be prepared for upload.", "图片无法完成上传前处理。")
        "image_memory_failed" -> uiText("This image is too complex to process. Choose a smaller image.", "图片过大或过于复杂，请选择更小的图片。")
        "image_too_large" -> uiText("The image is too large. Choose a smaller image.", "图片过大，请选择更小的图片。")
        "rate_limited" -> uiText("Too many uploads. Wait a moment, then retry.", "上传过于频繁，请稍后重试。")
        "authentication_required", "invalid_session", "session_expired" -> uiText("Your login expired. Sign in again, then retry.", "登录已失效，请重新登录后再试。")
        "network_timeout" -> uiText("The upload timed out. The app retried once; try again on a stable connection.", "上传超时。应用已自动重试一次，请在网络稳定后再试。")
        "network_dns", "network_connect", "network_io" -> uiText("The API connection failed. Turn off the VPN or switch its route, then retry.", "无法连接上传接口，请关闭 VPN 或切换线路后重试。")
        "network_tls" -> uiText("A secure connection could not be established. Check the device date and VPN certificate settings.", "无法建立安全连接，请检查设备时间和 VPN 证书设置。")
        "media_storage_unavailable", "internal_error", "http_500", "http_502", "http_503", "http_504" -> uiText("Media storage is temporarily unavailable. Wait a moment and retry.", "媒体存储暂时不可用，请稍后重试。")
        "work_images_3_to_6_required" -> uiText("Choose 3 to 6 images.", "请选择 3-6 张图片。")
        else -> uiText("Upload failed (${submission.errorCode ?: "unknown"}). Retry; your draft is preserved.", "上传失败（${submission.errorCode ?: "unknown"}）。请重试；草稿已保留。")
    }
    return imagePrefix + detail
}

@Composable
private fun ComposerShell(title: String, hasDraft: Boolean, close: () -> Unit, canClose: Boolean = true, content: @Composable () -> Unit) {
    var confirmDiscard by rememberSaveable { mutableStateOf(false) }
    val requestClose = { if (canClose) { if (hasDraft) confirmDiscard = true else close() } }
    Dialog(
        onDismissRequest = requestClose,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = false, usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    IconButton(requestClose, enabled = canClose) { Icon(Icons.Outlined.Close, uiText("Close", "关闭")) }
                }
                content()
            }
        }
    }
    if (confirmDiscard) AlertDialog(
        onDismissRequest = { confirmDiscard = false },
        title = { Text(uiText("Discard draft?", "放弃草稿？")) },
        text = { Text(uiText("Your entered content will be lost.", "已填写的内容将会丢失。")) },
        confirmButton = { TextButton({ confirmDiscard = false; close() }) { Text(uiText("Discard", "放弃"), color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton({ confirmDiscard = false }) { Text(uiText("Keep editing", "继续编辑")) } },
    )
}
@Composable private fun FormField(label: String, value: String, lines: Int = 1, change: (String) -> Unit) = OutlinedTextField(value, change, Modifier.fillMaxWidth(), label = { Text(label) }, minLines = lines, maxLines = maxOf(lines, 8), shape = RoundedCornerShape(6.dp))

@Composable
private fun CategoryField(categories: List<String>, selected: String, change: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box { OutlinedButton({ expanded = true }, Modifier.fillMaxWidth()) { Text(categoryLabel(selected), Modifier.weight(1f)); Icon(Icons.Outlined.ChevronRight, null) }; DropdownMenu(expanded, { expanded = false }) { categories.forEach { DropdownMenuItem({ Text(categoryLabel(it)) }, { change(it); expanded = false }) } } }
}

@Composable private fun MetaRow(author: String, category: String, openProfile: (() -> Unit)? = null) = Row(verticalAlignment = Alignment.CenterVertically) { Text(author, Modifier.weight(1f).clickable(enabled = openProfile != null) { openProfile?.invoke() }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary); Text(categoryLabel(category), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable private fun TagRow(tags: List<String>) { if (tags.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(tags) { AssistChip({}, { Text(it) }) } } }
@Composable private fun Stat(icon: androidx.compose.ui.graphics.vector.ImageVector, value: Int) = Row(verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(value.toString(), style = MaterialTheme.typography.labelMedium) }
@Composable private fun SectionTitle(text: String, modifier: Modifier = Modifier) = Text(text, modifier, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
@Composable private fun EmptyState(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, modifier: Modifier = Modifier) = Column(modifier.fillMaxWidth().padding(vertical = 56.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) { Icon(icon, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.outline); Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable internal fun uiText(english: String, chinese: String): String = if (LocalAppLanguage.current == "zh") chinese else english
@Composable internal fun userFacingError(code: String): String = when (code) {
    "receipt_storage_unavailable" -> uiText("Unable to save the payment receipt. No wallet request was made.", "无法保存交易记录，尚未打开钱包付款。")
    "donations_disabled" -> uiText("Tipping has not opened yet.", "打赏尚未开放。")
    "donation_rpc_unavailable", "donation_wrong_network" -> uiText("The payment network is unavailable. No new payment was requested.", "支付网络暂不可用，尚未发起新的付款。")
    "donation_simulation_failed" -> uiText("The wallet cannot complete this tip. Check your SKR and SOL balances.", "当前钱包无法完成这笔打赏，请检查 SKR 和 SOL 余额。")
    "donation_quote_expired" -> uiText("This estimate expired. Refresh it before approving.", "估算已过期，请重新获取后确认。")
    "donation_wallet_mismatch" -> uiText("Use the same wallet as your LionDApp sign-in.", "请使用登录 LionDApp 的同一个钱包。")
    "invalid_donation_transaction", "donation_transaction_mismatch" -> uiText("The transaction does not match the reviewed tip. It has been blocked.", "交易与确认页不一致，已拦截。")
    "donation_status_unknown" -> uiText("Check your wallet history before trying again; the transfer may have been sent.", "请先检查钱包记录，转账可能已经发出，勿直接重复付款。")
    "cannot_tip_self" -> uiText("The project wallet cannot tip itself.", "项目收款钱包不能向自己打赏。")
    "rate_limited" -> uiText("Too many requests. Please wait a minute and retry.", "操作较频繁，请一分钟后重试。")
    "conversation_unavailable" -> uiText("Messaging is unavailable because contact is blocked or the account is inactive.", "任一方已屏蔽或对方账户不可用，暂时无法联系。")
    "conversation_not_found" -> uiText("This conversation is unavailable.", "无法访问此对话。")
    "invalid_budget_skr" -> uiText("Enter a whole SKR budget between 1 and 1,000,000,000.", "请输入 1 至 1,000,000,000 的整数 SKR 预算。")
    "moderation_unavailable" -> uiText("Content review is temporarily unavailable. Your text has not been published. Please retry.", "内容审核暂时不可用，文字尚未发布，请稍后重试。")
        "content_not_allowed" -> uiText("This content cannot be published. Please revise it to follow the Community Rules.", "该内容无法发布，请修改后遵守社区规则。")
    "work_images_3_to_6_required" -> uiText("Choose 3-6 images for this work.", "请为作品选择 3-6 张图片。")
    else -> code
}
@Composable private fun categoryLabel(value: String): String {
    val english = mapOf("天马行空" to "Wild Ideas", "支付" to "Payments", "游戏" to "Games", "社交" to "Social", "效率工具" to "Productivity", "开发者工具" to "Developer tools", "教育" to "Education", "其他" to "Other")
    return if (LocalAppLanguage.current == "zh") value else english[value] ?: value
}
