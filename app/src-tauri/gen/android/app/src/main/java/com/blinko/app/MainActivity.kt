package com.blinko.app

import android.content.Intent
import android.os.Bundle
import android.graphics.Color
import android.view.WindowInsetsController
import android.view.View
import android.os.Build
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import org.json.JSONObject

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleShortcutIntent()
        handleShareIntent()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShortcutIntent()
        handleShareIntent()
    }
    
    private fun handleShortcutIntent() {
        intent?.data?.let { uri ->
            if (uri.scheme == "blinko" && uri.host == "shortcut") {
                uri.pathSegments?.firstOrNull()?.let { action ->
                    // Try multiple times to inject action into WebView
                    listOf(1000L, 2000L, 3000L, 5000L).forEach { delay ->
                        window.decorView.postDelayed({
                            injectShortcutAction(action)
                        }, delay)
                    }
                }
            }
        }
    }
    
    private fun injectShortcutAction(action: String) {
        try {
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    if (!window.localStorage.getItem('android_shortcut_action')) {
                        window.localStorage.setItem('android_shortcut_action', '$action');
                    }
                })();
                """.trimIndent(), null
            )
        } catch (e: Exception) {
            // Silently ignore
        }
    }
    
    private fun findWebView(view: View): android.webkit.WebView? {
        if (view is android.webkit.WebView) return view
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                findWebView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun handleShareIntent() {
        if (intent?.action == Intent.ACTION_SEND) {
            val payload = intentToJson(intent)
            intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uri ->
                val name = getNameFromUri(uri)
                if (name != null && name != "") {
                    payload.put("name", name)
                    Log.i("got name", name)
                }
            }
            Log.i("triggering event", payload.toString())

            // Try multiple times to inject share data into WebView
            listOf(1000L, 2000L, 3000L, 5000L).forEach { delay ->
                window.decorView.postDelayed({
                    injectShareData(payload.toString())
                }, delay)
            }
        }
    }

    private fun intentToJson(intent: Intent): JSONObject {
        val json = JSONObject()
        Log.i("processing", intent.toUri(0))
        json.put("uri", intent.toUri(0))
        json.put("content_type", intent.type)

        // Get text content
        intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
            // Remove surrounding quotes if present
            val cleanedText = text.trim().let { trimmed ->
                when {
                    trimmed.startsWith("\"") && trimmed.endsWith("\"") -> trimmed.substring(1, trimmed.length - 1)
                    trimmed.startsWith("'") && trimmed.endsWith("'") -> trimmed.substring(1, trimmed.length - 1)
                    trimmed.startsWith("`") && trimmed.endsWith("`") -> trimmed.substring(1, trimmed.length - 1)
                    else -> trimmed
                }
            }
            json.put("text", cleanedText)
        }

        // Get subject
        intent.getStringExtra(Intent.EXTRA_SUBJECT)?.let {
            json.put("subject", it)
        }

        val streamUrl = intent.extras?.get("android.intent.extra.STREAM")
        if (streamUrl != null) {
            json.put("stream", streamUrl)
        }
        return json
    }

    private fun getNameFromUri(uri: Uri): String? {
        var displayName: String? = ""
        val projection = arrayOf(OpenableColumns.DISPLAY_NAME)
        val cursor = contentResolver.query(uri, projection, null, null, null)
        if (cursor != null) {
            cursor.moveToFirst()
            val columnIdx = cursor.getColumnIndex(projection[0])
            displayName = cursor.getString(columnIdx)
            cursor.close()
        }
        if (displayName.isNullOrEmpty()) {
            displayName = uri.lastPathSegment
        }
        return displayName
    }

    private fun injectShareData(shareData: String) {
        try {
            val escapedData = shareData.replace("\\", "\\\\").replace("\"", "\\\"").replace("'", "\\'")
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    if (!window.localStorage.getItem('android_share_data')) {
                        window.localStorage.setItem('android_share_data', '$escapedData');
                    }
                })();
                """.trimIndent(), null
            )
        } catch (e: Exception) {
            // Silently ignore
        }
    }

    override fun onResume() {
        super.onResume()
        setWhiteSystemBars()
    }
    
    private fun setWhiteSystemBars() {
        try {
            val whiteColor = Color.WHITE
            
            window.statusBarColor = whiteColor
            window.navigationBarColor = whiteColor
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.decorView.post {
                    window.insetsController?.let { controller ->
                        controller.setSystemBarsAppearance(
                            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        )
                        controller.setSystemBarsAppearance(
                            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                        )
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Android 6.0 - 10
                var flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                }
                
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = flags
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}