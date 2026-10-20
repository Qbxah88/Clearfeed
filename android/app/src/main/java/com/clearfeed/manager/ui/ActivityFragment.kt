package com.clearfeed.manager.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.clearfeed.manager.databinding.FragmentActivityBinding
import com.clearfeed.manager.net.HubApi
import kotlinx.coroutines.launch
import org.json.JSONObject

class ActivityFragment : Fragment() {

    private var _binding: FragmentActivityBinding? = null
    private val binding get() = _binding!!
    private val adapter = LogAdapter(emptyList())

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentActivityBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.recyclerLog.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerLog.adapter = adapter
        binding.swipeRefresh.setOnRefreshListener { load() }
        load()
    }

    private fun load() {
        binding.swipeRefresh.isRefreshing = true
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val arr = HubApi.getLog(requireContext())
                val list = ArrayList<JSONObject>()
                for (i in 0 until arr.length()) list.add(arr.optJSONObject(i) ?: JSONObject())
                list.reverse()
                adapter.update(list)
                binding.emptyLog.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                binding.emptyLog.text = "Couldn't load activity: ${e.message}"
                binding.emptyLog.visibility = View.VISIBLE
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
