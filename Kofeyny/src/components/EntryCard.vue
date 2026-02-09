<script setup>
import { Trash2 } from 'lucide-vue-next';
defineProps(['item']);
defineEmits(['remove']);
</script>

<template>
  <div class="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-5">
    <div class="flex justify-between items-center">
      <span class="text-base font-black text-slate-800 tracking-tight">{{ item.name }}</span>
      <button @click="$emit('remove')" class="text-slate-200 hover:text-red-400 transition-colors">
        <Trash2 class="w-5 h-5" />
      </button>
    </div>
    <div class="grid grid-cols-3 gap-4 text-center">
      <div v-for="field in ['arrival', 'remainder', 'write_off']" :key="field">
        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">{{ field }}</label>
        <input type="number" v-model.number="item[field]" 
          class="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl py-4 text-center font-black outline-none transition-all"
          :class="field === 'arrival' ? 'text-blue-600' : field === 'remainder' ? 'text-green-600' : 'text-red-500'" />
      </div>
    </div>
  </div>
</template>