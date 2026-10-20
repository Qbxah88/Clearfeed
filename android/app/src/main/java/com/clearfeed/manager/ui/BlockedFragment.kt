package com.clearfeed.manager.ui

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.tabs.TabLayout
import com.clearfeed.manager.databinding.DialogAddBlockBinding
import com.clearfeed.manager.databinding.FragmentBlockedBinding
import com.clearfeed.manager.net.HubApi
import kotlinx.coroutines.launch
import org.json.JSONObject

class BlockedFragment : Fragment() {

    private var _binding: FragmentBlockedBinding? = null
    private val binding get() = _binding!!

    private var creators: List<String> = emptyList()
    private var videos: List<String> = emptyList()
    private var showingCreators = true

    private lateinit var adapter: BlockAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentBlockedBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = BlockAdapter(emptyList()) { value -> confirmRemove(value) }
        binding.recyclerBlocked.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerBlocked.adapter = adapter

        binding.blockedTabs.addTab(binding.blockedTabs.newTab().setText("Creators"))
        binding.blockedTabs.addTab(binding.blockedTabs.newTab().setText("Videos"))
        binding.blockedTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                showingCreators = tab.position == 0
                render()
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })

        binding.swipeRefreshBlocked.setOnRefreshListener { load() }
        binding.btnAddBlock.setOnClickListener { showAddDialog() }

        load()
    }

    private fun load() {
        binding.swipeRefreshBlocked.isRefreshing = true
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val settings = HubApi.getSettings(requireContext())
                creators = toStringList(settings.optJSONArray("blockedCreators"))
                videos = toStringList(settings.optJSONArray("blockedVideos"))
                render()
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Couldn't load: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.swipeRefreshBlocked.isRefreshing = false
            }
        }
    }

    private fun toStringList(arr: org.json.JSONArray?): List<String> {
        if (arr == null) return emptyList()
        val out = ArrayList<String>()
        for (i in 0 until arr.length()) {
            val v = arr.opt(i)
            out.add(if (v is JSONObject) v.optString("name", v.optString("id")) else v.toString())
        }
        return out
    }

    private fun render() {
        adapter.update(if (showingCreators) creators else videos)
    }

    private fun confirmRemove(value: String) {
        AlertDialog.Builder(requireContext())
            .setTitle("Unblock")
            .setMessage("Unblock \"$value\" on every device?")
            .setPositiveButton("Unblock") { _, _ -> removeBlock(value) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun removeBlock(value: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (showingCreators) {
                    HubApi.block(requireContext(), removeCreators = listOf(value))
                } else {
                    HubApi.block(requireContext(), removeVideos = listOf(value))
                }
                load()
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Couldn't unblock: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun showAddDialog() {
        val dialogBinding = DialogAddBlockBinding.inflate(LayoutInflater.from(requireContext()))
        val title = if (showingCreators) "Block a channel" else "Block a video"
        dialogBinding.inputBlockValue.hint =
            if (showingCreators) "Channel URL or @handle" else "Video URL"

        AlertDialog.Builder(requireContext())
            .setTitle(title)
            .setView(dialogBinding.root)
            .setPositiveButton("Block") { _, _ ->
                val value = dialogBinding.inputBlockValue.text.toString().trim()
                if (value.isNotBlank()) addBlock(value)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun addBlock(value: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (showingCreators) {
                    HubApi.block(requireContext(), creators = listOf(value))
                } else {
                    HubApi.block(requireContext(), videos = listOf(value))
                }
                load()
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Couldn't block: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
