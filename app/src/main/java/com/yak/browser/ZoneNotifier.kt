package com.yak.browser

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.json.JSONException

/**
 * Schedules arrival alarms and one next-refresh reminder learned from Battles.
 *
 * The page reports each zone's next arrival (the game's own absolute
 * `naturalCallAt` or farm `dueAt`, plus milliseconds remaining by the server's clock).
 * An alarm is only (re)scheduled when its server time differs from the one
 * already scheduled, so repeated state syncs cost nothing. Zones refresh at
 * different rates, so each zone has its own alarm, identified by its id.
 */
object ZoneNotifier {

    private const val PREFS = "zone_alarms"
    private const val CHANNEL_ID = "zone_arrivals"
    private const val ACTION_ARRIVAL = "com.yak.browser.action.ZONE_ARRIVAL"
    private const val EXTRA_ZONE = "zone"
    private const val FARM_REMINDER_ID = "_farm_reminder"
    private const val BATTLE_REMINDER_ID = "_battle_refresh"
    private const val BATTLE_CHANNEL_ID = "battle_challenges"
    private const val MAX_ZONES = 16
    private const val MAX_REMAINING_MS = 7L * 24 * 60 * 60 * 1000
    private val ZONE_ID = Regex("^[A-Za-z0-9_-]{1,40}$")

    /** Null entries cancel reminders; battle reports are accepted only while the game is open. */
    fun onArrivalsReported(context: Context, json: String, isGameOpen: Boolean) {
        val message = try {
            JSONObject(json)
        } catch (e: JSONException) {
            Log.w("ZoneNotifier", "Ignoring a malformed arrival message.")
            return
        }
        if (message.has("battle") && isGameOpen && AppPreferences.isBattleNotificationsEnabled(context)) {
            if (message.isNull("battle")) {
                cancelBattleReminder(context)
            } else {
                val battle = message.optJSONObject("battle")
                val at = battle?.optLong("at", 0L) ?: 0L
                val remaining = battle?.optLong("remaining", 0L) ?: 0L
                if (battle?.opt("at") is Number && battle.opt("remaining") is Number &&
                    at > 0L && remaining > 0L && remaining <= MAX_REMAINING_MS
                ) {
                    schedule(context, BATTLE_REMINDER_ID, at, System.currentTimeMillis() + remaining)
                } else {
                    Log.w("ZoneNotifier", "Ignoring an invalid battle refresh time.")
                }
            }
        }
        if (!message.has("zones") && !message.has("farm") && !message.has("battle")) {
            Log.w("ZoneNotifier", "Ignoring an arrival message without timers.")
            return
        }
        if (!AppPreferences.isZoneNotificationsEnabled(context)) return
        if (message.has("farm")) {
            if (message.isNull("farm")) {
                cancelFarmReminder(context)
            } else {
                val farm = message.optJSONObject("farm")
                val at = farm?.optLong("at", 0L) ?: 0L
                val remaining = farm?.optLong("remaining", 0L) ?: 0L
                if (farm?.opt("at") is Number && farm.opt("remaining") is Number &&
                    at > 0L && remaining > 0L && remaining <= MAX_REMAINING_MS
                ) {
                    schedule(context, FARM_REMINDER_ID, at, System.currentTimeMillis() + remaining)
                } else {
                    Log.w("ZoneNotifier", "Ignoring an invalid farm reminder time.")
                }
            }
        }
        val zones = message.optJSONObject("zones")
        if (zones == null) {
            if (message.has("zones")) Log.w("ZoneNotifier", "Ignoring invalid zone timers.")
            return
        }
        var handled = 0
        for (id in zones.keys()) {
            if (handled++ >= MAX_ZONES) break
            if (!ZONE_ID.matches(id) || id == FARM_REMINDER_ID || id == BATTLE_REMINDER_ID) continue
            val zone = zones.optJSONObject(id) ?: continue
            val at = zone.optLong("at", 0L)
            val remaining = zone.optLong("remaining", 0L)
            if (at <= 0L || remaining <= 0L || remaining > MAX_REMAINING_MS) continue
            schedule(context, id, at, System.currentTimeMillis() + remaining)
        }
    }

    /** True when this device currently lets the app set exact alarms. */
    fun canUseExactAlarms(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    /** Exact only when the setting is on AND the device allows it; else inexact. */
    private fun wantExact(context: Context): Boolean =
        AppPreferences.isExactAlarms(context) && canUseExactAlarms(context)

    private fun schedule(context: Context, zoneId: String, serverAt: Long, triggerAt: Long) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val exact = wantExact(context)
        val sameTime = prefs.getLong("$zoneId.at", 0L) == serverAt
        val stillPending = prefs.getLong("$zoneId.trigger", 0L) > System.currentTimeMillis() &&
            pendingIntent(context, zoneId, PendingIntent.FLAG_NO_CREATE) != null
        if (sameTime && stillPending && prefs.getBoolean("$zoneId.exact", false) == exact) return

        if (!setAlarm(context, zoneId, triggerAt, exact)) return
        prefs.edit()
            .putLong("$zoneId.at", serverAt)
            .putLong("$zoneId.trigger", triggerAt)
            .putBoolean("$zoneId.exact", exact)
            .apply()
    }

    private fun setAlarm(context: Context, zoneId: String, triggerAt: Long, exact: Boolean): Boolean {
        val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(context, zoneId, PendingIntent.FLAG_UPDATE_CURRENT) ?: return false
        try {
            if (exact) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (e: SecurityException) {
            Log.w("ZoneNotifier", "Exact alarm permission changed; using approximate timing.", e)
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }
        return true
    }

    /**
     * Re-registers still-pending alarms whose type no longer matches the
     * setting (the exact-alarm toggle changed, or the device permission was
     * granted/revoked). Uses the arrival times already stored, so it needs
     * no new data from the game.
     */
    fun resync(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val exact = wantExact(context)
        val now = System.currentTimeMillis()
        val edit = prefs.edit()
        for (id in prefs.all.keys.filter { it.endsWith(".at") }.map { it.removeSuffix(".at") }) {
            val enabled = if (id == BATTLE_REMINDER_ID)
                AppPreferences.isBattleNotificationsEnabled(context)
            else AppPreferences.isZoneNotificationsEnabled(context)
            if (!enabled) {
                cancelReminder(context, id)
                continue
            }
            val trigger = prefs.getLong("$id.trigger", 0L)
            if (trigger <= now || prefs.getBoolean("$id.exact", false) == exact) continue
            if (setAlarm(context, id, trigger, exact)) edit.putBoolean("$id.exact", exact)
        }
        edit.apply()
    }

    /** Cancels arrival alarms without touching the independent battle reminder. */
    fun cancelAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val zoneIds = prefs.all.keys.filter { it.endsWith(".at") }
            .map { it.removeSuffix(".at") }.filter { it != BATTLE_REMINDER_ID }
        if (zoneIds.isEmpty()) return
        for (id in zoneIds) {
            cancelAlarm(context, id)
        }
        val edit = prefs.edit()
        for (id in zoneIds) edit.remove("$id.at").remove("$id.trigger").remove("$id.exact")
        edit.apply()
    }

    private fun cancelFarmReminder(context: Context) {
        cancelReminder(context, FARM_REMINDER_ID)
    }

    fun cancelBattleReminder(context: Context) {
        cancelReminder(context, BATTLE_REMINDER_ID)
    }

    private fun cancelReminder(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.contains("$id.at")) return
        cancelAlarm(context, id)
        prefs.edit()
            .remove("$id.at")
            .remove("$id.trigger")
            .remove("$id.exact")
            .apply()
    }

    private fun cancelAlarm(context: Context, id: String) {
        pendingIntent(context, id, PendingIntent.FLAG_NO_CREATE)?.let {
            (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(it)
            it.cancel()
        }
    }

    private fun pendingIntent(context: Context, zoneId: String, flag: Int): PendingIntent? {
        val intent = Intent(context, ZoneAlarmReceiver::class.java)
            .setAction(ACTION_ARRIVAL)
            // Distinct data URI = distinct PendingIntent per zone.
            .setData(Uri.parse("yakbrowser://zone/$zoneId"))
            .putExtra(EXTRA_ZONE, zoneId)
        return PendingIntent.getBroadcast(
            context, zoneId.hashCode(), intent, flag or PendingIntent.FLAG_IMMUTABLE
        )
    }

    internal fun zoneIdOf(intent: Intent): String? = intent.getStringExtra(EXTRA_ZONE)

    fun hasNotificationPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    fun areNotificationsAllowed(context: Context): Boolean =
        hasNotificationPermission(context) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    internal fun notify(context: Context, zoneId: String) {
        if (zoneId == BATTLE_REMINDER_ID) {
            if (AppPreferences.isBattleNotificationsEnabled(context)) {
                post(
                    context, zoneId,
                    context.getString(R.string.battle_notification_text),
                    context.getString(R.string.battle_notification_title),
                    BATTLE_CHANNEL_ID
                )
            }
            return
        }
        if (!AppPreferences.isZoneNotificationsEnabled(context)) return
        if (zoneId == FARM_REMINDER_ID) {
            post(
                context, zoneId,
                context.getString(R.string.farm_reminder_text),
                context.getString(R.string.farm_reminder_title)
            )
        } else {
            post(context, zoneId, "New Yakkamon have arrived in ${zoneName(zoneId)}.")
        }
    }

    /**
     * Sends a sample notification through the same channel and path as a real
     * arrival, ignoring the on/off setting. Returns false when the system
     * would block it (no permission, or notifications turned off for the app).
     */
    fun sendTest(context: Context): Boolean {
        if (!areNotificationsAllowed(context)) return false
        post(context, "test", "YakBrowser can alert you about arrivals and new battle challenges.", "YakBrowser test")
        return true
    }

    private fun post(
        context: Context, key: String, text: String, title: String = "New Yakkamon!",
        channelId: String = CHANNEL_ID
    ) {
        if (!hasNotificationPermission(context)) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId, if (channelId == BATTLE_CHANNEL_ID) "Battle challenges" else "Yakkamon arrivals",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = if (channelId == BATTLE_CHANNEL_ID) "The next challenge refresh learned from Battles"
                else "Hunting-zone arrivals and tentative farm-visitor reminders"
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(key.hashCode(), notification)
    }

    private fun zoneName(zoneId: String): String =
        when (zoneId) {
            "safari" -> "Clover Meadow"
            "bramble" -> "Bramble Fields"
            "mistmere" -> "Mistmere Marsh"
            "hollowshade" -> "Hollowshade Ruins"
            "emberpeak" -> "Emberpeak Ridge"
            else -> zoneId.replace('_', ' ').replace('-', ' ').replaceFirstChar { it.uppercase() }
        }
}

/** Fires when a zone's arrival time is reached. */
class ZoneAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ZoneNotifier.zoneIdOf(intent)?.let { ZoneNotifier.notify(context, it) }
    }
}
