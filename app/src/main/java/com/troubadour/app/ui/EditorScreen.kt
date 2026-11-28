package com.troubadour.app.ui

import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.troubadour.app.data.Sound
import com.troubadour.app.data.Zone
import com.troubadour.app.data.plural

@Composable
fun zoneColor(z: Zone): Color = when (z) {
    Zone.MUSIC -> C.music
    Zone.AMBIENCE -> C.amb
    Zone.EVENTS -> C.evt
}

/** Vertical label at the start of a zone row. */
@Composable
fun ZoneLabel(text: String, color: Color) {
    Row(Modifier.width(28.dp).fillMaxHeight().clip(RoundedCornerShape(8.dp)).background(C.bar)) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(color))
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            T(
                text.uppercase(), color = color, maxLines = 1,
                style = titleStyle(13).copy(letterSpacing = 1.5.sp),
                modifier = Modifier
                    .layout { measurable, _ ->
                        val p = measurable.measure(Constraints())
                        layout(p.height, p.width) { p.place(-(p.width - p.height) / 2, (p.width - p.height) / 2) }
                    }
                    .rotate(-90f),
            )
        }
    }
}

@Composable
fun EditorScreen(m: AppModel) {
    val e = m.ed ?: return
    val story = e.story
    var title by remember(story.uid) { mutableStateOf(story.title) }
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Bar {
            IconBtn(BIcons.back, "Back to stories") { m.goLibrary() }
            Field(
                value = title,
                onChange = { title = it; m.edit { s -> s.copy(title = it) } },
                modifier = Modifier.weight(1f),
                placeholder = "Story title",
                style = titleStyle(22),
                onFocusLost = { if (title.isBlank()) { title = "Untitled story"; m.edit { s -> s.copy(title = title) } } },
            )
            T(e.saved, color = C.muted, size = 13.sp)
            IconBtn(BIcons.info, "Story details") { m.sheet = Sheet.StoryInfo }
            IconBtn(BIcons.share, "Export as .troubadour") { m.exportStories(listOf(story)) }
            Btn("Play", icon = BIcons.play, kind = BtnKind.PRIMARY) { m.openTable(story.uid, e.chapter.coerceAtLeast(0)) }
        }
        Row(Modifier.fillMaxSize()) {
            EditorRail(m, e)
            Column(Modifier.weight(1f).fillMaxHeight().padding(start = 10.dp, top = 8.dp, bottom = 8.dp)) {
                if (e.chapter == IO_PAGE) {
                    IntroOutroPage(m, story)
                } else if (e.chapter < 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(BIcons.starFill, null, tint = C.accent, modifier = Modifier.size(20.dp))
                        Title("Story soundbox", 22)
                    }
                    T(
                        "Quick effects for this story only. They sit next to your shared soundbox on the table.",
                        color = C.muted, size = 14.sp, modifier = Modifier.padding(vertical = 6.dp),
                    )
                    EditZoneRow(m, Target.StorySoundbox, "Soundbox", C.accent, story.soundbox,
                        "Add quick effects: critical hits, level ups", Modifier.height(120.dp))
                } else {
                    val ch = story.chapters.getOrNull(e.chapter) ?: return@Column
                    var chTitle by remember(ch.uid) { mutableStateOf(ch.title) }
                    Row(
                        Modifier.padding(end = 10.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Title("${e.chapter + 1}", 22, color = C.accent)
                        Field(
                            value = chTitle,
                            onChange = { v ->
                                chTitle = v
                                m.edit { s -> s.copy(chapters = s.chapters.map { if (it.uid == ch.uid) it.copy(title = v) else it }) }
                            },
                            modifier = Modifier.weight(1f),
                            placeholder = "Chapter title",
                            style = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 17.sp),
                        )
                        Btn("Remove", icon = BIcons.trash, kind = BtnKind.DANGER, enabled = story.chapters.size > 1, height = 38.dp) {
                            m.removeChapter(e.chapter)
                        }
                    }
                    // Rows keep the room of a full card (name, controls, volume) and the column scrolls on short screens.
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Zone.values().forEach { z ->
                            EditZoneRow(
                                m, Target.ChapterZone(ch.uid, z), z.label, zoneColor(z), ch.sounds(z),
                                z.hint, Modifier.height(120.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The editor's page for the intro and outro: a music of the story for each, and an alert when the setting is off. */
const val IO_PAGE = -2

@Composable
private fun IntroOutroPage(m: AppModel, story: com.troubadour.app.data.Story) {
    Column(Modifier.fillMaxSize().padding(end = 10.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IntroOutroIcon(C.music, Modifier.size(22.dp))
            Title("Intro and outro", 22)
        }
        if (!m.settings.introOutro) {
            val shape = RoundedCornerShape(12.dp)
            Row(
                Modifier.fillMaxWidth().clip(shape).background(C.evt.copy(alpha = 0.14f)).border(1.dp, C.evt.copy(alpha = 0.45f), shape).padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                T("⚠", color = C.evt, size = 16.sp, weight = FontWeight.SemiBold)
                T("The setting Intro and outro is off: they are not offered at the table.", size = 14.sp, modifier = Modifier.weight(1f))
                Btn("Settings", height = 34.dp) { m.settingsOpen = true }
            }
        }
        T(
            "The intro is offered as the story opens at the table, the outro before leaving it. Each plays once, whatever its loop, and as the outro starts every other sound fades out.",
            color = C.muted, size = 14.sp,
        )
        val musics = story.chapters.flatMapIndexed { i, c -> c.music.map { s -> Triple(i, c, s) } }
        if (musics.isEmpty()) T("Add a music to a chapter first.", color = C.muted, size = 14.sp)
        musics.forEach { (i, c, s) ->
            val shape = RoundedCornerShape(12.dp)
            Row(
                Modifier.fillMaxWidth().clip(shape).background(C.card).border(1.dp, if (s.role != null) C.music.copy(alpha = 0.6f) else C.line, shape).padding(start = 12.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    T(s.name, weight = FontWeight.SemiBold, size = 15.sp, maxLines = 1)
                    T(c.title.ifBlank { "Chapter ${i + 1}" }, color = C.muted, size = 12.sp, maxLines = 1)
                }
                listOf("intro" to "Intro", "outro" to "Outro").forEach { (r, label) ->
                    val on = s.role == r
                    Box(
                        Modifier.height(34.dp).width(64.dp).clip(RoundedCornerShape(12.dp))
                            .background(if (on) C.music else Color.Transparent)
                            .border(1.dp, if (on) C.music else C.line, RoundedCornerShape(12.dp))
                            .clickable(role = Role.Checkbox, onClickLabel = "$label of the story") { m.setRole(s.uid, if (on) null else r) },
                        contentAlignment = Alignment.Center,
                    ) { T(label, color = if (on) C.onZ else C.text, size = 14.sp, weight = FontWeight.SemiBold) }
                }
            }
        }
    }
}

/** The intro and outro icon: a note, an arrow coming in bottom left and one going out top right, with the note cut
 *  around them (the web's TroubadourIntro.icon, on a 24 grid). */
@Composable
fun IntroOutroIcon(tint: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier.graphicsLayer(compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen)) {
        val k = size.minDimension / 24f
        fun p(d: String) = androidx.compose.ui.graphics.vector.PathParser().parsePathString(d).toPath()
        val round = androidx.compose.ui.graphics.StrokeCap.Round
        val join = androidx.compose.ui.graphics.StrokeJoin.Round
        val line = androidx.compose.ui.graphics.drawscope.Stroke(1.9f, cap = round, join = join)
        val cut = androidx.compose.ui.graphics.drawscope.Stroke(4.5f, cap = round, join = join)
        val clear = androidx.compose.ui.graphics.BlendMode.Clear
        scale(k, k, androidx.compose.ui.geometry.Offset.Zero) {
            // The note.
            drawPath(p("M11.4 16.2V7.4l6.5-1.5v8.8"), tint, style = line)
            drawCircle(tint, 1.9f, androidx.compose.ui.geometry.Offset(9.5f, 16.2f), style = line)
            drawCircle(tint, 1.9f, androidx.compose.ui.geometry.Offset(16f, 14.7f), style = line)
            val shafts = listOf(p("M1.2 19H5"), p("M14.2 4.6h5"))
            val heads = listOf(p("M8.4 19l-4.2-2.7v5.4z"), p("M23 4.6l-4.2-2.7v5.4z"))
            // The gap: the arrows, wider, cut the note.
            (shafts + heads).forEach { drawPath(it, Color.Black, style = cut, blendMode = clear) }
            heads.forEach { drawPath(it, Color.Black, blendMode = clear) }
            // The arrows, heads full.
            shafts.forEach { drawPath(it, tint, style = line) }
            heads.forEach { drawPath(it, tint); drawPath(it, tint, style = line) }
        }
    }
}

@Composable
private fun EditZoneRow(m: AppModel, t: Target, label: String, z: Color, list: List<Sound>, hint: String, modifier: Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ZoneLabel(label, z)
        LazyRow(
            Modifier.fillMaxHeight(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(end = 10.dp),
        ) {
            itemsIndexed(list, key = { _, s -> s.uid }) { i, s ->
                EditCard(m, t, s, i, list.size, z, Modifier.fillMaxHeight())
            }
            item(key = "add") {
                AddTile(if (list.isEmpty()) hint else "Add more", z) { m.openPicker(t) }
            }
        }
    }
}

@Composable
private fun EditorRail(m: AppModel, e: EditorState) {
    LazyColumn(
        Modifier.width(if (narrow()) 128.dp else 186.dp).fillMaxHeight().background(C.bar),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        item { T("CHAPTERS", color = C.muted, size = 12.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(6.dp)) }
        itemsIndexed(e.story.chapters, key = { _, c -> c.uid }) { i, c ->
            val on = e.chapter == i
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable(role = Role.Tab) { m.selectChapter(i) }
                    .padding(start = 8.dp, top = 6.dp, bottom = 6.dp, end = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Title("${i + 1}", 18, color = C.accent)
                Column(Modifier.weight(1f)) {
                    T(c.title.ifBlank { "Chapter ${i + 1}" }, color = if (on) C.text else C.muted, size = 14.sp, weight = FontWeight.SemiBold, maxLines = 2)
                    T(plural(c.soundCount, "sound"), color = C.muted, size = 12.sp)
                }
                Column {
                    IconBtn(BIcons.up, "Move chapter up", size = 24.dp, iconSize = 12.dp, background = Color.Transparent, border = Color.Transparent, enabled = i > 0) { m.moveChapter(i, -1) }
                    IconBtn(BIcons.down, "Move chapter down", size = 24.dp, iconSize = 12.dp, background = Color.Transparent, border = Color.Transparent, enabled = i < e.story.chapters.lastIndex) { m.moveChapter(i, 1) }
                }
            }
        }
        item {
            Btn("Add a chapter", icon = BIcons.plus, modifier = Modifier.fillMaxWidth().padding(top = 4.dp), height = 38.dp) { m.addChapter() }
        }
        item {
            val on = e.chapter == -1
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else C.line.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
                    .clickable(role = Role.Tab) { m.selectChapter(-1) }
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(BIcons.starFill, null, tint = C.accent, modifier = Modifier.size(18.dp))
                Column {
                    T("Soundbox", weight = FontWeight.SemiBold, size = 14.sp)
                    T(plural(e.story.soundbox.size, "effect"), color = C.muted, size = 12.sp)
                }
            }
        }
        item {
            val on = e.chapter == IO_PAGE
            val set = e.story.chapters.any { c -> c.music.any { it.role != null } }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else C.line.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
                    .clickable(role = Role.Tab) { m.selectChapter(IO_PAGE) }
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box {
                    IntroOutroIcon(C.music, Modifier.size(18.dp))
                    // The small alert: an intro or outro is set, but the setting is off.
                    if (set && !m.settings.introOutro) Box(Modifier.align(Alignment.TopEnd).padding(start = 12.dp).size(7.dp).clip(androidx.compose.foundation.shape.CircleShape).background(C.evt))
                }
                Column {
                    T("Intro and outro", weight = FontWeight.SemiBold, size = 14.sp)
                    T(if (set) "Set" else "None", color = C.muted, size = 12.sp)
                }
            }
        }
    }
}
