package com.clearfeed.manager

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.clearfeed.manager.databinding.ActivityMainBinding
import com.clearfeed.manager.ui.ActivityFragment
import com.clearfeed.manager.ui.BlockedFragment
import com.clearfeed.manager.ui.SettingsFragment

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!Prefs.isConfigured(this)) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (savedInstanceState == null) {
            showFragment(ActivityFragment())
        }

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_activity -> { showFragment(ActivityFragment()); true }
                R.id.nav_blocked -> { showFragment(BlockedFragment()); true }
                R.id.nav_settings -> { showFragment(SettingsFragment()); true }
                else -> false
            }
        }
    }

    private fun showFragment(fragment: androidx.fragment.app.Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, fragment)
            .commit()
    }

    fun restartToSetup() {
        Prefs.clear(this)
        startActivity(Intent(this, SetupActivity::class.java))
        finish()
    }
}
