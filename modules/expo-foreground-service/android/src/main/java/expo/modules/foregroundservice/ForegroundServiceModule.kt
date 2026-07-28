package expo.modules.foregroundservice

import android.content.Context
import android.content.Intent
import android.os.Build

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class HeartbeatConfig : Record {
    @Field val apiUrl: String = ""
    @Field val apiKey: String = ""
    @Field val linkToken: String = ""
    @Field val hcsSessionPublicId: String = ""
    @Field val checkFrequencyMs: Long = 60_000L
    @Field val source: String = "pulseguard_mobile"
    @Field val version: String = "1.0.0"
}

class ForegroundServiceModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoForegroundService")

        AsyncFunction("startService") { config: HeartbeatConfig ->
            val context = appContext.reactContext
                ?: throw Exception("React context is null")
            val intent = Intent(context, PulseGuardForegroundService::class.java).apply {
                putExtra(PulseGuardForegroundService.EXTRA_API_URL, config.apiUrl)
                putExtra(PulseGuardForegroundService.EXTRA_API_KEY, config.apiKey)
                putExtra(PulseGuardForegroundService.EXTRA_LINK_TOKEN, config.linkToken)
                putExtra(PulseGuardForegroundService.EXTRA_HCS_SESSION_ID, config.hcsSessionPublicId)
                putExtra(PulseGuardForegroundService.EXTRA_CHECK_FREQ_MS, config.checkFrequencyMs)
                putExtra(PulseGuardForegroundService.EXTRA_SOURCE, config.source)
                putExtra(PulseGuardForegroundService.EXTRA_VERSION, config.version)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        AsyncFunction("stopService") {
            val context = appContext.reactContext
                ?: throw Exception("React context is null")
            val intent = Intent(context, PulseGuardForegroundService::class.java)
            context.stopService(intent)
        }

        AsyncFunction("isServiceRunning") {
            PulseGuardForegroundService.isRunning
        }
    }
}
