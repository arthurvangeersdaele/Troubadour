package com.troubadour.app.ui

import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.roundToInt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.lerp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.troubadour.app.troubadour.LoopMode
import com.troubadour.app.data.Library
import com.troubadour.app.data.Sound
import com.troubadour.app.data.Story
import com.troubadour.app.data.Zone
import com.troubadour.app.data.cleanName
import com.troubadour.app.data.formatSize
import com.troubadour.app.data.formatTime
import com.troubadour.app.data.plural

@Composable
fun Tabs(m: AppModel, current: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf("Stories" to { m.goLibrary() }, "Soundbox" to { m.goShared() }).forEachIndexed { i, (label, go) ->
            val on = i == current
            Box(
                Modifier
                    .height(36.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else Color.Transparent, RoundedCornerShape(9.dp))
                    .clickable(role = Role.Tab) { go() }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                T(label, color = if (on) C.text else C.muted, weight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun LibraryScreen(m: AppModel) {
    val stories by Library.stories.collectAsState()
    val recent by Library.recent.collectAsState()
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Bar {
            Title("Troubadour", 26)
            Spacer(Modifier.width(8.dp))
            Tabs(m, 0)
            Spacer(Modifier.weight(1f))
            IconBtn(BIcons.gear, "Settings") { m.settingsOpen = true }
        }
        if (stories.isEmpty()) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Eq(height = 18.dp, bar = 5.dp, modifier = Modifier.padding(bottom = 4.dp))
                    Title("Your table awaits", 32)
                    T(
                        "Rhythm a story with your own sounds, import a .troubadour file, or start from a tale of La Troupe.",
                        color = C.muted, size = 16.sp,
                    )
                }
                SectionLabel("Add a story")
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Door(BIcons.plus, "New story", "With your own sounds, from your files", DoorKind.NEW, Modifier.weight(1f)) { m.newStory() }
                    Door(BIcons.compass, "Discovery", "Three ready stories, sounds included", DoorKind.DISCOVERY, Modifier.weight(1f)) { m.openDiscovery() }
                    Door(BIcons.book, "The Recueil", "Tales rhythmed by other troubadours", DoorKind.RECUEIL, Modifier.weight(1f)) { m.openRecueil() }
                    Door(BIcons.files, "Import .troubadour", "From your files, a cloud drive or a download", DoorKind.IMPORT, Modifier.weight(1f)) { m.importTroubadour() }
                }
            }
            return@Column
        }
        // Layout B: the story opened last (or added last) in big, on its cover; the others in a list.
        val sorted = stories.sortedByDescending { recent[it.uid]?.at ?: 0L }
        val first = sorted.first()
        val rest = sorted.drop(1)
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= 600.dp
            val list: @Composable (Modifier) -> Unit = { mod ->
                Column(mod, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionLabel(if (rest.isEmpty()) "Your library" else "All stories")
                    rest.forEach { s -> StoryRow(m, s, recent[s.uid]) }
                    AddRow { m.sheet = Sheet.AddStory }
                }
            }
            if (wide) {
                Row(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Hero(m, first, recent[first.uid], Modifier.weight(1.15f))
                    list(Modifier.weight(1f))
                }
            } else {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Hero(m, first, recent[first.uid], Modifier.fillMaxWidth())
                    list(Modifier.fillMaxWidth())
                }
            }
        }
    }
}

private val HeroInk = Color(0xFFEFEAE0)
private val HeroMuted = Color(0xFFA3A3AF)

private fun sourceLabel(s: Story) = when {
    s.source.startsWith("discovery") -> "Discovery"
    s.source == "import" -> "Imported"
    else -> "Your story"
}

/** The story opened last: its cover on the right, where it stopped, and the way back in. */
@Composable
private fun Hero(m: AppModel, s: Story, r: Library.Recent?, modifier: Modifier) {
    val look = Library.coverOf(s)
    val c = Covers.color(look.color)
    val at = r?.chapter?.takeIf { it in s.chapters.indices }
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .heightIn(min = 270.dp)
            .clip(shape)
            .background(Covers.GROUND)
            .border(1.dp, lerp(Color(0xFF2A2B33), c, 0.38f), shape)
    ) {
        StoryCover(look, Modifier.matchParentSize(), framed = false, rightHalf = true)
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.clip(RoundedCornerShape(6.dp)).background(Color(0x8C0F0F13)).border(1.dp, c, RoundedCornerShape(6.dp))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) { T(sourceLabel(s).uppercase(), color = HeroInk, size = 10.sp, weight = FontWeight.Bold) }
                Text(
                    (if (at != null) "Last session" else "Just added").uppercase(), color = lerp(HeroInk, c, 0.6f),
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = Barlow, letterSpacing = 2.sp,
                )
            }
            val half = Modifier.fillMaxWidth(0.54f)
            Title(s.title.ifBlank { "Untitled story" }, 29, color = HeroInk, maxLines = 2, modifier = half)
            if (at != null) {
                T("Stopped in chapter ${at + 1}, ${s.chapters[at].title.ifBlank { "Untitled chapter" }}", color = Color(0xFFCFCAC0), size = 14.sp, maxLines = 2, modifier = half)
                Row(half.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    s.chapters.indices.forEach { i ->
                        Box(Modifier.weight(1f).height(5.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= at) c else HeroInk.copy(alpha = 0.16f)))
                    }
                }
            } else if (s.description.isNotBlank()) {
                T(s.description, color = Color(0xFFCFCAC0), size = 14.sp, maxLines = 2, modifier = half)
            }
            T(
                "${plural(s.chapters.size, "chapter")}, ${plural(s.allSounds().size, "sound")}, ${formatSize(Library.bytesOf(s.allSounds()))}",
                color = HeroMuted, size = 12.sp, maxLines = 1, modifier = half,
            )
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (at != null && at > 0) {
                    Btn("Resume at chapter ${at + 1}", icon = BIcons.play, kind = BtnKind.PRIMARY, height = 44.dp) { m.openTable(s.uid, at) }
                    HeroGhost("From the start") { m.openTable(s.uid, 0) }
                } else {
                    Btn(if (at != null) "Resume" else "Play", icon = BIcons.play, kind = BtnKind.PRIMARY, height = 44.dp) { m.openTable(s.uid, at ?: 0) }
                }
                IconBtn(BIcons.more, "More: ${s.title}", size = 44.dp, tint = HeroInk, background = Color(0x730F0F13), border = HeroInk.copy(alpha = 0.22f)) {
                    m.sheet = Sheet.StoryMenu(s.uid)
                }
            }
        }
    }
}

@Composable
private fun HeroGhost(text: String, onClick: () -> Unit) {
    Box(
        Modifier.height(44.dp).clip(RoundedCornerShape(10.dp)).background(Color(0x730F0F13))
            .border(1.dp, HeroInk.copy(alpha = 0.22f), RoundedCornerShape(10.dp))
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { T(text, color = HeroInk, size = 15.sp, weight = FontWeight.SemiBold, maxLines = 1) }
}

@Composable
private fun StoryRow(m: AppModel, s: Story, r: Library.Recent?) {
    val look = Library.coverOf(s)
    val c = Covers.color(look.color)
    val at = r?.chapter?.takeIf { it in s.chapters.indices }
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(C.card).border(1.dp, C.line, shape).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StoryCover(look, Modifier.width(64.dp).height(46.dp).clip(RoundedCornerShape(10.dp)).border(1.5.dp, c, RoundedCornerShape(10.dp)), framed = false)
        Column(Modifier.weight(1f)) {
            Title(s.title.ifBlank { "Untitled story" }, 19, maxLines = 1)
            T(
                if (at != null) "${sourceLabel(s)}, chapter ${at + 1} last time"
                else "${sourceLabel(s)}, ${plural(s.chapters.size, "chapter")}, ${plural(s.allSounds().size, "sound")}",
                color = C.muted, size = 12.sp, maxLines = 1,
            )
        }
        IconBtn(BIcons.more, "More: ${s.title}", size = 38.dp, tint = C.muted, background = Color.Transparent, border = Color.Transparent) {
            m.sheet = Sheet.StoryMenu(s.uid)
        }
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(C.accent)
                .clickable(role = Role.Button, onClickLabel = if (at != null) "Resume ${s.title}" else "Play ${s.title}") { m.openTable(s.uid, at ?: 0) },
            contentAlignment = Alignment.Center,
        ) { Icon(BIcons.play, null, tint = C.onZ, modifier = Modifier.size(16.dp).padding(start = 2.dp)) }
    }
}

@Composable
private fun AddRow(onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val dash = C.line
    Row(
        Modifier.fillMaxWidth().clip(shape)
            .drawBehind {
                drawRoundRect(
                    color = dash, cornerRadius = CornerRadius(14.dp.toPx()),
                    style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
                )
            }
            .clickable(role = Role.Button, onClick = onClick).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(64.dp).height(44.dp).clip(RoundedCornerShape(10.dp)).background(C.accent.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(BIcons.plus, null, tint = C.accent, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f)) {
            Title("Add a story", 19, maxLines = 1)
            T("New, Discovery, Recueil or a .troubadour file", color = C.muted, size = 12.sp, maxLines = 1)
        }
    }
}

/** Behind the ⋯ of a story: its chapters, edit, export, delete. */
@Composable
internal fun StoryMenuBody(m: AppModel, uid: String) {
    val s = Library.stories.collectAsState().value.firstOrNull { it.uid == uid } ?: return
    val go = { f: () -> Unit -> { m.sheet = null; f() } }
    val by = listOfNotNull(sourceLabel(s), s.bard.takeIf { it.isNotBlank() }?.let { "by $it" }, s.revision.takeIf { it > 0 }?.let { "revision $it" })
    Text(by.joinToString(", ").uppercase(), color = C.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp, fontFamily = Barlow)
    s.chapters.forEachIndexed { i, ch ->
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(10.dp))
                .clickable(role = Role.Button, onClickLabel = "Play chapter ${i + 1}", onClick = go { m.openTable(s.uid, i) })
                .padding(horizontal = 12.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Title("${i + 1}", 16, color = C.accent, modifier = Modifier.width(16.dp), align = TextAlign.End)
            T(ch.title.ifBlank { "Untitled chapter" }, maxLines = 1)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
        Btn("Edit", icon = BIcons.edit, modifier = Modifier.weight(1f), onClick = go { m.openEditor(s.uid, 0) })
        Btn("Export", icon = BIcons.share, modifier = Modifier.weight(1f), onClick = go { m.exportStories(listOf(s)) })
        Btn("Delete", icon = BIcons.trash, kind = BtnKind.DANGER, modifier = Modifier.weight(1f), onClick = go { m.deleteStory(s) })
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(
        text.uppercase(), color = C.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = Barlow,
        letterSpacing = 2.sp, modifier = Modifier.padding(top = 6.dp, start = 2.dp),
    )
}

internal enum class DoorKind { NEW, DISCOVERY, RECUEIL, IMPORT }

/** One of the four ways to add a story: identical tiles, content at the top left (as in the iPhone app). */
@Composable
internal fun Door(icon: ImageVector, title: String, text: String, kind: DoorKind, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val isNew = kind == DoorKind.NEW
    val iconColor = when (kind) {
        DoorKind.DISCOVERY -> C.amb
        DoorKind.IMPORT -> C.blue
        else -> C.accent
    }
    Column(
        modifier
            .height(104.dp)
            .clip(shape)
            .background(if (isNew) lerp(C.card, C.accent, 0.09f) else C.card)
            .border(1.dp, if (isNew) lerp(C.line, C.accent, 0.6f) else C.line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(Modifier.height(22.dp), contentAlignment = Alignment.CenterStart) {
            Icon(icon, null, tint = iconColor, modifier = Modifier.size(20.dp))
        }
        Title(title, 20, color = if (kind == DoorKind.RECUEIL) C.accent else C.text)
        T(text, color = C.muted, size = 13.sp, maxLines = 2)
    }
}

// ---------------------------------------------------------------------- shared soundbox

@Composable
fun SharedScreen(m: AppModel) {
    val shared by Library.shared.collectAsState()
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Bar {
            Title("Troubadour", 26)
            Spacer(Modifier.width(8.dp))
            Tabs(m, 1)
            Spacer(Modifier.weight(1f))
            Btn("Add effects", icon = BIcons.plus, kind = BtnKind.PRIMARY) { m.openPicker(Target.Shared) }
            IconBtn(BIcons.gear, "Settings") { m.settingsOpen = true }
        }
        T(
            "Your shared soundbox: quick effects ready on every table, next to each story's own effects.",
            color = C.muted, size = 15.sp, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp),
        )
        LazyVerticalGrid(
            columns = GridCells.Adaptive(232.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            itemsIndexed(shared, key = { _, s -> s.uid }) { i, s ->
                EditCard(m, Target.Shared, s, i, shared.size, C.accent, Modifier.height(104.dp))
            }
            item {
                AddTile(
                    if (shared.isEmpty()) "Add your first effects: critical hits, level ups, explosions" else "Add more",
                    C.accent, Modifier.height(104.dp),
                ) { m.openPicker(Target.Shared) }
            }
        }
    }
}

/** A sound card in the editor: name, remove, listen, size, move, loop. */
@Composable
fun EditCard(m: AppModel, t: Target, s: Sound, index: Int, count: Int, z: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    val playing = s.uid in m.previewing
    var name by remember(s.uid) { mutableStateOf(s.name) }
    Column(
        modifier
            .width(236.dp)
            .clip(shape)
            .background(C.card)
            .border(1.dp, if (playing) z else C.line, shape)
            .padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Field(
                value = name,
                onChange = { name = it; m.updateSound(t, s.uid) { x -> x.copy(name = it) } },
                modifier = Modifier.weight(1f),
                max = 80,
                border = false,
                style = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
                onFocusLost = {
                    if (name.isBlank()) {
                        name = cleanName(s.fileName)
                        m.updateSound(t, s.uid) { x -> x.copy(name = name) }
                    }
                },
            )
            IconBtn(BIcons.close, "Remove ${s.name}", size = 30.dp, iconSize = 14.dp, background = Color.Transparent, border = Color.Transparent, tint = C.muted) {
                m.removeSound(t, s.uid)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            IconBtn(
                if (playing) BIcons.pause else BIcons.play, "Listen to ${s.name}", size = 32.dp, iconSize = 13.dp,
                background = if (playing) z else C.line, border = if (playing) z else C.line, tint = if (playing) C.onZ else C.text,
            ) { m.togglePreview(s, t) }
            T(
                listOfNotNull(s.duration?.let { formatTime(it) }, formatSize(s.size)).joinToString("  "),
                color = C.muted, size = 12.sp, maxLines = 1, modifier = Modifier.weight(1f),
            )
            IconBtn(BIcons.left, "Move earlier", size = 28.dp, iconSize = 12.dp, enabled = index > 0) { m.moveSound(t, index, -1) }
            IconBtn(BIcons.right, "Move later", size = 28.dp, iconSize = 12.dp, enabled = index < count - 1) { m.moveSound(t, index, 1) }
            // Soundbox effects fire once per tap: no loop button for them.
            if (t is Target.ChapterZone) LoopChip(s.loop, height = 24.dp) { m.updateSound(t, s.uid) { x -> x.copy(loop = x.loop.next(allowRandom = t.zone != Zone.MUSIC)) } }
        }
        // Default volume: the level the sound starts at on the table.
        Row(Modifier.height(28.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            T("Volume", color = C.muted, size = 12.sp)
            BardSlider(
                s.volume, { v -> m.updateSound(t, s.uid) { x -> x.copy(volume = (v * 20f).roundToInt() / 20f) } }, z,
                Modifier.weight(1f).height(28.dp), label = "Default volume of ${s.name}",
            )
            T("${(s.volume * 100).roundToInt()}", color = C.muted, size = 12.sp, weight = FontWeight.SemiBold, align = TextAlign.End, modifier = Modifier.width(28.dp))
        }
    }
}

@Composable
fun LoopChip(loop: LoopMode, height: androidx.compose.ui.unit.Dp = 26.dp, onClick: () -> Unit) {
    val inf = loop == LoopMode.INFINITE
    val rnd = loop == LoopMode.RANDOM
    val color = when {
        inf -> C.blue
        rnd -> C.evt
        else -> C.text
    }
    Box(
        Modifier
            .height(height)
            .width(38.dp)
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, if (inf || rnd) color.copy(alpha = 0.6f) else C.line, RoundedCornerShape(6.dp))
            .clickable(role = Role.Button, onClickLabel = "Loop: once, twice, forever, random", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (rnd) Icon(BIcons.random, "Random", tint = color, modifier = Modifier.size(15.dp))
        else T(listOf("1×", "2×", "∞")[loop.ordinal], color = color, size = 13.sp, weight = FontWeight.SemiBold)
    }
}

@Composable
fun AddTile(text: String, z: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .width(236.dp)
            .fillMaxHeight()
            .clip(shape)
            .border(1.dp, z.copy(alpha = 0.7f), shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(BIcons.plus, null, tint = z, modifier = Modifier.size(18.dp))
        T(text, color = z, weight = FontWeight.SemiBold, size = 14.sp, maxLines = 3)
    }
}

/** The four ways to add a story, behind the + of the top bar. */
@Composable
internal fun AddStoryBody(m: AppModel) {
    val go = { f: () -> Unit -> { m.sheet = null; f() } }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Door(BIcons.plus, "New story", "With your own sounds, from your files", DoorKind.NEW, Modifier.weight(1f), go { m.newStory() })
            Door(BIcons.compass, "Discovery", "Three ready stories, sounds included", DoorKind.DISCOVERY, Modifier.weight(1f), go { m.openDiscovery() })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Door(BIcons.book, "The Recueil", "Tales rhythmed by other troubadours", DoorKind.RECUEIL, Modifier.weight(1f), go { m.openRecueil() })
            Door(BIcons.files, "Import .troubadour", "From your files, a cloud drive or a download", DoorKind.IMPORT, Modifier.weight(1f), go { m.importTroubadour() })
        }
    }
}
