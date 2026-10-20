package com.clearfeed.manager

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.clearfeed.manager.databinding.ActivitySetupBinding
import com.clearfeed.manager.net.HubApi
import kotlinx.coroutines.launch

class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (Prefs.isConfigured(this)) {
            goToMain()
            return
        }

        binding.inputUrl.setText(Prefs.hubUrl(this) ?: "")
        binding.inputKey.setText(Prefs.hubKey(this) ?: "")
        binding.inputDeviceName.setText(Prefs.deviceName(this))

        binding.btnConnect.setOnClickListener { attemptConnect() }
    }

    private fun attemptConnect() {
        val url = binding.inputUrl.text.toString().trim()
        val key = binding.inputKey.text.toString().trim()
        val deviceName = binding.inputDeviceName.text.toString().trim().ifBlank { "Phone" }

        if (url.isBlank() || key.isBlank()) {
            showError("Enter the hub URL and key")
            return
        }

        binding.btnConnect.isEnabled = false
        binding.setupError.visibility = android.view.View.GONE

        Prefs.save(this, url, key, deviceName)

        lifecycleScope.launch {
            val ok = try {
                HubApi.health(this@SetupActivity)
            } catch (e: Exception) {
                false
            }
            binding.btnConnect.isEnabled = true
            if (ok) {
                goToMain()
            } else {
                Prefs.clear(this@SetupActivity)
                showError("Couldn't reach that hub. Check the URL and key.")
            }
        }
    }

    private fun showError(msg: String) {
        binding.setupError.text = msg
        binding.setupError.visibility = android.view.View.VISIBLE
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
