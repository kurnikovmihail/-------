<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { Calendar } from 'lucide-vue-next';

const history = ref([]);
const loading = ref(true);

onMounted(async () => {
  // Группируем последние отчеты по датам
  const { data } = await supabase
    .from('daily_records')
    .select('*, products(name)')
    .order('created_at', { ascending: false });
  
  if (data) {
    const groups = {};
    data.forEach(rec => {
      const date = new Date(rec.created_at).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      // Чтобы последняя запись перекрывала, мы просто берем первую попавшуюся в отсортированном по убыванию списке
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
  <div class="space-y-6 pb-20">
    <div v-for="(records, date) in history" :key="date" class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
      <div class="flex items-center gap-2 mb-4 text-blue-600 font-black text-sm">
        <Calendar class="w-4 h-4" /> {{ date }}
      </div>
      <div class="space-y-2 border-t pt-4">
        <div v-for="r in records" :key="r.id" class="flex justify-between text-xs font-bold">
          <span class="text-slate-600">{{ r.products.name }}</span>
          <span class="text-slate-400">Пр: {{ r.arrival }} | Ост: {{ r.remainder }} | Сп: {{ r.write_off }}</span>
        </div>
      </div>
    </div>
  </div>
</template>