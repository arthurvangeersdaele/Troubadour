package com.troubadour.app.audio

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import com.troubadour.app.data.Library
import com.troubadour.app.data.Zone
import com.troubadour.app.ui.TroubadourTokens
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.log10
import kotlin.math.pow

/**
 * "Even out the loudness", as on the web (troubadour-engine.js: analyse, gainOf): each sound is measured once,
 * its gated loudness in LUFS (400 ms blocks, absolute gate -70, relative gate -10, no K-weighting), then played at
 * the level of its kind (music -18, ambiance -22, events -16 LUFS), never more than 9 dB down or 6 dB up.
 *
 * The sound is decoded as a stream and only summed, so measuring takes almost no memory, whatever its length.
 * The result is kept next to the library (one small file per sound), so a sound is measured once per device.
 */
object Loudness {
    private val memo = ConcurrentHashMap<String, Float>()

    /** The loudness of a stored sound (LUFS), measured now if it never was. Null if it cannot be read. Slow: call it
     *  off the main and the engine threads. */
    fun lufsOf(blob: String): Float? {
        memo[blob]?.let { return it }
        val kept = Library.loudnessFile(blob)
        runCatching { kept.readText().trim().toFloat() }.getOrNull()?.let { memo[blob] = it; return it }
        val l = runCatching { measure(Library.blobFile(blob)) }.getOrNull() ?: return null
        memo[blob] = l
        runCatching { kept.parentFile?.mkdirs(); kept.writeText(l.toString()) }
        return l
    }

    /** The gain that brings a sound of this kind to its target loudness (1 when unknown). */
    fun gain(lufs: Float?, zone: Zone): Float {
        if (lufs == null || lufs <= -60f) return 1f
        val target = when (zone) {
            Zone.MUSIC -> TroubadourTokens.LOUDNESS_MUSIC_LUFS
            Zone.AMBIENCE -> TroubadourTokens.LOUDNESS_AMBIANCE_LUFS
            Zone.EVENTS -> TroubadourTokens.LOUDNESS_EVENTS_LUFS
        }.toFloat()
        val db = (target - lufs).coerceIn(-9f, 6f)
        return 10f.pow(db / 20f)
    }

    private fun lu(ms: Double) = -0.691 + 10.0 * log10(ms + 1e-12)

    private fun measure(file: File): Float? {
        if (!file.exists()) return null
        val ex = MediaExtractor()
        try {
            ex.setDataSource(file.absolutePath)
            var track = -1
            for (i in 0 until ex.trackCount) {
                if (ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; break }
            }
            if (track < 0) return null
            ex.selectTrack(track)
            val format = ex.getTrackFormat(track)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
            var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
            var float = false
            val codec = MediaCodec.createDecoderByType(mime)
            val blocks = ArrayList<Double>()
            var sum = 0.0
            var samples = 0L
            var frames = 0
            try {
                codec.configure(format, null, null, 0)
                codec.start()
                val info = MediaCodec.BufferInfo()
                var inputDone = false
                var idle = 0
                while (true) {
                    if (!inputDone) {
                        val ii = codec.dequeueInputBuffer(10_000)
                        if (ii >= 0) {
                            val buf = codec.getInputBuffer(ii) ?: return null
                            val n = ex.readSampleData(buf, 0)
                            if (n < 0) {
                                codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(ii, 0, n, ex.sampleTime, 0)
                                ex.advance()
                            }
                        }
                    }
                    val oi = codec.dequeueOutputBuffer(info, 10_000)
                    if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        val f = codec.outputFormat
                        rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
                        float = f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                            f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                        continue
                    }
                    if (oi < 0) {
                        // A decoder that stops answering is given up on (about 20 s without a frame).
                        if (++idle > 2000) return null
                        continue
                    }
                    idle = 0
                    val block = (rate * 0.4).toInt().coerceAtLeast(1)
                    val out = codec.getOutputBuffer(oi)
                    if (out != null && info.size > 0) {
                        out.order(ByteOrder.nativeOrder())
                        out.position(info.offset)
                        out.limit(info.offset + info.size)
                        if (float) {
                            val fb = out.asFloatBuffer()
                            while (fb.remaining() >= channels) {
                                repeat(channels) { val x = fb.get().toDouble(); sum += x * x }
                                samples += channels
                                if (++frames >= block) { blocks.add(sum / samples); sum = 0.0; samples = 0; frames = 0 }
                            }
                        } else {
                            val sb = out.asShortBuffer()
                            while (sb.remaining() >= channels) {
                                repeat(channels) { val x = sb.get() / 32768.0; sum += x * x }
                                samples += channels
                                if (++frames >= block) { blocks.add(sum / samples); sum = 0.0; samples = 0; frames = 0 }
                            }
                        }
                    }
                    codec.releaseOutputBuffer(oi, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                }
                if (samples > 0 && frames > rate / 10) blocks.add(sum / samples)
            } finally {
                runCatching { codec.stop() }
                codec.release()
            }
            var gated = blocks.filter { lu(it) > -70.0 }
            if (gated.isEmpty()) return -70f
            val rel = lu(gated.average()) - 10.0
            gated = gated.filter { lu(it) > rel }
            return if (gated.isEmpty()) -70f else lu(gated.average()).toFloat()
        } finally {
            ex.release()
        }
    }
}
