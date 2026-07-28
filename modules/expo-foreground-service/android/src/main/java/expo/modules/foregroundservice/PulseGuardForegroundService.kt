package expo.modules.foregroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * PulseGuardForegroundService — Android foreground service (type: health)
 *
 * Sends periodic heartbeat snapshots to the PulseGuard backend while the
 * app is in the background. The JS timer in WaitingScreen handles foreground
 * checks; this service ensures continuity when the JS thread is suspended.
 *
 * Milestone 1: heartbeat only (no motion sensors). Sends
 * submitPulseGuardSnapshot with background_heartbeat=true.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */
class PulseGuardForegroundService : Service() {

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
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Start heartbeat cycle
        handler.removeCallbacks(heartbeatRunnable)
        handler.postDelayed(heartbeatRunnable, checkFreqMs)

        Log.i(TAG, "Service started — heartbeat every ${checkFreqMs}ms")
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(heartbeatRunnable)
        running = false
        Log.i(TAG, "Service stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

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
        try {
            val nowIso = java.time.Instant.now().toString()

            val pulseGuard = JSONObject().apply {
                put("version", version)
                put("snapshot_at", nowIso)
                put("started_at", nowIso)
                put("signals", JSONObject())
                put("background_heartbeat", true)
                put("trigger_reason", "periodic")
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

            httpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Log.i(TAG, "Heartbeat sent successfully")
                } else {
                    Log.w(TAG, "Heartbeat failed: HTTP ${response.code}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat error: ${e.message}")
        }
    }
}
