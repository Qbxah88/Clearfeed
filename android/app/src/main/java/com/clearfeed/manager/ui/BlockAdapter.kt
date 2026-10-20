package com.clearfeed.manager.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.clearfeed.manager.databinding.ItemBlockBinding

class BlockAdapter(
    private var items: List<String>,
    private val onRemove: (String) -> Unit
) : RecyclerView.Adapter<BlockAdapter.VH>() {

    inner class VH(val binding: ItemBlockBinding) : RecyclerView.ViewHolder(binding.root)

    fun update(newItems: List<String>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, position: Int): VH {
        val binding = ItemBlockBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val value = items[position]
        holder.binding.blockLabel.text = value
        holder.binding.btnRemoveBlock.setOnClickListener { onRemove(value) }
    }

    override fun getItemCount(): Int = items.size
}
