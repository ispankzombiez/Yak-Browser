package com.yak.browser

import android.content.Context
import android.util.AttributeSet
import android.widget.Button
import androidx.preference.Preference
import androidx.preference.PreferenceViewHolder

class NotificationPermissionPreference(context: Context, attrs: AttributeSet?) : Preference(context, attrs) {
    init {
        widgetLayoutResource = R.layout.preference_permission_button
    }

    fun refresh() {
        isEnabled = !ZoneNotifier.areNotificationsAllowed(context)
    }

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        val button = holder.itemView.findViewById<Button>(R.id.notificationPermissionButton)
        button.setText(
            if (isEnabled) R.string.notification_permission_enable
            else R.string.notification_permission_granted
        )
        button.contentDescription = context.getString(
            if (isEnabled) R.string.notification_permission_enable_description
            else R.string.notification_permission_granted_description
        )
        button.isEnabled = isEnabled
        button.alpha = if (isEnabled) 1f else 0.5f
        button.setOnClickListener { performClick() }
        button.isClickable = isEnabled
    }
}
