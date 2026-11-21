# YakBrowser ProGuard/R8 rules.

# AndroidX inflates this preference by its XML class name.
-keep class com.yak.browser.NotificationPermissionPreference {
    public <init>(android.content.Context, android.util.AttributeSet);
}

# Keep line numbers in stack traces for Play Console crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
