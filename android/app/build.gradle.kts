plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lookafurry.urbanosdemarbella"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lookafurry.urbanosdemarbella"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.2.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
