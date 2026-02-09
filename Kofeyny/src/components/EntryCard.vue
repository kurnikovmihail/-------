<script setup>
import { ref } from 'vue';
import { Trash2 } from 'lucide-vue-next';

const props = defineProps(['item']);
const emit = defineEmits(['remove']);

// Логика свайпа
const startX = ref(0);
const currentX = ref(0);
const isSwiping = ref(false);

const onTouchStart = (e) => {
  startX.value = e.touches[0].clientX;
  isSwiping.value = true;
};

const onTouchMove = (e) => {
  const x = e.touches[0].clientX;
  const diff = startX.value - x;
  if (diff > 0 && diff <= 70) currentX.value = diff;
};

const onTouchEnd = () => {
  isSwiping.value = false;
  currentX.value = currentX.value > 35 ? 70 : 0;
};

const handleEnter = (e) => { e.target.blur(); };
</script>

<template>
  <div class="relative overflow-hidden rounded-xl mb-1 border border-slate-100 bg-white shadow-sm">
    <button 
      @click="$emit('remove')"
      class="absolute right-0 top-0 bottom-0 w-[70px] bg-red-500 text-white flex items-center justify-center z-0"
    >
      <Trash2 class="w-5 h-5" />
    </button>

    <div 
      class="bg-white p-2 flex items-center gap-2 transition-transform duration-200 ease-out relative z-10"
      :style="{ transform: `translateX(-${currentX}px)` }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="flex-1 min-w-0">
        <p class="text-[12px] font-bold text-slate-700 truncate leading-tight">{{ item.name }}</p>
      </div>

      <div class="flex items-center gap-1">
        <div v-for="field in ['arrival', 'remainder', 'write_off']" :key="field">
          <input 
            type="number" 
            v-model.number="item[field]" 
            @keydown.enter="handleEnter"
            inputmode="numeric"
            :placeholder="field === 'arrival' ? 'Приход' : field === 'remainder' ? 'Ост' : 'Спис'"
            class="w-14 bg-slate-50 border border-slate-100 rounded-lg py-1.5 text-center font-black text-[11px] outline-none transition-all placeholder:font-bold placeholder:text-slate-300"
            :class="{
              'text-blue-600 border-blue-200 bg-blue-50/30': field === 'arrival' && item[field] > 0,
              'text-green-600 border-green-200 bg-green-50/30': field === 'remainder' && item[field] > 0,
              'text-red-500 border-red-200 bg-red-50/30': field === 'write_off' && item[field] > 0,
              'text-slate-400': !item[field]
            }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.relative { touch-action: pan-y; }
input::-webkit-outer-spin-button, 
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>