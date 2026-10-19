# YakBrowser ProGuard/R8 rules.

# The app uses no reflection, JSON binding, or JavaScript interfaces,
# so no custom keep rules are required yet.

# Keep line numbers in stack traces for Play Console crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
