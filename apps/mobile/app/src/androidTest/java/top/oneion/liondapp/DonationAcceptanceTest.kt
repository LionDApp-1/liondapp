package top.oneion.liondapp

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.Instant
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import top.oneion.liondapp.model.DonationConfig
import top.oneion.liondapp.model.DonationQuote
import top.oneion.liondapp.ui.DonationContent
import top.oneion.liondapp.ui.LocalAppLanguage
import top.oneion.liondapp.ui.theme.LionDAppTheme
import top.oneion.liondapp.wallet.TIP_MINT
import top.oneion.liondapp.wallet.TIP_RECEIVER

/** Pure consent UI on a physical device: callbacks never create an API client or wallet. */
@RunWith(AndroidJUnit4::class)
class DonationAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private var prepared: Int? = null
    private var sends = 0
    private var resets = 0
    private var checks = 0
    private val config = DonationConfig(true, TIP_RECEIVER, TIP_MINT, "mainnet-beta")

    private fun quote() = DonationQuote(
        "ui-test-only", "Example payer for UI testing", TIP_RECEIVER, TIP_MINT,
        "mainnet-beta", 10, "10000000", "unused-in-ui-tests", "5000", "2039280",
        Instant.now().plusSeconds(60).toString(),
    )

    private fun show(state: LionUiState = LionUiState(donationConfig = config), buildEnabled: Boolean = true) {
        assertFalse("The QA binary must never enable real transfers", BuildConfig.DONATIONS_ENABLED)
        compose.setContent {
            CompositionLocalProvider(LocalAppLanguage provides "en") {
                LionDAppTheme {
                    DonationContent(state, buildEnabled, { prepared = it }, { sends++ },
                        { resets++ }, { checks++ }, {})
                }
            }
        }
    }

    private fun consent() = compose.onNode(isToggleable()).performScrollTo().performClick()
    private fun confirm() = compose.onNodeWithText("Confirm in wallet").performScrollTo()

    @Test fun invalidPastedAmountsArePreservedAndCannotBeReviewed() {
        show()
        for (input in listOf("1.5", "-10", "1,000", "1000001")) {
            compose.onNode(hasSetTextAction()).performScrollTo().performTextReplacement(input)
            compose.onNode(hasSetTextAction()).assertTextContains(input)
            compose.onNodeWithText("Review tip").assertIsNotEnabled()
        }
        assertNull(prepared)
        compose.onNode(hasSetTextAction()).performTextReplacement("10")
        compose.onNodeWithText("Review tip").performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(10, prepared) }
    }

    @Test fun reviewShowsExactDestinationAndCostsAndRequiresConsent() {
        show(LionUiState(donationConfig = config, donationQuote = quote()))
        compose.onNodeWithText("Project wallet\n$TIP_RECEIVER").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("SKR Mint\n$TIP_MINT").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("You send 10 SKR").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Estimated network fee: 0.000005000 SOL\nToken account creation, if needed: 0.002039280 SOL")
            .performScrollTo().assertIsDisplayed()
        confirm().assertIsNotEnabled()
        consent()
        confirm().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, sends) }
    }

    @Test fun expiredEstimateCannotBeConfirmedEvenWithConsent() {
        show(LionUiState(donationConfig = config, donationQuote = quote().copy(expiresAt = Instant.now().minusSeconds(1).toString())))
        consent()
        confirm().assertIsNotEnabled()
        compose.onNodeWithText("Estimate expired. Refresh it before continuing.").performScrollTo().assertIsDisplayed()
        assertEquals(0, sends)
    }

    @Test fun disabledServerCannotConfirmAnExistingEstimate() {
        show(LionUiState(donationConfig = config.copy(enabled = false), donationQuote = quote()))
        consent()
        confirm().assertIsNotEnabled()
    }

    @Test fun mismatchedServerRecipientCannotConfirmAnExistingEstimate() {
        show(LionUiState(donationConfig = config.copy(receiverAddress = "unexpected"), donationQuote = quote()))
        consent()
        confirm().assertIsNotEnabled()
    }

    @Test fun disabledBuildCannotConfirmAnExistingEstimate() {
        show(LionUiState(donationConfig = config, donationQuote = quote()), buildEnabled = false)
        consent()
        confirm().assertIsNotEnabled()
    }

    @Test fun malformedCostsCannotBeConfirmed() {
        show(LionUiState(donationConfig = config, donationQuote = quote().copy(networkFeeLamports = "-1")))
        consent()
        confirm().assertIsNotEnabled()
        compose.onNodeWithText("Network costs could not be verified. Refresh the estimate.").performScrollTo().assertIsDisplayed()
    }

    @Test fun uncertainWalletResultRequiresExplicitResetAndCancelKeepsReceipt() {
        show(LionUiState(donationConfig = config, donationStatus = "unknown"))
        compose.onNodeWithText("Confirm in wallet").assertDoesNotExist()
        compose.onNodeWithText("Review tip").assertDoesNotExist()
        compose.onNodeWithText("Start a new tip…").performScrollTo().performClick()
        compose.onNodeWithText("Cancel").performClick()
        compose.runOnIdle { assertEquals(0, resets) }
        compose.onNodeWithText("Start a new tip…").performClick()
        compose.onNodeWithText("Checked, start over").performClick()
        compose.runOnIdle { assertEquals(1, resets); assertEquals(0, sends) }
    }

    @Test fun pendingReceiptCanBeCheckedWhileTippingIsDisabled() {
        show(LionUiState(donationConfig = config.copy(enabled = false), donationStatus = "pending", donationSignature = "synthetic-signature"), buildEnabled = false)
        compose.onNodeWithText("Waiting for final confirmation. Do not send again.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Confirm in wallet").assertDoesNotExist()
        compose.onNodeWithText("Check confirmation").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, checks); assertEquals(0, sends) }
    }
}
