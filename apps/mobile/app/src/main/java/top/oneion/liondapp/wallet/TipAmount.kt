package top.oneion.liondapp.wallet

/** Preserve the entered amount: never turn a decimal, negative or formatted value into another payment. */
internal fun parseTipAmount(input: String): Int? {
    val value = input.trim()
    if (!value.matches(Regex("[0-9]{1,7}"))) return null
    return value.toIntOrNull()?.takeIf { it in 1..1_000_000 }
}
