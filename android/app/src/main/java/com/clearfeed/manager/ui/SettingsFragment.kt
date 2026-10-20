package com.clearfeed.manager.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.clearfeed.manager.MainActivity
import com.clearfeed.manager.Prefs
import com.clearfeed.manager.databinding.FragmentSettingsBinding
import com.clearfeed.manager.net.HubApi
import kotlinx.coroutines.launch
import org.json.JSONObject

class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private var currentSettings: JSONObject = JSONObject()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.hubUrlText.text = Prefs.hubUrl(requireContext()) ?: ""
        binding.btnSaveSettings.setOnClickListener { save() }
        binding.btnDisconnect.setOnClickListener {
            (activity as? MainActivity)?.restartToSetup()
        }

        load()
    }

    private fun load() {
        binding.settingsStatus.text = "Loading…"
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                currentSettings = HubApi.getSettings(requireContext())
                binding.switchEarnIt.isChecked = currentSettings.optBoolean("earnItEnabled", false)
                binding.switchBreaks.isChecked = currentSettings.optBoolean("breaksEnabled", false)
                binding.switchBlockSearch.isChecked = currentSettings.optBoolean("blockAllSearches", false)
                binding.settingsStatus.text = ""
            } catch (e: Exception) {
                binding.settingsStatus.text = "Couldn't load settings: ${e.message}"
            }
        }
    }

    private fun save() {
        binding.btnSaveSettings.isEnabled = false
        binding.settingsStatus.text = "Saving…"
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                currentSettings.put("earnItEnabled", binding.switchEarnIt.isChecked)
                currentSettings.put("breaksEnabled", binding.switchBreaks.isChecked)
                currentSettings.put("blockAllSearches", binding.switchBlockSearch.isChecked)
                HubApi.putSettings(requireContext(), currentSettings)
                binding.settingsStatus.text = "Saved"
            } catch (e: Exception) {
                binding.settingsStatus.text = "Couldn't save: ${e.message}"
                Toast.makeText(requireContext(), "Save failed: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.btnSaveSettings.isEnabled = true
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
