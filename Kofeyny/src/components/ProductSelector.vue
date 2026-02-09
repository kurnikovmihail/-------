<script setup>
import { ref, computed } from 'vue';
import { Search, XCircle, Plus, Check } from 'lucide-vue-next';

const props = defineProps(['products', 'dailyEntries']);
const emit = defineEmits(['add']);
const searchQuery = ref('');

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return props.products;
  return props.products.filter(p => p.name.toLowerCase().includes(searchQuery.value.toLowerCase()));
});
</script>

<template>
  <section class="space-y-4">
    <div class="relative">
      <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input v-model="searchQuery" type="text" placeholder="Поиск продукции..." 
        class="w-full bg-white border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold shadow-sm outline-none focus:border-blue-500 transition-all" />
      <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-4 top-1/2 -translate-y-1/2">
        <XCircle class="w-5 h-5 text-slate-300" />
      </button>
    </div>
    <div class="bg-slate-200/30 p-2 rounded-2xl">
      <div class="flex gap-2 overflow-x-auto no-scrollbar py-1">
        <button v-for="p in filtered" :key="p.id" @click="emit('add', p)"
          :class="['flex-shrink-0 px-5 py-3 rounded-xl text-xs font-black transition-all active:scale-90 border-2',
            dailyEntries.find(e => e.product_id === p.id) ? 'bg-blue-50 border-blue-200 text-blue-500' : 'bg-white border-transparent text-slate-700']">
          {{ p.name }}
        </button>
      </div>
    </div>
  </section>
</template>