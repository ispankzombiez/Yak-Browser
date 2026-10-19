package com.yak.browser

/**
 * "What's New" notes shown once after an app update.
 *
 * Add a block per release (ascending version order). Versions are compared
 * numerically, so e.g. "1.0.10" sorts after "1.0.9" — plain string compare
 * would not.
 */
object WhatsNew {

    /** versionName -> bullet points shipped in that version. */
    private val NOTES = listOf(
        "1.0.3" to listOf(
            "Proper gear icon with a contrast outline",
            "Optional “Settings access”: hide the floating gear",
            "Settings reachable from any phone (long-press the app icon)"
        ),
        "1.0.4" to listOf(
            "Reload game — fresh start without closing the app (also in the icon’s long-press menu)",
            "About section: version, privacy policy, support contact",
            "Keep screen on toggle",
            "Every game window now fits portrait — including ones the game adds later"
        ),
        "1.0.5" to listOf(
            "This What’s New dialog — release notes after every update",
            "Occasional Play rating prompt after a few play sessions"
            // Add the next release here.
        )
    )

    /** Bullet points for everything newer than [lastSeenVersion], in order. */
    fun notesSince(lastSeenVersion: String?): List<String> {
        // A fresh install has no "last seen" version: nothing is new to show.
        if (lastSeenVersion == null) return emptyList()
        return NOTES
            .filter { (version, _) -> compareVersions(version, lastSeenVersion) > 0 }
            .flatMap { it.second }
    }

    /** Numeric dotted-version compare: -1 / 0 / +1. */
    fun compareVersions(a: String, b: String): Int {
        val pa = a.split('.').mapNotNull { it.toIntOrNull() }
        val pb = b.split('.').mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return if (x < y) -1 else 1
        }
        return 0
    }
}
