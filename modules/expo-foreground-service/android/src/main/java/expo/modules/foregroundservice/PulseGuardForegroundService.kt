package expo.modules.foregroundservice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

/**
 * PulseGuardForegroundService — Android foreground service (type: health)
 *
 * Sends periodic heartbeat snapshots to the PulseGuard backend while the
 * app is in the background. The JS timer in WaitingScreen handles foreground
 * checks; this service ensures continuity when the JS thread is suspended.
 *
 * Milestone 1: heartbeat only (no motion sensors). Sends
 * submitPulseGuardSnapshot with background_heartbeat=true.
 * Milestone 2: enriches heartbeat with motion sensor summary
 * (accelerometer + gyroscope, SENSOR_DELAY_NORMAL).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */
class PulseGuardForegroundService : Service(), SensorEventListener {

    companion object {
        private const val TAG = "PulseGuardFGService"
        private const val CHANNEL_ID = "pulseguard_monitoring"
        private const val NOTIFICATION_ID = 1001

        const val EXTRA_API_URL = "api_url"
        const val EXTRA_API_KEY = "api_key"
        const val EXTRA_LINK_TOKEN = "link_token"
        const val EXTRA_HCS_SESSION_ID = "hcs_session_public_id"
        const val EXTRA_CHECK_FREQ_MS = "check_freq_ms"
        const val EXTRA_SOURCE = "source"
        const val EXTRA_VERSION = "version"

        @Volatile
        private var running: Boolean = false
        val isRunning: Boolean get() = running

        // Threshold for classifying motion state (m/s²)²
        // Below → stationary, above → carried
        private const val ACCEL_VARIANCE_THRESHOLD = 0.5f
    }

    private val handler = Handler(Looper.getMainLooper())
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private var apiUrl: String = ""
    private var apiKey: String = ""
    private var linkToken: String = ""
    private var hcsSessionId: String = ""
    private var checkFreqMs: Long = 60_000L
    private var source: String = "pulseguard_mobile"
    private var version: String = "1.0.0"

    // ── Motion sensors ──
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    // Accumulation buffers (reset after each heartbeat)
    private val accelMagnitudes = mutableListOf<Float>()
    private val gyroMagnitudes = mutableListOf<Float>()

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            sendHeartbeat()
            handler.postDelayed(this, checkFreqMs)
        }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        createNotificationChannel()
        initSensors()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.let {
            apiUrl = it.getStringExtra(EXTRA_API_URL) ?: apiUrl
            apiKey = it.getStringExtra(EXTRA_API_KEY) ?: apiKey
            linkToken = it.getStringExtra(EXTRA_LINK_TOKEN) ?: linkToken
            hcsSessionId = it.getStringExtra(EXTRA_HCS_SESSION_ID) ?: hcsSessionId
            checkFreqMs = it.getLongExtra(EXTRA_CHECK_FREQ_MS, checkFreqMs)
            source = it.getStringExtra(EXTRA_SOURCE) ?: source
            version = it.getStringExtra(EXTRA_VERSION) ?: version
        }

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ requires ACTIVITY_RECOGNITION granted at runtime
            // for FOREGROUND_SERVICE_TYPE_HEALTH. Without it, startForeground
            // throws SecurityException. Check defensively — the permission may
            // have been revoked after consent.
            val hasActivityRecognition = ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasActivityRecognition) {
                Log.e(TAG, "ACTIVITY_RECOGNITION not granted — cannot start health foreground service")
                running = false
                stopSelf()
                return START_NOT_STICKY
            }

            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Start sensor listeners (SENSOR_DELAY_NORMAL for battery efficiency)
        registerSensors()

        // Start heartbeat cycle
        handler.removeCallbacks(heartbeatRunnable)
        handler.postDelayed(heartbeatRunnable, checkFreqMs)

        Log.i(TAG, "Service started — heartbeat every ${checkFreqMs}ms")
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(heartbeatRunnable)
        unregisterSensors()
        running = false
        Log.i(TAG, "Service stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── SensorEventListener ──

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val values = event.values
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val mag = sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2])
                synchronized(accelMagnitudes) { accelMagnitudes.add(mag) }
            }
            Sensor.TYPE_GYROSCOPE -> {
                val mag = sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2])
                synchronized(gyroMagnitudes) { gyroMagnitudes.add(mag) }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── Sensor lifecycle ──

    private fun initSensors() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    }

    private fun registerSensors() {
        val sm = sensorManager ?: return
        accelerometer?.let {
            sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
            Log.i(TAG, "Accelerometer registered")
        } ?: Log.w(TAG, "No accelerometer available")
        gyroscope?.let {
            sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
            Log.i(TAG, "Gyroscope registered")
        } ?: Log.w(TAG, "No gyroscope available")
    }

    private fun unregisterSensors() {
        sensorManager?.unregisterListener(this)
    }

    // ── Motion summary ──

    private data class MotionSummary(
        val accelMean: Float,
        val accelVariance: Float,
        val gyroMean: Float,
        val gyroVariance: Float,
        val samples: Int,
        val motionState: String, // "stationary" | "carried" | "unknown"
    )

    private fun computeMotionSummary(): MotionSummary {
        val accelCopy: List<Float>
        val gyroCopy: List<Float>
        synchronized(accelMagnitudes) { accelCopy = accelMagnitudes.toList() }
        synchronized(gyroMagnitudes) { gyroCopy = gyroMagnitudes.toList() }

        if (accelCopy.isEmpty()) {
            return MotionSummary(0f, 0f, 0f, 0f, 0, "unknown")
        }

        // Accelerometer stats
        val accelMean = accelCopy.sum() / accelCopy.size
        val accelVariance = if (accelCopy.size > 1) {
            accelCopy.map { (it - accelMean) * (it - accelMean) }.sum() / accelCopy.size
        } else 0f

        // Gyroscope stats
        val gyroMean = if (gyroCopy.isNotEmpty()) gyroCopy.sum() / gyroCopy.size else 0f
        val gyroVariance = if (gyroCopy.size > 1) {
            gyroCopy.map { (it - gyroMean) * (it - gyroMean) }.sum() / gyroCopy.size
        } else 0f

        // Classify motion state
        val motionState = when {
            accelVariance < ACCEL_VARIANCE_THRESHOLD -> "stationary"
            else -> "carried"
        }

        return MotionSummary(accelMean, accelVariance, gyroMean, gyroVariance, accelCopy.size, motionState)
    }

    private fun resetMotionBuffers() {
        synchronized(accelMagnitudes) { accelMagnitudes.clear() }
        synchronized(gyroMagnitudes) { gyroMagnitudes.clear() }
    }

    // ── Notification ──

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PulseGuard Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifications for PulseGuard workplace safety monitoring"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("PulseGuard — Monitoring actif")
            .setContentText("Surveillance de présence en cours")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build()
    }

    // ── Heartbeat HTTP ──

    private fun sendHeartbeat() {
        Log.d(TAG, "sendHeartbeat() triggered — preparing payload")
        try {
            val nowIso = java.time.Instant.now().toString()

            // Compute motion summary from accumulated sensor readings
            val motion = computeMotionSummary()
            Log.d(TAG, "MotionSummary: state=${motion.motionState}, accelVar=${motion.accelVariance}, gyroVar=${motion.gyroVariance}, accelMean=${motion.accelMean}, gyroMean=${motion.gyroMean}, samples=${motion.samples}")
            resetMotionBuffers()

            val signals = JSONObject().apply {
                put("motion", JSONObject().apply {
                    put("accel_mean_magnitude", motion.accelMean)
                    put("accel_variance", motion.accelVariance)
                    put("gyro_mean_magnitude", motion.gyroMean)
                    put("gyro_variance", motion.gyroVariance)
                    put("samples", motion.samples)
                    put("motion_state", motion.motionState)
                })
            }

            val pulseGuard = JSONObject().apply {
                put("version", version)
                put("snapshot_at", nowIso)
                put("started_at", nowIso)
                put("signals", signals)
                put("background_heartbeat", true)
                put("trigger_reason", "periodic")
                put("device_motion_state", motion.motionState)
            }

            val payload = JSONObject().apply {
                put("hcs_session_public_id", hcsSessionId)
                put("source", source)
                put("link_token", linkToken)
                put("pulse_guard", pulseGuard)
            }

            val body = payload.toString()
                .toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url(apiUrl)
                .post(body)
                .addHeader("x-api-key", apiKey)
                .addHeader("Content-Type", "application/json")
                .build()

            Log.d(TAG, "Sending heartbeat to $apiUrl (apiKey=${apiKey.take(8)}..., session=$hcsSessionId)")

            httpClient.newCall(request).enqueue(object : okhttp3.Callback {
                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                    Log.e(TAG, "Heartbeat HTTP failure: ${e.message}")
                }

                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                    response.use {
                        if (it.isSuccessful) {
                            Log.i(TAG, "Heartbeat sent successfully (HTTP ${it.code})")
                        } else {
                            Log.w(TAG, "Heartbeat failed: HTTP ${it.code} — ${it.body?.string()?.take(200)}")
                        }
                    }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat error: ${e.message}", e)
        }
    }
}
