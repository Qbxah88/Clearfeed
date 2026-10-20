package com.clearfeed.manager.ui

import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.clearfeed.manager.databinding.ItemLogBinding
import org.json.JSONObject

class LogAdapter(private var items: List<JSONObject>) :
    RecyclerView.Adapter<LogAdapter.VH>() {

    inner class VH(val binding: ItemLogBinding) : RecyclerView.ViewHolder(binding.root)

    fun update(newItems: List<JSONObject>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, position: Int): VH {
        val binding = ItemLogBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val e = items[position]
        val title = e.optString("title").ifBlank {
            e.optString("reason").ifBlank { "Activity" }
        }
        holder.binding.logTitle.text = title

        val device = e.optString("device")
        val ts = e.optLong("ts", e.optLong("time", 0L))
        val whenText = if (ts > 0) {
            val millis = if (ts > 10_000_000_000L) ts else ts * 1000
            DateUtils.getRelativeTimeSpanString(millis).toString()
        } else ""
        val detail = e.optString("detail").ifBlank { e.optString("creator") }

        val meta = buildList {
            if (device.isNotBlank()) add(device)
            if (detail.isNotBlank()) add(detail)
            if (whenText.isNotBlank()) add(whenText)
        }.joinToString(" · ")

        holder.binding.logMeta.text = meta
    }

    override fun getItemCount(): Int = items.size
}
