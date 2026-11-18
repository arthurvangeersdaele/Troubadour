// GENERATED from docs/shared/troubadour.tokens.json by .github/scripts/build_tokens.py. Do not edit:
// edit the tokens and run the script. The web reads the same tokens (docs/shared/tokens.css).
package com.troubadour.app.ui

/** Design tokens shared with every Troubadour surface. */
object TroubadourTokens {
    /** Order of each palette: bg, bar, card, line, text, muted, accent, music, amb, evt, blue, onZ (RGB, no alpha). */
    val palettes: Map<String, LongArray> = mapOf(
        "obsidian.dark" to longArrayOf(0x0F0F13L, 0x15151BL, 0x1C1C24L, 0x2E2E39L, 0xECE8DEL, 0xA29FAEL, 0xE0A84BL, 0xE0A84BL, 0x4FB3A5L, 0xE06A63L, 0x2F8BFFL, 0x0F0F13L),
        "obsidian.light" to longArrayOf(0xF2F1F4L, 0xFBFBFCL, 0xFFFFFFL, 0xDAD8E0L, 0x1A1A22L, 0x6B6878L, 0xB37714L, 0xB37714L, 0x1F857AL, 0xC2443DL, 0x1F6FE0L, 0xFFFFFFL),
        "parchment.dark" to longArrayOf(0x1E1912L, 0x251F16L, 0x30281DL, 0x4A3D2BL, 0xF1E6CFL, 0xBBA987L, 0xE0B062L, 0xE0A84BL, 0x4FB3A5L, 0xE06A63L, 0x2F8BFFL, 0x1E1912L),
        "parchment.light" to longArrayOf(0xF3EAD7L, 0xEDE1C8L, 0xFBF5E8L, 0xD9C7A3L, 0x2E2416L, 0x7A6A4EL, 0xA06A16L, 0xB37714L, 0x1F857AL, 0xC2443DL, 0x1F6FE0L, 0xFFFFFFL),
        "blood.dark" to longArrayOf(0x140B0CL, 0x1A0E10L, 0x261517L, 0x43242AL, 0xF2E4E2L, 0xB79A9DL, 0xF0606AL, 0xE0A84BL, 0x4FB3A5L, 0xE06A63L, 0x2F8BFFL, 0x140B0CL),
        "blood.light" to longArrayOf(0xF7EDEDL, 0xF0E1E1L, 0xFFF9F9L, 0xE2C6CAL, 0x2A1416L, 0x84636AL, 0xB3303BL, 0xB37714L, 0x1F857AL, 0xC2443DL, 0x1F6FE0L, 0xFFFFFFL),
        "divination.dark" to longArrayOf(0x0B1020L, 0x0F1529L, 0x18213DL, 0x2B3762L, 0xE6E9F8L, 0x9EA6C8L, 0xC9A7F5L, 0xE0A84BL, 0x4FB3A5L, 0xE06A63L, 0x2F8BFFL, 0x0B1020L),
        "divination.light" to longArrayOf(0xECEFFAL, 0xE3E8F7L, 0xFAFBFFL, 0xCBD2EEL, 0x141A33L, 0x5D6590L, 0x7450C2L, 0xB37714L, 0x1F857AL, 0xC2443DL, 0x1F6FE0L, 0xFFFFFFL),
        "pumpkin.any" to longArrayOf(0x120C08L, 0x1A110BL, 0x24170FL, 0x46301EL, 0xF6E7D4L, 0xBC9F84L, 0xFF8A1EL, 0xFF8A1EL, 0x8BD450L, 0xB66BF0L, 0xFFB347L, 0x120C08L),
        "santa.any" to longArrayOf(0x0B1811L, 0x0F1F16L, 0x16291EL, 0x2A4634L, 0xF5F2EAL, 0xA9BCAEL, 0xE6B84EL, 0xE6B84EL, 0xA9DCF0L, 0xE5484DL, 0xA9DCF0L, 0x0B1811L),
        "pride.any" to longArrayOf(0xD9EFFBL, 0xE9F6FDL, 0xFFFFFFL, 0xB5DAF0L, 0x13233AL, 0x4D6985L, 0x7A35D8L, 0xE8590CL, 0x0B8F3EL, 0xD61F69L, 0x1F5FE0L, 0xFFFFFFL),
        "dragonfire.any" to longArrayOf(0x130705L, 0x1B0A07L, 0x28110BL, 0x4E2315L, 0xF9E7D9L, 0xC49C87L, 0xFF5A1FL, 0xFFB238L, 0xB9A397L, 0xFF3B2FL, 0xFFD166L, 0x130705L),
        "abyss.any" to longArrayOf(0x020A13L, 0x05101CL, 0x0A192AL, 0x163049L, 0xDCF4F8L, 0x7EA3B6L, 0x2EE6D6L, 0x2EE6D6L, 0x4C86FFL, 0xC76BFFL, 0x4C86FFL, 0x020A13L),
        "excalibur.any" to longArrayOf(0x0D1310L, 0x121A15L, 0x1A241DL, 0x2F3E33L, 0xEEF2ECL, 0xA3AFA4L, 0xC8D7E2L, 0xDCC37AL, 0x7FBF8EL, 0x72A9DEL, 0x72A9DEL, 0x0D1310L),
    )

    /** Limited editions drawn on a light ground whatever the appearance. */
    val lightSpecials: Set<String> = setOf("pride")

    const val DANGER_DARK = 0xE5534BL
    const val DANGER_LIGHT = 0xCF3B32L
    const val ON_DANGER_DARK = 0xFFFFFFL
    const val ON_DANGER_LIGHT = 0xFFFFFFL
    const val GOLD_DARK = 0xF0C24FL
    const val GOLD_LIGHT = 0xC48A0EL
    const val GOLD_HOT_DARK = 0xFFE08AL
    const val GOLD_HOT_LIGHT = 0xE0A62AL
    const val GOLD_INK_DARK = 0x1A1206L
    const val GOLD_INK_LIGHT = 0x1A1206L
    const val SILVER_DARK = 0xDCE3ECL
    const val SILVER_LIGHT = 0x7E8A99L
    const val SILVER_HOT_DARK = 0xFFFFFFL
    const val SILVER_HOT_LIGHT = 0xB9C3CFL
    const val SILVER_INK_DARK = 0x161A20L
    const val SILVER_INK_LIGHT = 0xFFFFFFL
    const val SV_HI_DARK = 0xFFFFFFL
    const val SV_HI_LIGHT = 0xFFFFFFL
    const val SV_MID_DARK = 0xDCE3ECL
    const val SV_MID_LIGHT = 0xB9C3CFL
    const val SV_LO_DARK = 0x8E99A8L
    const val SV_LO_LIGHT = 0x6E7A8AL
    const val SV_DEEP_DARK = 0x5E6876L
    const val SV_DEEP_LIGHT = 0x4A5462L
    const val SV_TEXT_DARK = 0x161A20L
    const val SV_TEXT_LIGHT = 0xFFFFFFL

    /** A slider value v is heard as v to this power, on every platform. */
    const val VOLUME_CURVE_EXPONENT = 2
    const val LOUDNESS_MUSIC_LUFS = -18
    const val LOUDNESS_AMBIANCE_LUFS = -22
    const val LOUDNESS_EVENTS_LUFS = -16
    val FADE_CHOICES_MS = intArrayOf(0, 500, 1000, 2000, 4000)
}
