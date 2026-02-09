<script setup>
import { ChefHat, AlertCircle, CheckCircle2 } from 'lucide-vue-next';

defineProps(['entries']);

const getStatusClass = (count) => {
  if (count <= 2) return 'bg-red-50 text-red-600 border-red-100';
  if (count <= 5) return 'bg-amber-50 text-amber-600 border-amber-100';
  return 'bg-green-50 text-green-600 border-green-100';
};
</script>

<template>
  <div class="space-y-6">
    <div class="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-100 flex items-center justify-between">
      <div>
        <h2 class="text-sm font-bold opacity-80 uppercase tracking-widest">План кухни</h2>
        <p class="text-3xl font-black mt-2">Остатки</p>
      </div>
      <ChefHat class="w-12 h-12 opacity-30" />
    </div>

    <div v-if="entries.length === 0" class="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed text-slate-400 font-bold">
      Бариста еще не отправил отчет
    </div>

    <div v-else class="grid gap-3">
      <div v-for="item in entries" :key="item.product_id" 
           class="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
        <div class="flex flex-col">
          <span class="font-black text-slate-800">{{ item.name }}</span>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Нужно приготовить, если мало</span>
        </div>
        
        <div class="flex items-center gap-3">
          <div :class="['px-4 py-2 rounded-xl border-2 font-black text-lg transition-all', getStatusClass(item.remainder)]">
            {{ item.remainder }}
          </div>
          <AlertCircle v-if="item.remainder <= 2" class="w-5 h-5 text-red-500 animate-pulse" />
          <CheckCircle2 v-else class="w-5 h-5 text-green-500" />
        </div>
      </div>
    </div>
  </div>
</template>