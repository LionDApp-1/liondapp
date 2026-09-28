package top.oneion.liondapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import top.oneion.liondapp.LionUiState
import top.oneion.liondapp.LionViewModel
import top.oneion.liondapp.wallet.TIP_MINT
import top.oneion.liondapp.wallet.TIP_RECEIVER
import top.oneion.liondapp.wallet.parseTipAmount
import top.oneion.liondapp.wallet.allowsTips
import java.math.BigDecimal

@Composable
internal fun DonationDialog(state: LionUiState, viewModel: LionViewModel, sender: ActivityResultSender, close: () -> Unit) {
    LaunchedEffect(Unit) { viewModel.loadDonation() }
    DonationContent(state, top.oneion.liondapp.BuildConfig.DONATIONS_ENABLED,
        viewModel::prepareDonation, { viewModel.sendDonation(sender) },
        viewModel::resetDonationReceipt, viewModel::checkDonation, close)
}

/** UI-only callbacks keep review/consent tests separate from wallet authorization. */
@Composable
internal fun DonationContent(
    state: LionUiState,
    tipsAllowedInBuild: Boolean,
    prepare: (Int) -> Unit,
    send: () -> Unit,
    resetReceipt: () -> Unit,
    checkReceipt: () -> Unit,
    close: () -> Unit,
) {
    var amount by rememberSaveable { mutableStateOf("") }
    var understood by rememberSaveable(state.donationQuote?.quoteId) { mutableStateOf(false) }
    var clock by remember { mutableStateOf(java.time.Instant.now()) }
    LaunchedEffect(state.donationQuote?.quoteId) { while (state.donationQuote != null) { clock = java.time.Instant.now(); kotlinx.coroutines.delay(1000) } }
    var clearReceipt by remember { mutableStateOf(false) }
    val parsedAmount = parseTipAmount(amount)
    val invalidAmount = amount.isNotBlank() && parsedAmount == null
    Dialog(onDismissRequest = { if (!state.donationBusy) close() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.systemBarsPadding().imePadding().padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                TextButton(close, enabled = !state.donationBusy) { Text(uiText("Back", "返回")) }
                Text(uiText("Support LionDApp", "支持 LionDApp"), style = MaterialTheme.typography.headlineSmall)
                Text(uiText("If LionDApp has helped you, you can leave an optional SKR tip for the project. It does not purchase services, ranking, or any other benefit.", "如果 LionDApp 对你有帮助，可以自愿向项目打赏 SKR。打赏不购买服务、排名或其他权益。"))
                Text(uiText("Solana Mainnet · SKR", "Solana 主网 · SKR"), color = MaterialTheme.colorScheme.primary)
                SelectionContainer { Text(uiText("Project wallet\n", "项目收款钱包\n") + TIP_RECEIVER) }
                SelectionContainer { Text("SKR Mint\n$TIP_MINT", style = MaterialTheme.typography.bodySmall) }
                if (state.donationStatus == null) {
                    val enabled = state.donationConfig.allowsTips(tipsAllowedInBuild)
                    if (!enabled) Text(uiText("Tipping is currently unavailable. All community features remain free to use.", "打赏当前暂不可用，社区功能仍可免费使用。"))
                    OutlinedTextField(amount, { amount = it }, Modifier.fillMaxWidth(), label = { Text(uiText("Tip amount · SKR", "打赏金额 · SKR")) }, enabled = enabled && !state.donationBusy && state.donationQuote == null, isError = invalidAmount, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, supportingText = {
                        Text(if (invalidAmount) uiText("Enter a whole number from 1 to 1,000,000, without punctuation or a minus sign.", "请输入 1–1,000,000 的整数，不含小数点、负号或分隔符。") else uiText("1–1,000,000 whole SKR. SOL is also needed for network costs.", "1–1,000,000 整数 SKR，同时需要 SOL 支付网络费用。"))
                    })
                    if (state.donationQuote == null) Button({ parsedAmount?.let(prepare) }, enabled = enabled && parsedAmount != null && !state.donationBusy) { Text(uiText("Review tip", "查看打赏详情")) }
                    state.donationQuote?.let { quote ->
                        Text(uiText("You send ${quote.amountSkr} SKR", "你将支付 ${quote.amountSkr} SKR"), style = MaterialTheme.typography.titleLarge)
                        SelectionContainer { Text(uiText("From: ", "付款钱包：") + quote.payerAddress, style = MaterialTheme.typography.bodySmall) }
                        val network = runCatching { BigDecimal(quote.networkFeeLamports).movePointLeft(9).toPlainString() }.getOrDefault("—")
                        val rent = runCatching { BigDecimal(quote.accountRentLamports).movePointLeft(9).toPlainString() }.getOrDefault("—")
                        val validCosts = quote.networkFeeLamports.toLongOrNull()?.let { it >= 0 } == true && quote.accountRentLamports.toLongOrNull()?.let { it >= 0 } == true
                        val secondsLeft = runCatching { java.time.Duration.between(clock, java.time.Instant.parse(quote.expiresAt)).seconds.coerceAtLeast(0) }.getOrDefault(0)
                        Text(uiText("Estimated network fee: $network SOL\nToken account creation, if needed: $rent SOL", "预计网络费：$network SOL\n必要时创建收款代币账户：$rent SOL"))
                        Text(uiText("Review expires after 60 seconds. The wallet has final approval; no platform fee is added.", "确认页有效期为 60 秒，最终由钱包确认；平台不额外收取手续费。"), style = MaterialTheme.typography.bodySmall)
                        Text(if (secondsLeft > 0) uiText("Estimate valid for ${secondsLeft}s", "估算剩余有效时间：${secondsLeft} 秒") else uiText("Estimate expired. Refresh it before continuing.", "估算已过期，请重新获取后继续。"), color = if (secondsLeft > 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error)
                        if (!validCosts) Text(uiText("Network costs could not be verified. Refresh the estimate.", "无法确认网络费用，请重新获取估算。"), color = MaterialTheme.colorScheme.error)
                        Row { Checkbox(understood, { understood = it }, enabled = !state.donationBusy); Text(uiText("This is voluntary and transfers cannot be reversed by LionDApp. I have checked the amount and address.", "这是自愿打赏，LionDApp 无法撤销链上转账。我已核对金额和收款地址。")) }
                        Button(send, enabled = enabled && understood && !state.donationBusy && validCosts && secondsLeft > 0) { Text(uiText("Confirm in wallet", "前往钱包确认")) }
                        TextButton(resetReceipt, enabled = !state.donationBusy) { Text(uiText("Edit amount / refresh estimate", "修改金额／重新估算")) }
                    }
                } else {
                    Text(when (state.donationStatus) {
                        "confirmed" -> uiText("Thank you! Your tip is finalized on Solana.", "感谢支持！打赏已在 Solana 最终确认。")
                        "failed" -> uiText("The transaction failed on-chain. Network fees may still apply.", "链上交易失败，仍可能产生网络费。")
                        "pending" -> uiText("Waiting for final confirmation. Do not send again.", "等待链上最终确认，请勿重复付款。")
                        else -> uiText("The wallet result is not yet known. Check wallet history before starting another tip.", "尚未获得钱包结果。请先检查钱包交易记录，避免重复打赏。")
                    })
                    state.donationSignature?.let { SelectionContainer { Text(it, style = MaterialTheme.typography.bodySmall) } }
                    if (state.donationSignature != null) OutlinedButton(checkReceipt, enabled = !state.donationBusy) { Text(uiText("Check confirmation", "查询确认状态")) }
                    TextButton({ clearReceipt = true }, enabled = !state.donationBusy) { Text(uiText("Start a new tip…", "开始新的打赏…")) }
                }
                if (state.donationBusy) CircularProgressIndicator()
                state.donationError?.let { Text(userFacingError(it), color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    if (clearReceipt) AlertDialog(onDismissRequest = { clearReceipt = false }, title = { Text(uiText("Checked your wallet history?", "已检查钱包交易记录？")) }, text = { Text(uiText("Starting over does not cancel any prior transfer. Keep the signature if you need to contact support.", "重新开始不会取消之前的转账。如需支持，请保存交易签名。")) }, confirmButton = { TextButton({ resetReceipt(); clearReceipt = false }) { Text(uiText("Checked, start over", "已检查，重新开始")) } }, dismissButton = { TextButton({ clearReceipt = false }) { Text(uiText("Cancel", "取消")) } })
}
