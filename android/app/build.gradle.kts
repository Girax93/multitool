import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI injects these (see .github/workflows/android.yml). Local builds get dev defaults.
val shellVersionCode = (System.getenv("SHELL_VERSION_CODE") ?: "1").toInt()
val shellVersionName = System.getenv("SHELL_VERSION_NAME") ?: "0.0.0-dev"
val appUrl = System.getenv("APP_URL") ?: "https://multitool.ariilden.com/"
val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")

android {
    namespace = "com.ariilden.multitool"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ariilden.multitool"
        minSdk = 26
        targetSdk = 35
        versionCode = shellVersionCode
        versionName = shellVersionName
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
        buildConfigField("String", "GITHUB_REPO", "\"Girax93/multitool\"")
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        // Lint findings are reported in the CI log but must not block a release build.
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
