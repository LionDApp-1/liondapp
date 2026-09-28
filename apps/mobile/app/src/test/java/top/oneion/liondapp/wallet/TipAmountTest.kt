package top.oneion.liondapp.wallet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TipAmountTest {
    @Test fun acceptsExactWholeAmountsWithinBounds() {
        assertEquals(1, parseTipAmount("1"))
        assertEquals(10, parseTipAmount(" 10 "))
        assertEquals(1_000_000, parseTipAmount("1000000"))
    }

    @Test fun neverReinterpretsPastedOrInvalidPaymentAmounts() {
        listOf("1.5", "-10", "+10", "1,000", "1e3", "100 SKR", "1 0", "١٠", "１０", "0", "1000001", "10000000", "", " ", "999999999999999999999999").forEach {
            assertNull("Must reject the original input: $it", parseTipAmount(it))
        }
    }
}
