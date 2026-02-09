<script setup>
import { Trash2 } from 'lucide-vue-next';
const props = defineProps(['item']);
const emit = defineEmits(['remove']);

const handleEnter = (e) => { e.target.blur(); };

const validateInput = (field) => {
  if (props.item[field] === null || props.item[field] === '' || isNaN(props.item[field])) {
    props.item[field] = 0;
  }
};
</script>

<template>
  <div class="bg-white rounded-2xl p-4 shadow-sm border transition-all duration-300"
       :class="item.arrival > 0 || item.remainder > 0 || item.write_off > 0 ? 'border-blue-200 bg-blue-50/10' : 'border-slate-100'">
    
    <div class="flex justify-between items-center mb-3">
      <span class="text-sm font-black text-slate-700 tracking-tight">{{ item.name }}</span>
      <button @click="$emit('remove')" 
              class="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 active:bg-red-500 active:text-white transition-all">
        <Trash2 class="w-4 h-4" />
      </button>
    </div>

    <div class="grid grid-cols-3 gap-3 text-center">
      <div v-for="(label, field) in { 'Приход': 'arrival', 'Остаток': 'remainder', 'Списание': 'write_off' }" :key="field">
        <label class="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1 block">{{ label }}</label>
        <input 
          type="number" 
          v-model.number="item[field]" 
          @keydown.enter="handleEnter"
          @blur="validateInput(field)"
          inputmode="numeric"
          class="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 text-center font-black text-sm outline-none transition-all focus:bg-white focus:border-blue-400 focus:ring-2 ring-blue-50"
          :class="{
            'text-blue-600': field === 'arrival' && item[field] > 0,
            'text-green-600': field === 'remainder' && item[field] > 0,
            'text-red-500': field === 'write_off' && item[field] > 0,
            'text-slate-300': item[field] <= 0
          }"
        />
      </div>
    </div>
  </div>
</template>