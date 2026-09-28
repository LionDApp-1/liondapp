package top.oneion.liondapp.wallet

import androidx.core.net.toUri
import com.funkatronics.encoders.Base58
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient
import top.oneion.liondapp.BuildConfig
import top.oneion.liondapp.data.ApiClient
import top.oneion.liondapp.model.VerifyRequest
import top.oneion.liondapp.model.VerifyResponse

class WalletAuthManager(private val api: ApiClient) {
    private val adapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = BuildConfig.APP_IDENTITY_URI.toUri(),
            iconUri = "favicon.png".toUri(),
            identityName = "LionDApp",
        ),
    )

    suspend fun signIn(sender: ActivityResultSender, locale: String): VerifyResponse {
        val connection = adapter.connect(sender)
        val connectionSuccess = connection as? TransactionResult.Success<Unit>
            ?: throw WalletAuthException(resultCode(connection))
        val walletAddress = Base58.encodeToString(connectionSuccess.authResult.accounts.first().publicKey)
        val challenge = api.challenge(walletAddress)

        val signatureResult = adapter.transact(sender) { authResult ->
            signMessagesDetached(
                arrayOf(challenge.message.toByteArray(Charsets.UTF_8)),
                arrayOf(authResult.accounts.first().publicKey),
            )
        }
        val signatureSuccess = signatureResult as? TransactionResult.Success<MobileWalletAdapterClient.SignMessagesResult>
            ?: throw WalletAuthException(resultCode(signatureResult))
        val signature = signatureSuccess.payload.messages.firstOrNull()?.signatures?.firstOrNull()
            ?: throw WalletAuthException("signature_missing")

        return api.verify(
            VerifyRequest(
                challengeId = challenge.challengeId,
                walletAddress = walletAddress,
                signedMessage = challenge.message,
                signature = Base58.encodeToString(signature),
                acceptTerms = true,
                confirmAge = true,
                locale = locale,
            ),
        )
    }

    private fun resultCode(result: TransactionResult<*>): String = when (result) {
        is TransactionResult.NoWalletFound -> "wallet_not_found"
        is TransactionResult.Failure -> result.e.message ?: "wallet_request_failed"
        else -> "wallet_request_failed"
    }
}

class WalletAuthException(message: String) : Exception(message)
