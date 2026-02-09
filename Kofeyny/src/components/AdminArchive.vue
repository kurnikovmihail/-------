<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { Calendar, Package } from 'lucide-vue-next';

const history = ref({});
const loading = ref(true);

onMounted(async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('daily_records')
    .select('*, products(name)')
    .order('created_at', { ascending: false });
  
  if (data) {
    const groups = {};
    data.forEach(rec => {
      // Форматируем дату в понятный вид
      const date = new Date(rec.created_at).toLocaleDateString('ru-RU', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
      
      if (!groups[date]) groups[date] = [];
      
      // Логика: если в этот день для этого товара уже есть запись, 
      // значит это более старая версия (так как сортировка DESC), игнорируем её.
      if (!groups[date].find(i => i.product_id === rec.product_id)) {
        groups[date].push(rec);
      }
    });
    history.value = groups;
  }
  loading.value = false;
});
</script>

<template>
  <div class="space-y-4 pb-10">
    <div v-if="loading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
      Загрузка истории...
    </div>

    <div v-else-if="Object.keys(history).length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
      Архив пуст
    </div>

    <div v-for="(records, date) in history" :key="date" class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
      <div class="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
        <Calendar class="w-3.5 h-3.5 text-blue-500" />
        <span class="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{{ date }}</span>
      </div>
      
      <div class="p-3 space-y-2">
        <div v-for="r in records" :key="r.id" class="flex justify-between items-center text-[11px] font-bold">
          <span class="text-slate-700 truncate mr-2">{{ r.products?.name || 'Удален' }}</span>
          <div class="flex gap-1.5 flex-shrink-0">
            <span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">П:{{ r.arrival }}</span>
            <span class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded">О:{{ r.remainder }}</span>
            <span class="px-1.5 py-0.5 bg-red-50 text-red-500 rounded">С:{{ r.write_off }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>