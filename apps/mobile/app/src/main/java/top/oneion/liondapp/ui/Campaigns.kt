package top.oneion.liondapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import top.oneion.liondapp.LionUiState
import top.oneion.liondapp.LionViewModel
import top.oneion.liondapp.model.*

internal fun skrUnits(value: String): String = runCatching { BigDecimal(value).movePointLeft(6).stripTrailingZeros().toPlainString() }.getOrDefault("?")
internal fun testingCharacterCount(value: String): Int = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFC).codePoints().filter { !Character.isWhitespace(it) && !Character.isSpaceChar(it) && Character.getType(it) != Character.FORMAT.toInt() && Character.getType(it) != Character.CONTROL.toInt() }.count().toInt()
@Composable internal fun testingTime(value: String): String {
    val locale=if(LocalAppLanguage.current=="zh")java.util.Locale.SIMPLIFIED_CHINESE else java.util.Locale.ENGLISH
    return runCatching { DateTimeFormatter.ofPattern("MMM d, HH:mm",locale).withZone(ZoneId.systemDefault()).format(Instant.parse(value)) }.getOrDefault(value)
}
internal fun reviewOverdue(entry: TestingEntry): Boolean = entry.status == "submitted" && entry.submittedAt?.let { runCatching { !Instant.parse(it).plusSeconds(72*3600).isAfter(Instant.now()) }.getOrDefault(false) } == true

@Composable
internal fun entryStatus(status: String, simulation: Boolean): String = when (status) {
    "reserved" -> uiText("Ready to test", "待测试")
    "submitted" -> uiText("Awaiting review", "等待验收")
    "changes_requested" -> uiText("More detail requested", "需补充成果")
    "approved" -> uiText("Approved · reward pending", "验收通过 · 待结算")
    "paid" -> if (simulation) uiText("Test settlement complete", "模拟结算完成") else uiText("Completed", "已完成")
    "rejected" -> uiText("Not approved", "未通过验收")
    "disputed" -> uiText("In platform review", "平台复核中")
    "expired" -> uiText("Reservation expired", "报名已超时")
    else -> uiText("Withdrawn", "已退出")
}

@Composable
internal fun CampaignsScreen(state: LionUiState, modifier: Modifier, viewModel: LionViewModel, signIn: () -> Unit, create: () -> Unit, open: (String) -> Unit) {
    val scope = state.campaignsScope
    val scopes = listOf("open" to uiText("Available", "可参加"), "joined" to uiText("Joined", "我参加的"), "mine" to uiText("Hosted", "我发起的"))
    LaunchedEffect(state.skrDomain) { viewModel.loadCampaigns(if(state.skrDomain == null) "open" else scope) }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(uiText("dApp testing", "dApp 测试活动"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                }
                IconButton(create) { Icon(Icons.Outlined.Add, uiText("Create testing campaign", "发起测试活动")) }
                IconButton({viewModel.loadCampaigns(scope)},enabled=!state.campaignsLoading) { Icon(Icons.Outlined.Refresh,uiText("Refresh campaigns", "刷新活动")) }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(scopes) { (value,label) -> FilterChip(scope == value,{ if (value != "open" && state.skrDomain == null) signIn() else viewModel.loadCampaigns(value) },{Text(label)}) } }
        }
        state.campaignError?.let { error -> item { Text(userFacingError(error), color = MaterialTheme.colorScheme.error); TextButton({viewModel.loadCampaigns(scope)}) { Text(uiText("Retry", "重试")) } } }
        if (state.campaignsLoading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (!state.campaignsLoading && state.campaignError == null && state.campaigns.isEmpty()) item {
            Column(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Outlined.Science, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(uiText("No testing campaigns yet", "暂无测试活动"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(create) { Icon(Icons.Outlined.Add,null,Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(uiText("Invite testers", "邀请测试")) }
            }
        }
        items(state.campaigns, key = { it.id }) { item ->
            Card(onClick = {open(item.id)}, shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (item.appIcon != null) AsyncImage(item.appIcon,item.appName,Modifier.size(40.dp).clip(RoundedCornerShape(8.dp))) else Icon(Icons.Outlined.Apps,null,Modifier.size(40.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) { Text(item.appName,style = MaterialTheme.typography.labelLarge); Text(item.creatorSkr,style = MaterialTheme.typography.labelSmall,color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Icon(Icons.Outlined.ChevronRight,null)
                    }
                    Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(item.description, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(if (item.rewardUnits == "0") uiText("Free testing", "免费测试邀请") else "${skrUnits(item.rewardUnits)} SKR", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
                            if(item.rewardUnits!="0")Text(uiText("Per approved tester", "每位验收通过的测试者"),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(Modifier.weight(1f),horizontalAlignment=Alignment.End) {
                            Text(uiText("${item.remaining} / ${item.capacity} spots", "剩余 ${item.remaining} / ${item.capacity} 名额"),style = MaterialTheme.typography.labelMedium)
                            Text(testingTime(item.deadline),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (item.fundingState == "unfunded") Text(uiText("Draft · funding required", "草稿 · 待预存奖励"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                    if (item.fundingState == "simulated") Text(uiText("Simulation · no real SKR", "模拟活动 · 无真实 SKR"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                    if (item.status in listOf("closed","completed","cancelled")) Text(when(item.status) {"closed"->uiText("Recruitment closed", "招募已结束");"completed"->uiText("Campaign completed", "活动已完成");else->uiText("Cancelled", "已取消")},style=MaterialTheme.typography.labelMedium)
                    item.ownEntry?.let { entry -> Text(entryStatus(entry.status,item.fundingState == "simulated"),style = MaterialTheme.typography.labelMedium) }
                }
            }
        }
        if(state.campaignsCursor != null) item { OutlinedButton({ viewModel.loadCampaigns(scope, more = true) }, Modifier.fillMaxWidth(), enabled = !state.campaignsLoading) { Text(uiText("Load more campaigns", "加载更多活动")) } }

    }
}

@Composable
internal fun CampaignComposer(state: LionUiState, viewModel: LionViewModel, close: () -> Unit, signIn: () -> Unit, editing: TestingCampaign? = null) {
    var app by rememberSaveable(stateSaver = jsonStateSaver<StoreAppItem?>()) { mutableStateOf<StoreAppItem?>(editing?.let { StoreAppItem(it.storePackage,it.appName,storeUrl="solanadappstore://details?id=${it.storePackage}") }) }
    var picker by rememberSaveable { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf(editing?.title.orEmpty()) }
    var description by rememberSaveable { mutableStateOf(editing?.description.orEmpty()) }
    var version by rememberSaveable { mutableStateOf(editing?.appVersion.orEmpty()) }
    var requirements by rememberSaveable { mutableStateOf(editing?.requirements.orEmpty()) }
    var paid by rememberSaveable { mutableStateOf(true) }
    var capacity by rememberSaveable { mutableStateOf(editing?.capacity?.toString() ?: "100") }
    var reward by rememberSaveable { mutableStateOf(editing?.rewardUnits?.let(::skrUnits) ?: "10") }
    var minimum by rememberSaveable { mutableStateOf(editing?.minCharacters?.toString() ?: "100") }
    var hours by rememberSaveable { mutableStateOf(editing?.reservationHours?.toString() ?: "24") }
    var days by rememberSaveable { mutableStateOf("7") }
    val rewardAmount = if (paid) reward.toBigDecimalOrNull() else BigDecimal.ZERO
    val count = capacity.toIntOrNull()
    val amountValid = !paid || reward.matches(Regex("(0|[1-9][0-9]{0,5})(\\.[0-9]{1,6})?")) && rewardAmount?.let { it > BigDecimal.ZERO && it <= BigDecimal("100000") } == true
    val valid = app != null && title.isNotBlank() && description.isNotBlank() && version.isNotBlank() && requirements.isNotBlank() && count != null && count in 1..1000 && minimum.toIntOrNull()?.let {it in 20..2000} == true && hours.toIntOrNull()?.let {it in 1..72} == true && days.toIntOrNull()?.let {it in 1..30} == true && amountValid
    ComposerShell(if(editing==null)uiText("Invite dApp testers", "发起 dApp 测试") else uiText("Edit reward draft", "编辑悬赏草稿"),title.isNotBlank() || description.isNotBlank() || app != null,close,!state.campaignBusy) {
        FormSectionHeading(uiText("App & test", "应用与测试介绍"))
        OutlinedButton({picker=true},Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Apps,null); Spacer(Modifier.width(8.dp)); Text(app?.displayName ?: uiText("Choose a Store dApp", "选择商店 dApp")) }
        FormField(uiText("Campaign title", "活动标题"),title) {title=it.take(120)}
        FormField(uiText("About this test", "测试介绍"),description,3) {description=it.take(5000)}
        FormField(uiText("App version", "应用版本"),version) {version=it.take(80)}
        FormSectionHeading(uiText("Acceptance criteria", "验收标准"))
        FormField(uiText("Testing steps and acceptance criteria", "测试步骤与验收标准"),requirements,4) {requirements=it.take(3000)}
        FormSectionHeading(uiText("Participation & rewards", "参与名额与奖励"))
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(paid,{paid=it},enabled=editing==null); Text(uiText("Reward testers with SKR", "提供 SKR 测试奖励")) }
        CampaignNumberField(uiText("Maximum testers", "人数上限"),capacity) {capacity=it.filter(Char::isDigit).take(4)}
        if (paid) CampaignNumberField(uiText("Net reward per tester · SKR", "每人到手奖励 · SKR"),reward,true) {reward=it.take(14)}
        CampaignNumberField(uiText("Minimum non-space characters", "最低有效字符数（不含空白）"),minimum) {minimum=it.filter(Char::isDigit).take(4)}
        CampaignNumberField(uiText("Submission window · hours", "报名后提交时限 · 小时"),hours) {hours=it.filter(Char::isDigit).take(2)}
        CampaignNumberField(if(editing==null)uiText("Campaign duration · days", "活动有效期 · 天") else uiText("Renew duration from now · days", "从现在起重新设置有效期 · 天"),days) {days=it.filter(Char::isDigit).take(2)}
        if (paid && rewardAmount != null && count != null && amountValid) {
            val perFee = rewardAmount.movePointRight(6).add(BigDecimal(9)).divideToIntegralValue(BigDecimal.TEN).movePointLeft(6)
            val pool = rewardAmount.multiply(BigDecimal(count))
            val fee = perFee.multiply(BigDecimal(count))
            FormSectionHeading(uiText("Funding summary", "预存费用明细"))
            CampaignAmountRow(uiText("Reward pool", "奖励池"),pool.stripTrailingZeros().toPlainString())
            CampaignAmountRow(uiText("Platform fee · 10%", "平台手续费 · 10%"),fee.stripTrailingZeros().toPlainString())
            CampaignAmountRow(uiText("Required deposit", "需预存"),pool.add(fee).stripTrailingZeros().toPlainString())
            if (state.campaignConfig.paymentMode == "disabled") Text(uiText("Funding is not available yet", "奖励预存暂未开放"),style = MaterialTheme.typography.bodySmall,color = MaterialTheme.colorScheme.tertiary)
        }
        state.campaignError?.let {Text(userFacingError(it),color = MaterialTheme.colorScheme.error)}
        Button({
            if (state.skrDomain == null) signIn()
            else if (valid) {
                val request = CreateCampaignRequest(title.trim(),description.trim(),version.trim(),requirements.trim(),app!!.androidPackage,minimum.toInt(),capacity.toInt(),hours.toInt(),if(paid)reward else "0",Instant.now().plusSeconds(days.toLong()*86400).toString(),editing?.revision)
                if(editing==null)viewModel.createCampaign(request){if(it)close()} else viewModel.updateCampaign(editing.id,request){if(it)close()}
            }
        },Modifier.fillMaxWidth(),enabled=valid && !state.campaignBusy) {Text(if(state.skrDomain==null)uiText("Sign in", "登录") else if(editing!=null)uiText("Save changes", "保存修改") else if(paid)uiText("Save reward campaign", "保存悬赏草稿") else uiText("Publish invitation", "发布测试邀请"))}
    }
    if(picker)CatalogPicker(state,viewModel,{picker=false}){app=it;picker=false}
}

@Composable private fun CampaignNumberField(label: String,value: String,decimal: Boolean=false,change: (String)->Unit) {
    OutlinedTextField(value,change,Modifier.fillMaxWidth(),label={Text(label)},singleLine=true,shape=RoundedCornerShape(14.dp),keyboardOptions=KeyboardOptions(keyboardType=if(decimal)KeyboardType.Decimal else KeyboardType.Number))
}

@Composable private fun CampaignAmountRow(label: String, amount: String) = Row(Modifier.fillMaxWidth().heightIn(min=44.dp).padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
    Text(label,Modifier.weight(1f),style = MaterialTheme.typography.bodyMedium)
    Text("$amount SKR",Modifier.weight(1f),fontWeight = FontWeight.SemiBold,textAlign=androidx.compose.ui.text.style.TextAlign.End)
}

@Composable private fun CampaignSection(title: String) {
    Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
        HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
        }
    }
}

@Composable private fun CampaignEvidence(url: String,app: Boolean=false) {
    val handler=LocalUriHandler.current
    val context=LocalContext.current
    val unavailable=uiText("No app is available to open this link.", "没有可打开此链接的应用。")
    TextButton({runCatching {handler.openUri(url)}.onFailure {android.widget.Toast.makeText(context,unavailable,android.widget.Toast.LENGTH_SHORT).show()}}) {
        Icon(if(app)Icons.Outlined.Apps else Icons.Outlined.Link,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text(if(app)uiText("Open in dApp Store", "在 dApp 商店打开") else uiText("View evidence", "查看证明"))
    }
}

@Composable
internal fun CampaignDetail(id: String, state: LionUiState, viewModel: LionViewModel, close: () -> Unit, signIn: () -> Unit, discussion: (String) -> Unit) {
    var editDraft by rememberSaveable(id) { mutableStateOf(false) }
    LaunchedEffect(id,state.skrDomain) {viewModel.loadCampaign(id)}
    var report by rememberSaveable {mutableStateOf(false)}
    var review by rememberSaveable(stateSaver=jsonStateSaver<TestingEntry?>()) {mutableStateOf<TestingEntry?>(null)}
    var appeal by rememberSaveable {mutableStateOf(false)}
    var confirmClose by rememberSaveable {mutableStateOf(false)}
    var entryFilter by rememberSaveable(id) {mutableStateOf("all")}
    val current=state.campaign?.takeIf {it.id==id}
    Dialog(close,properties=DialogProperties(usePlatformDefaultWidth=false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    IconButton(close){Icon(Icons.AutoMirrored.Outlined.ArrowBack,uiText("Back", "返回"))}
                    Text(uiText("Testing campaign", "测试活动"),Modifier.weight(1f),style=MaterialTheme.typography.titleMedium)
                    IconButton({viewModel.loadCampaign(id)},enabled=!state.campaignBusy){Icon(Icons.Outlined.Refresh,uiText("Refresh campaign", "刷新活动"))}
                }
                LazyColumn(Modifier.weight(1f).testTag("campaign_detail_list"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                    state.campaignError?.let {error -> item {Text(userFacingError(error),color=MaterialTheme.colorScheme.error)}}
                    val item=state.campaign?.takeIf {it.id==id}
                    if(item==null) {item {if(state.campaignError==null)CircularProgressIndicator() else TextButton({viewModel.loadCampaign(id)}){Text(uiText("Retry", "重试"))}}}
                    else {
                        val owner=item.creatorSkr==state.skrDomain
                        val simulation=item.fundingState=="simulated"
                        item {
                            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                                if(item.appIcon!=null)AsyncImage(item.appIcon,item.appName,Modifier.size(48.dp).clip(RoundedCornerShape(8.dp))) else Icon(Icons.Outlined.Apps,null,Modifier.size(48.dp))
                                Column(Modifier.weight(1f)) {Text(item.appName,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold);Text(item.creatorSkr,style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                            }
                            Spacer(Modifier.height(16.dp))
                            Text(item.title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
                            Text(uiText("Version ${item.appVersion}", "版本 ${item.appVersion}"),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            if(item.status!="open")Text(when(item.status){"awaiting_funding"->uiText("Draft · funding required", "草稿 · 待预存奖励");"closed"->uiText("Recruitment closed", "招募已结束");"completed"->uiText("Campaign completed", "活动已完成");else->uiText("Cancelled", "已取消")},style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.tertiary)
                        }
                        item { CampaignSection(uiText("About this test", "测试介绍")); Spacer(Modifier.height(12.dp)); PostBody(item.description) }
                        item {
                            CampaignSection(uiText("Test requirements", "测试要求"))
                            Spacer(Modifier.height(12.dp))
                            Text(item.requirements,style=MaterialTheme.typography.bodyLarge)
                            Spacer(Modifier.height(12.dp))
                            Surface(shape=RoundedCornerShape(16.dp),color=MaterialTheme.colorScheme.surfaceVariant) { Column(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=4.dp)) {
                                DetailInfoRow(uiText("Minimum report", "最低成果字数"),uiText("${item.minCharacters}+ non-space characters", "${item.minCharacters} 个有效字符以上"))
                                HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
                                DetailInfoRow(uiText("Submission window", "报名后提交时限"),uiText("${item.reservationHours} hours", "${item.reservationHours} 小时"))
                                HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
                                DetailInfoRow(uiText("Recruitment ends", "招募截止"),testingTime(item.deadline))
                            } }
                            Spacer(Modifier.height(12.dp))
                            Text(uiText("Review within 72h · one revision · 72h to appeal", "72 小时内验收 · 可补充一次 · 72 小时内申诉"),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            CampaignEvidence("solanadappstore://details?id=${item.storePackage}",true)
                        }
                        item {
                            CampaignSection(uiText("Rewards & spots", "奖励与名额"))
                            Spacer(Modifier.height(12.dp))
                            Text(if(item.rewardUnits=="0")uiText("Free testing invitation", "免费测试邀请") else "${skrUnits(item.rewardUnits)} SKR",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.secondary)
                            if(item.rewardUnits!="0")Text(uiText("Net reward after approval", "验收通过后到手奖励"),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(12.dp))
                            Text(uiText("${item.remaining} of ${item.capacity} spots available", "剩余 ${item.remaining} / ${item.capacity} 名额"),style=MaterialTheme.typography.bodyMedium)
                            LinearProgressIndicator(progress={item.occupied.toFloat()/item.capacity.coerceAtLeast(1)},modifier=Modifier.fillMaxWidth().padding(vertical=8.dp))
                            if(simulation)Text(uiText("Simulation · no real SKR", "模拟活动 · 无真实 SKR"),color=MaterialTheme.colorScheme.tertiary)
                        }
                        if(owner) {
                            item {
                                CampaignSection(uiText("Host overview", "发起者管理"))
                                Spacer(Modifier.height(12.dp))
                                if(item.fundingState=="unfunded") {
                                    if(item.status=="awaiting_funding")OutlinedButton({editDraft=true},Modifier.fillMaxWidth(),enabled=!state.campaignBusy){Icon(Icons.Outlined.Edit,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text(uiText("Edit reward draft", "编辑悬赏草稿"))}
                                    CampaignAmountRow(uiText("Reward pool", "奖励池"),skrUnits(item.rewardPoolUnits))
                                    CampaignAmountRow(uiText("Maximum platform fee · 10%", "最高平台费 · 10%"),skrUnits(java.math.BigInteger(item.feeUnits).multiply(java.math.BigInteger.valueOf(item.capacity.toLong())).toString()))
                                    CampaignAmountRow(uiText("Required deposit", "需预存奖励与费用"),skrUnits(item.totalUnits))
                                    Button({viewModel.campaignAction(id,"simulate-fund")},Modifier.fillMaxWidth(),enabled=state.campaignConfig.paymentMode=="simulation" && !state.campaignBusy && item.status=="awaiting_funding" && runCatching {Instant.parse(item.deadline).isAfter(Instant.now())}.getOrDefault(false)) {Text(if(state.campaignConfig.paymentMode=="simulation")uiText("Simulate deposit", "模拟预存") else uiText("Funding unavailable", "预存暂未开放"))}
                                }
                                else if(item.rewardUnits!="0") {
                                    CampaignAmountRow(uiText("Deposit", "预存总额"),skrUnits(item.totalUnits))
                                    CampaignAmountRow(uiText("Reserved for unsettled results", "未结案成果保留额度"),skrUnits(item.lockedUnits))
                                    CampaignAmountRow(uiText("Fees on settled rewards", "已结算奖励手续费"),skrUnits(item.feePaidUnits))
                                    CampaignAmountRow(uiText("Unallocated balance", "未分配余额"),skrUnits(item.refundableUnits))
                                    if(item.status=="completed")CampaignAmountRow(uiText("Refunded", "已退还"),skrUnits(item.refundedUnits))
                                }
                                if(item.status=="open" || item.status=="awaiting_funding")OutlinedButton({confirmClose=true},Modifier.fillMaxWidth(),enabled=!state.campaignBusy){Text(uiText("Stop recruitment", "停止招募"))}
                                if(item.status=="closed" && simulation)OutlinedButton({viewModel.campaignAction(id,"simulate-refund")},Modifier.fillMaxWidth(),enabled=!state.campaignBusy && item.lockedUnits=="0"){Text(uiText("Simulate remaining balance refund", "模拟退还剩余额度"))}
                                if(item.status=="closed" && item.fundingState=="free")OutlinedButton({viewModel.campaignAction(id,"complete")},Modifier.fillMaxWidth(),enabled=!state.campaignBusy){Text(uiText("Finish campaign", "结束活动"))}
                                Row(Modifier.fillMaxWidth()) { DetailMetric(uiText("APPROVED", "已通过"),item.approved.toString(),modifier=Modifier.weight(1f)); DetailMetric(uiText("COMPLETED", "已完成"),item.paid.toString(),modifier=Modifier.weight(1f)); DetailMetric(uiText("PENDING", "待处理"),item.pending.toString(),modifier=Modifier.weight(1f)) }
                            }
                            item {
                                CampaignSection(uiText("Testing results", "测试成果"))
                                Spacer(Modifier.height(8.dp))
                                ChoiceMenu(entryFilter,listOf("all" to uiText("All testers", "全部测试者"),"submitted" to uiText("Awaiting review", "待验收"),"approved" to uiText("Ready to settle", "待结算"),"disputed" to uiText("In platform review", "平台复核中"))){entryFilter=it}
                                if(state.campaignEntries.isEmpty())Text(uiText("No testers have joined yet", "还没有测试者报名"),Modifier.padding(vertical=16.dp),color=MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            items(state.campaignEntries.filter {entryFilter=="all" || it.status==entryFilter},key={it.id}) {entry ->
                                Card(shape=RoundedCornerShape(16.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.surfaceVariant)) {Column(Modifier.fillMaxWidth().padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                                    Text(entry.testerSkr,fontWeight=FontWeight.SemiBold);Text(entryStatus(entry.status,simulation),style=MaterialTheme.typography.labelMedium)
                                    if(entry.body.isNotBlank())ExpandableDescription(entry.body)
                                    if(entry.evidenceUrl.isNotBlank())CampaignEvidence(entry.evidenceUrl)
                                    if(entry.reviewReason.isNotBlank())Text(entry.reviewReason,style=MaterialTheme.typography.bodySmall)
                                    if(entry.resolutionReason.isNotBlank())Text(entry.resolutionReason,style=MaterialTheme.typography.bodySmall)
                                    if(entry.status=="submitted" && !reviewOverdue(entry))TextButton({review=entry},enabled=!state.campaignBusy){Text(uiText("Review result", "验收成果"))}
                                    if(reviewOverdue(entry))Text(uiText("Review overdue · queued for platform review", "验收超时 · 已进入平台复核队列"),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.tertiary)
                                    if(entry.status=="approved" && simulation)TextButton({viewModel.testingEntryAction(id,entry,"simulate-settle")},enabled=!state.campaignBusy){Text(uiText("Simulate settlement", "模拟结算"))}
                                }}
                            }
                        } else {
                            val entry=item.ownEntry
                            item {
                                if(entry!=null) {
                                    CampaignSection(uiText("My testing result", "我的测试成果"))
                                    Spacer(Modifier.height(12.dp))
                                    Text(entryStatus(entry.status,simulation),fontWeight=FontWeight.SemiBold)
                                    if(entry.status in listOf("reserved","changes_requested"))Text(uiText("Submit by ${testingTime(entry.submitBy)}", "请于 ${testingTime(entry.submitBy)} 前提交"),style=MaterialTheme.typography.labelMedium)
                                    if(entry.reviewReason.isNotBlank())Text(entry.reviewReason,style=MaterialTheme.typography.bodyMedium)
                                    if(entry.resolutionReason.isNotBlank())Text(entry.resolutionReason,style=MaterialTheme.typography.bodyMedium)
                                    if(entry.status in listOf("reserved","changes_requested")) {
                                        TextButton({viewModel.testingEntryAction(id,entry,"withdraw")},enabled=!state.campaignBusy){Text(uiText("Withdraw", "退出报名"))}
                                    }
                                    if(entry.status=="rejected" && entry.appealBy?.let {runCatching {Instant.parse(it).isAfter(Instant.now())}.getOrDefault(false)}==true || reviewOverdue(entry))TextButton({appeal=true},enabled=!state.campaignBusy){Text(uiText("Request platform review", "申请平台复核"))}
                                    if(entry.body.isNotBlank())ExpandableDescription(entry.body)
                                    if(entry.evidenceUrl.isNotBlank())CampaignEvidence(entry.evidenceUrl)
                                }
                            }
                        }
                        item {item.postId?.let {post -> OutlinedButton({discussion(post)},Modifier.fillMaxWidth()){Icon(Icons.Outlined.ChatBubbleOutline,null);Spacer(Modifier.width(8.dp));Text(uiText("Community discussion", "查看社区讨论"))}}}
                    }
                }
                if(current!=null && current.creatorSkr!=state.skrDomain) {
                    val own=current.ownEntry
                    val submit=own?.status in listOf("reserved","changes_requested")
                    if(own==null || submit) {
                        HorizontalDivider()
                        Button({if(state.skrDomain==null)signIn() else if(submit)report=true else viewModel.campaignAction(id,"join")},Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=12.dp).testTag("campaign_primary_action"),enabled=!state.campaignBusy && (submit || current.status=="open" && current.fundingState!="unfunded" && current.remaining>0 && runCatching {Instant.parse(current.deadline).isAfter(Instant.now())}.getOrDefault(false))) {
                            Icon(if(submit)Icons.AutoMirrored.Outlined.Assignment else Icons.Outlined.Science,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp))
                            Text(if(state.skrDomain==null)uiText("Sign in to join", "登录后报名") else if(submit)uiText("Submit testing result", "提交测试成果") else uiText("Join this test", "报名测试"))
                        }
                    }
                }
            }
        }
    }
    val campaign=state.campaign?.takeIf {it.id==id}
    if(editDraft && campaign?.fundingState=="unfunded" && campaign.status=="awaiting_funding") CampaignComposer(state,viewModel,{editDraft=false},signIn,campaign)
    if(report && campaign?.ownEntry!=null) TestingReportComposer(campaign,state,viewModel){report=false}
    review?.let {entry -> if(campaign!=null)TestingReviewDialog(campaign,entry,state,{review=null}) {decision,reason -> viewModel.reviewTestingReport(id,entry,decision,reason){if(it)review=null}}}
    if(confirmClose)AlertDialog({confirmClose=false},title={Text(uiText("Stop recruitment?", "停止招募？"))},text={Text(uiText("Existing testers can still submit their results. Their reserved rewards stay protected until review and settlement are complete.", "已报名者仍可提交成果，保留奖励在验收与结算完成前不会退还。"))},confirmButton={TextButton({confirmClose=false;viewModel.campaignAction(id,"close")}){Text(uiText("Stop recruitment", "停止招募"))}},dismissButton={TextButton({confirmClose=false}){Text(uiText("Cancel", "取消"))}})
    if(appeal && campaign?.ownEntry!=null) {
        var reason by rememberSaveable {mutableStateOf("")}
        AlertDialog({if(!state.campaignBusy)appeal=false},title={Text(uiText("Platform review", "申请平台复核"))},text={Column {FormField(uiText("Reason", "申诉理由"),reason,4){reason=it.take(1000)};state.campaignError?.let {Text(userFacingError(it),color=MaterialTheme.colorScheme.error)}}},confirmButton={TextButton({viewModel.testingEntryAction(id,campaign.ownEntry,"appeal",reason){if(it)appeal=false}},enabled=reason.isNotBlank() && !state.campaignBusy){Text(uiText("Submit", "提交"))}},dismissButton={TextButton({appeal=false},enabled=!state.campaignBusy){Text(uiText("Cancel", "取消"))}})
    }
}

@Composable
private fun TestingReportComposer(campaign: TestingCampaign, state: LionUiState, viewModel: LionViewModel, close: () -> Unit) {
    val entry=campaign.ownEntry ?: return
    var body by rememberSaveable(entry.id) {mutableStateOf(entry.body)}
    var evidence by rememberSaveable(entry.id) {mutableStateOf(entry.evidenceUrl)}
    ComposerShell(uiText("Testing result", "测试成果"),body.isNotBlank(),close,!state.campaignBusy) {
        Text(campaign.appName,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
        FormSectionHeading(uiText("Published criteria", "公开验收标准"))
        Text(campaign.requirements,style=MaterialTheme.typography.bodyLarge)
        FormSectionHeading(uiText("Your testing result", "你的测试成果"))
        FormField(uiText("What you tested and what happened", "测试内容与实际结果"),body,6){body=it.take(5000)}
        Text("${testingCharacterCount(body)} / ${campaign.minCharacters}",style=MaterialTheme.typography.labelMedium,color=if(testingCharacterCount(body)>=campaign.minCharacters)MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant)
        FormField(uiText("Evidence link · optional", "证明链接 · 可选"),evidence){evidence=it.take(1000)}
        state.campaignError?.let {Text(userFacingError(it),color=MaterialTheme.colorScheme.error)}
        Button({viewModel.submitTestingReport(campaign.id,entry,body.trim(),evidence.trim()){if(it)close()}},Modifier.fillMaxWidth(),enabled=testingCharacterCount(body)>=campaign.minCharacters && !state.campaignBusy){Text(uiText("Submit for review", "提交验收"))}
    }
}

@Composable
private fun TestingReviewDialog(campaign: TestingCampaign,entry: TestingEntry,state: LionUiState,close: () -> Unit,submit: (String,String) -> Unit) {
    var decision by rememberSaveable(entry.id){mutableStateOf("approve")}
    var reason by rememberSaveable(entry.id){mutableStateOf("")}
    ComposerShell(uiText("Review testing result", "验收测试成果"),reason.isNotBlank(),close,!state.campaignBusy) {
        Text(campaign.appName,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
        FormSectionHeading(uiText("Published criteria", "公开验收标准"))
        Text(campaign.requirements,style=MaterialTheme.typography.bodyLarge)
        FormSectionHeading(uiText("Tester report", "测试者成果"))
        Text(entry.testerSkr,style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
        PostBody(entry.body)
        if(entry.evidenceUrl.isNotBlank())CampaignEvidence(entry.evidenceUrl)
        val choices=listOf("approve" to uiText("Approve", "通过"),"changes" to uiText("Request more detail", "退回补充"),"reject" to uiText("Reject with reason", "拒绝并说明理由")).filter {it.first!="changes" || entry.correctionCount==0}
        FormSectionHeading(uiText("Review decision", "验收结论"))
        ChoiceMenu(decision,choices){decision=it}
        if(decision!="approve")FormField(uiText("Reason against the published criteria", "依据公开验收标准说明理由"),reason,4){reason=it.take(1000)}
        state.campaignError?.let {Text(userFacingError(it),color=MaterialTheme.colorScheme.error)}
        Button({submit(decision,reason.trim())},Modifier.fillMaxWidth(),enabled=!state.campaignBusy && (decision=="approve" || reason.isNotBlank())){Text(uiText("Confirm review", "确认验收"))}
    }
}
