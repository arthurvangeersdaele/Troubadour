package com.troubadour.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.troubadour.app.R
import com.troubadour.app.settings.Appearance
import com.troubadour.app.settings.ThemeName

/** The colours of a theme, the same tokens as every web surface (docs/shared/troubadour.tokens.json). */
@Immutable
data class TroubadourColors(
    val bg: Color, val bar: Color, val card: Color, val line: Color,
    val text: Color, val muted: Color, val accent: Color,
    val music: Color, val amb: Color, val evt: Color, val blue: Color, val onZ: Color,
    val dark: Boolean,
    /** Pride: the flag runs along the top bar. */
    val rainbow: Boolean = false,
)

/** The pride flag, for the top bar of the Pride theme. */
val PrideFlag = listOf(0xFFE40303, 0xFFFF8C00, 0xFFFFED00, 0xFF008026, 0xFF004DFF, 0xFF750787).map { Color(it) }

/** The palette of a theme, read from the shared design tokens (TroubadourTokens.kt, built from
 *  docs/shared/troubadour.tokens.json, the same source as the web's docs/shared/tokens.css). */
fun paletteOf(theme: ThemeName, dark: Boolean): TroubadourColors {
    fun c(hex: Long) = Color(0xFF000000 or hex)
    // Limited editions: one look whatever the appearance.
    val key = if (theme.special) "${theme.id}.any" else "${theme.id}.${if (dark) "dark" else "light"}"
    val v = TroubadourTokens.palettes[key]
        ?: TroubadourTokens.palettes.getValue(if (dark) "obsidian.dark" else "obsidian.light")
    val isDark = if (theme.special) theme.id !in TroubadourTokens.lightSpecials else dark
    return TroubadourColors(
        c(v[0]), c(v[1]), c(v[2]), c(v[3]), c(v[4]), c(v[5]), c(v[6]),
        c(v[7]), c(v[8]), c(v[9]), c(v[10]), c(v[11]), isDark,
        rainbow = theme == ThemeName.PRIDE,
    )
}

val Cormorant = FontFamily(Font(R.font.cormorant_sc_bold, FontWeight.Bold))
val Barlow = FontFamily(
    Font(R.font.barlow_sc_regular, FontWeight.Normal),
    Font(R.font.barlow_sc_medium, FontWeight.Medium),
    Font(R.font.barlow_sc_semibold, FontWeight.SemiBold),
)

val LocalColors = staticCompositionLocalOf { paletteOf(ThemeName.OBSIDIAN, true) }

/** Shortcut for the current palette inside composables. */
val C: TroubadourColors
    @Composable get() = LocalColors.current

fun titleStyle(size: Int) = TextStyle(fontFamily = Cormorant, fontWeight = FontWeight.Bold, fontSize = size.sp)

@Composable
fun TroubadourTheme(theme: ThemeName, appearance: Appearance, content: @Composable () -> Unit) {
    val dark = when (appearance) {
        Appearance.DARK -> true
        Appearance.LIGHT -> false
        Appearance.SYSTEM -> isSystemInDarkTheme()
    }
    val p = paletteOf(theme, dark)
    val scheme = if (p.dark) darkColorScheme(
        primary = p.accent, onPrimary = p.onZ, background = p.bg, onBackground = p.text,
        surface = p.card, onSurface = p.text, surfaceVariant = p.bar, onSurfaceVariant = p.muted, outline = p.line,
    ) else lightColorScheme(
        primary = p.accent, onPrimary = p.onZ, background = p.bg, onBackground = p.text,
        surface = p.card, onSurface = p.text, surfaceVariant = p.bar, onSurfaceVariant = p.muted, outline = p.line,
    )
    val type = MaterialTheme.typography.let { t ->
        t.copy(
            bodyLarge = t.bodyLarge.copy(fontFamily = Barlow),
            bodyMedium = t.bodyMedium.copy(fontFamily = Barlow),
            bodySmall = t.bodySmall.copy(fontFamily = Barlow),
            labelLarge = t.labelLarge.copy(fontFamily = Barlow),
            labelMedium = t.labelMedium.copy(fontFamily = Barlow),
            labelSmall = t.labelSmall.copy(fontFamily = Barlow),
            titleMedium = t.titleMedium.copy(fontFamily = Barlow),
        )
    }
    CompositionLocalProvider(LocalColors provides p) {
        MaterialTheme(colorScheme = scheme, typography = type, content = content)
    }
}

/** Kept for the engine test screen. */
object Obsidian {
    val Background = Color(0xFF0F0F13)
    val Bar = Color(0xFF15151B)
    val Card = Color(0xFF1C1C24)
    val Line = Color(0xFF2E2E39)
    val Text = Color(0xFFECE8DE)
    val Muted = Color(0xFFA29FAE)
    val Music = Color(0xFFE0A84B)
    val Ambience = Color(0xFF4FB3A5)
    val Events = Color(0xFFE06A63)
    val ElectricBlue = Color(0xFF2F8BFF)
}
