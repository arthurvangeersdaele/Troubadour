package com.troubadour.app.settings

import android.content.Context

/**
 * The bard name that signs every .troubadour file the app exports: the name registered with a GitHub
 * account in the settings (see AppSettings and AppModel.connectGitHub), else "Forgotten Troubadour".
 */
object BardSettings {
    private const val PREFS = "troubadour.settings"
    const val FORGOTTEN = "Forgotten Troubadour"
    const val KEY_TOKEN = "gh_token"
    const val KEY_LOGIN = "gh_login"
    const val KEY_NAME = "gh_name"

    fun bardName(context: Context): String =
        prefs(context).getString(KEY_NAME, "")?.trim().orEmpty().ifBlank { FORGOTTEN }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
