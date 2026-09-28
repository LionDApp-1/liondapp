package top.oneion.liondapp.wallet

import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertThrows
import org.junit.Test
import top.oneion.liondapp.model.DonationQuote

class DonationValidationTest {
    private fun fixture() = Json.decodeFromString<DonationQuote>(javaClass.getResource("/donation-quote.json")!!.readText())

    @Test fun serverTransactionMatchesMobileReview() = runBlocking {
        val quote = fixture()
        validateDonation(quote, Base64.getDecoder().decode(quote.transaction))
    }

    @Test fun alteredAmountRecipientNetworkOrExpiryCannotReachWallet() {
        val quote = fixture()
        val bytes = Base64.getDecoder().decode(quote.transaction)
        listOf(quote.copy(amountSkr = 11, baseUnits = "11000000"), quote.copy(receiverAddress = quote.payerAddress), quote.copy(network = "devnet"), quote.copy(expiresAt = "2000-01-01T00:00:00Z")).forEach { changed ->
            assertThrows(IllegalArgumentException::class.java) { runBlocking { validateDonation(changed, bytes) } }
        }
    }

    @Test fun hiddenSolTransferIsRejected() {
        val quote = fixture()
        val bytes = Base64.getDecoder().decode(javaClass.getResource("/donation-extra-instruction.txt")!!.readText())
        assertThrows(IllegalArgumentException::class.java) { runBlocking { validateDonation(quote, bytes) } }
    }

    @Test fun malformedOrNegativeNetworkCostsCannotReachWallet() {
        val quote = fixture()
        val bytes = Base64.getDecoder().decode(quote.transaction)
        for (cost in listOf("-1", "1.5", "unknown", "9223372036854775808")) {
            for (changed in listOf(quote.copy(networkFeeLamports = cost), quote.copy(accountRentLamports = cost))) {
                assertThrows(IllegalArgumentException::class.java) { runBlocking { validateDonation(changed, bytes) } }
            }
        }
    }
}
