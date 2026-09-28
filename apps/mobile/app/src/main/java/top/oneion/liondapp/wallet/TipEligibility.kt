package top.oneion.liondapp.wallet

import top.oneion.liondapp.model.DonationConfig

internal fun DonationConfig?.allowsTips(buildEnabled: Boolean): Boolean = buildEnabled && this != null &&
    enabled && network == "mainnet-beta" && receiverAddress == TIP_RECEIVER && mintAddress == TIP_MINT
