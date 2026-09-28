package top.oneion.liondapp.wallet

import android.util.Base64
import androidx.core.net.toUri
import com.funkatronics.encoders.Base58
import com.solana.mobilewalletadapter.clientlib.*
import com.solana.publickey.ProgramDerivedAddress
import com.solana.publickey.SolanaPublicKey
import com.solana.transaction.Transaction
import top.oneion.liondapp.BuildConfig
import top.oneion.liondapp.model.DonationQuote
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant

const val TIP_RECEIVER = "ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW"
const val TIP_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3"

/** Allow only one checked SKR transfer to the pinned project ATA and an idempotent ATA creation. */
internal suspend fun validateDonation(quote: DonationQuote, bytes: ByteArray) {
    require(quote.receiverAddress == TIP_RECEIVER && quote.mintAddress == TIP_MINT && quote.network == "mainnet-beta") { "invalid_donation_transaction" }
    require(quote.amountSkr in 1..1_000_000 && quote.baseUnits == (quote.amountSkr.toLong() * 1_000_000L).toString()) { "invalid_donation_transaction" }
    require(quote.networkFeeLamports.toLongOrNull()?.let { it >= 0 } == true && quote.accountRentLamports.toLongOrNull()?.let { it >= 0 } == true) { "invalid_donation_transaction" }
    require(Instant.parse(quote.expiresAt).isAfter(Instant.now())) { "donation_quote_expired" }
    val tx = Transaction.from(bytes)
    val message = tx.message
    val accounts = message.accounts.map { it.base58() }
    require(tx.signatures.size == 1 && tx.signatures[0].all { it == 0.toByte() } && message.signatureCount.toInt() == 1 && message.readOnlyAccounts.toInt() == 0 && accounts.first() == quote.payerAddress) { "invalid_donation_transaction" }
    val token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    val associated = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    suspend fun ata(owner: String) = ProgramDerivedAddress.find(listOf(SolanaPublicKey.from(owner).bytes, SolanaPublicKey.from(token).bytes, SolanaPublicKey.from(TIP_MINT).bytes), SolanaPublicKey.from(associated)).getOrThrow().base58()
    val source = ata(quote.payerAddress)
    val destination = ata(TIP_RECEIVER)
    require(accounts.take(accounts.size - message.readOnlyNonSigners.toInt()).toSet() == setOf(quote.payerAddress, source, destination)) { "invalid_donation_transaction" }
    val instructions = message.instructions
    require(instructions.size == 3) { "invalid_donation_transaction" }
    fun verify(index: Int, program: String, keys: List<String>, data: ByteArray) {
        val ix = instructions[index]
        require(accounts[ix.programIdIndex.toInt()] == program && ix.accountIndices.map { accounts[it.toInt() and 255] } == keys && ix.data.contentEquals(data)) { "invalid_donation_transaction" }
    }
    verify(0, associated, listOf(quote.payerAddress, destination, TIP_RECEIVER, TIP_MINT, "11111111111111111111111111111111", token), byteArrayOf(1))
    val transfer = ByteBuffer.allocate(10).order(ByteOrder.LITTLE_ENDIAN).put(12.toByte()).putLong(quote.amountSkr.toLong() * 1_000_000L).put(6.toByte()).array()
    verify(1, token, listOf(source, TIP_MINT, destination, quote.payerAddress), transfer)
    verify(2, "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", emptyList(), "LionDApp tip:${quote.quoteId}".toByteArray(Charsets.UTF_8))
}

class DonationWallet {
    private val adapter = MobileWalletAdapter(connectionIdentity = ConnectionIdentity(BuildConfig.APP_IDENTITY_URI.toUri(), "favicon.png".toUri(), "LionDApp")).apply { blockchain = Solana.Mainnet }

    suspend fun send(sender: ActivityResultSender, quote: DonationQuote): String {
        check(BuildConfig.DONATIONS_ENABLED) { "donations_disabled" }
        val bytes = Base64.decode(quote.transaction, Base64.NO_WRAP)
        validateDonation(quote, bytes)
        val result = adapter.transact(sender) { auth ->
            require(Base58.encodeToString(auth.accounts.first().publicKey) == quote.payerAddress) { "donation_wallet_mismatch" }
            require(Instant.parse(quote.expiresAt).isAfter(Instant.now())) { "donation_quote_expired" }
            val capabilities = getCapabilities()
            require(capabilities.supportsSignAndSendTransactions && (capabilities.maxTransactionsPerSigningRequest == 0 || capabilities.maxTransactionsPerSigningRequest >= 1)) { "wallet_transaction_unsupported" }
            signAndSendTransactions(arrayOf(bytes), TransactionParams(null, "confirmed", false, null, false))
        }
        return when (result) {
            is TransactionResult.Success -> result.payload.signatures.singleOrNull()?.let { Base58.encodeToString(it) } ?: error("donation_status_unknown")
            else -> error("donation_status_unknown")
        }
    }
}
