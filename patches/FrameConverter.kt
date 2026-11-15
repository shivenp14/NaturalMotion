package com.posedetection.camera

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Rect
import androidx.camera.core.ImageProxy
import com.posedetection.LogCategory
import com.posedetection.PoseLog

/** Analysis thread only, including [release]. */
internal class FrameConverter {
    // NaturalMotion: rotate pixels once before MediaPipe. Tracking and detection then share
    // upright coordinates, without a rotated ROI or a second landmark-space rotation.
    private var upright: Bitmap? = null
    private var uprightCanvas: Canvas? = null
    private val rotationMatrix = Matrix()
    private var source: Bitmap? = null
    private var cropped: Bitmap? = null
    private var canvas: Canvas? = null
    private val sourceRect = Rect()
    private val destRect = Rect()

    private var strideWidth = 0
    private var frameWidth = 0
    private var frameHeight = 0

    /** Valid until the next call. */
    fun convert(proxy: ImageProxy): Bitmap {
        val raw = convertRaw(proxy)
        val rotation = Math.floorMod(proxy.imageInfo.rotationDegrees, 360)
        if (rotation == 0) return raw
        require(rotation == 90 || rotation == 180 || rotation == 270)

        val width = if (rotation == 180) raw.width else raw.height
        val height = if (rotation == 180) raw.height else raw.width
        if (upright?.width != width || upright?.height != height) {
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            upright = bitmap
            uprightCanvas = Canvas(bitmap)
        }
        rotationMatrix.setRotate(rotation.toFloat())
        when (rotation) {
            90 -> rotationMatrix.postTranslate(raw.height.toFloat(), 0f)
            180 -> rotationMatrix.postTranslate(raw.width.toFloat(), raw.height.toFloat())
            270 -> rotationMatrix.postTranslate(0f, raw.width.toFloat())
        }
        uprightCanvas!!.drawBitmap(raw, rotationMatrix, null)
        return upright!!
    }

    private fun convertRaw(proxy: ImageProxy): Bitmap {
        val plane = proxy.planes[0]
        val pixelStride = plane.pixelStride
        val stride = plane.rowStride / pixelStride

        prepare(stride, proxy.width, proxy.height)

        val buffer = plane.buffer
        buffer.rewind()
        val source = this.source!!
        source.copyPixelsFromBuffer(buffer)

        if (stride == proxy.width) return source

        val cropped = this.cropped!!
        canvas!!.drawBitmap(source, sourceRect, destRect, null)
        return cropped
    }

    private fun prepare(
        stride: Int,
        width: Int,
        height: Int,
    ) {
        if (stride == strideWidth && width == frameWidth && height == frameHeight) return

        release()
        strideWidth = stride
        frameWidth = width
        frameHeight = height

        // Full stride: copying padded rows into a width-wide bitmap shears the image.
        source = Bitmap.createBitmap(stride, height, Bitmap.Config.ARGB_8888)

        if (stride != width) {
            val cropped = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            this.cropped = cropped
            canvas = Canvas(cropped)
            sourceRect.set(0, 0, width, height)
            destRect.set(0, 0, width, height)
            PoseLog.debug(LogCategory.DETECTOR) { "row padding: stride $stride for width $width" }
        }
    }

    /** Safe between frames: MediaPipe copies the pixels before its detection returns. */
    fun release() {
        upright = null
        uprightCanvas = null
        source = null
        cropped = null
        canvas = null
        strideWidth = 0
        frameWidth = 0
        frameHeight = 0
    }
}
