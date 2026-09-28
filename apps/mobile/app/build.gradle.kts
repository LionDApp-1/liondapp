plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val releaseStoreFile = providers.environmentVariable("LIONDAPP_RELEASE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("LIONDAPP_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("LIONDAPP_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("LIONDAPP_RELEASE_KEY_PASSWORD").orNull
val releaseSigningReady = listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword).all { !it.isNullOrBlank() }
val androidStudioSigningReady = listOf(
    "android.injected.signing.store.file",
    "android.injected.signing.store.password",
    "android.injected.signing.key.alias",
    "android.injected.signing.key.password",
).all { !providers.gradleProperty(it).orNull.isNullOrBlank() }

check(!(releaseSigningReady || androidStudioSigningReady) || !gradle.startParameter.isConfigurationCacheRequested) {
    "Signing builds must use --no-configuration-cache so signing passwords are not serialized into the Gradle configuration cache."
}

android {
    namespace = "top.oneion.liondapp"
    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "top.oneion.liondapp"
        minSdk = 26
    targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "API_BASE_URL", "\"https://api.liondapp.1ion.top\"")
        buildConfigField("String", "APP_IDENTITY_URI", "\"https://liondapp.1ion.top\"")
        buildConfigField("String", "SOLANA_CHAIN", "\"solana:devnet\"")
        buildConfigField("boolean", "PROMOTION_PURCHASE_ENABLED", "false")
        buildConfigField("boolean", "DONATIONS_ENABLED", "false")
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("storeRelease") {
                storeFile = file(requireNotNull(releaseStoreFile))
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-devnet.debug"
            buildConfigField("boolean", "PROMOTION_PURCHASE_ENABLED", "true")
        }
        create("qa") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".qa"
            versionNameSuffix = "-qa"
            matchingFallbacks += "debug"
            buildConfigField("boolean", "PROMOTION_PURCHASE_ENABLED", "false")
        }
        release {
            buildConfigField("boolean", "DONATIONS_ENABLED", providers.environmentVariable("LIONDAPP_DONATIONS_ENABLED").orNull.let { if (it == "true") "true" else "false" })
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseSigningReady) signingConfig = signingConfigs.getByName("storeRelease")
        }
    }

    // Instrumentation has its own package/storage; never overwrite a user's test login.
    testBuildType = "qa"

    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
}

tasks.register("checkStoreReleaseSigning") {
    doLast {
        check(releaseSigningReady || androidStudioSigningReady) {
            "Release signing is missing. Use Android Studio's Generate Signed APK wizard or the protected release script; never commit signing secrets."
        }
        if (releaseSigningReady) {
            check(requireNotNull(releaseStoreFile).let(::file).isFile) { "Release keystore file was not found." }
        }
    }
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    dependsOn("checkStoreReleaseSigning")
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.06.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("androidx.navigation:navigation-compose:2.9.1")

    implementation("io.ktor:ktor-client-core:3.1.3")
    implementation("io.ktor:ktor-client-okhttp:3.1.3")
    implementation("io.ktor:ktor-client-content-negotiation:3.1.3")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.1.3")
    implementation("io.coil-kt.coil3:coil-compose:3.2.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    // Versions below are pinned to the current official Solana Mobile Kotlin guide.
    implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3")
    implementation("com.solanamobile:web3-solana:0.2.5")
    implementation("com.solanamobile:rpc-core:0.2.7")
    implementation("io.github.funkatronics:multimult:0.2.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("io.ktor:ktor-client-mock:3.1.3")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    add("qaImplementation", "androidx.compose.ui:ui-test-manifest")
}
