package com.plugin.blinko

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsetsController

class Blinko {
    fun setcolor(hex: String, activity: Activity) {
        val color = Color.parseColor(hex)
        
        activity.window.statusBarColor = color
        activity.window.navigationBarColor = color 

        val isLightColor = isColorLight(color)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val statusAppearance = if (isLightColor) {
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            } else {
                0
            }
            
            val navAppearance = if (isLightColor) {
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            } else {
                0
            }
            
            activity.window.insetsController?.setSystemBarsAppearance(
                statusAppearance, 
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            )
            
            activity.window.insetsController?.setSystemBarsAppearance(
                navAppearance,
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            )
            
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            var flags = 0
            
            if (isLightColor) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isLightColor) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            
            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = flags
        }
    }

    private fun isColorLight(color: Int): Boolean {
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        val brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        return brightness > 0.5
    }

    fun openAppSettings(activity: Activity) {
        try {
            // Try to open app-specific settings
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            val uri = Uri.fromParts("package", activity.packageName, null)
            intent.data = uri
            activity.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to general settings if specific app settings fail
            try {
                val intent = Intent(Settings.ACTION_SETTINGS)
                activity.startActivity(intent)
            } catch (fallbackException: Exception) {
                Log.e("Blinko", "Failed to open settings: ${fallbackException.message}")
            }
        }
    }
}
