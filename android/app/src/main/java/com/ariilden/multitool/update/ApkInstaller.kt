package com.ariilden.multitool.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Self-update for the shell: download the APK from a GitHub release with
 * DownloadManager, then hand it to the system package installer. The user still
 * confirms the install (Android requires that) — one tap.
 */
object ApkInstaller {
    private const val TAG = "ApkInstaller"
    private const val FILE_NAME = "multitool-shell-update.apk"

    fun downloadAndInstall(context: Context, url: String) {
        val app = context.applicationContext
        if (!app.packageManager.canRequestPackageInstalls()) {
            Toast.makeText(app, "Allow MultiTool to install updates, then try again.", Toast.LENGTH_LONG).show()
            app.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${app.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return
        }
        val dir = app.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        File(dir, FILE_NAME).delete()

        val dm = app.getSystemService(DownloadManager::class.java)
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("MultiTool shell update")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(app, Environment.DIRECTORY_DOWNLOADS, FILE_NAME)
        val downloadId = dm.enqueue(request)
        Toast.makeText(app, "Downloading update…", Toast.LENGTH_SHORT).show()

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return
                app.unregisterReceiver(this)
                val file = File(app.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME)
                if (!file.exists() || file.length() == 0L) {
                    Log.w(TAG, "Download finished but file missing")
                    Toast.makeText(app, "Update download failed.", Toast.LENGTH_LONG).show()
                    return
                }
                val uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
                app.startActivity(
                    Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                )
            }
        }
        ContextCompat.registerReceiver(
            app, receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED
        )
    }
}
