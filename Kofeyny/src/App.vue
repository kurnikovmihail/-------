<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from './supabase';
import ProductSelector from './components/ProductSelector.vue';
import EntryCard from './components/EntryCard.vue';
import SummaryView from './components/SummaryView.vue';
import AdminArchive from './components/AdminArchive.vue';
import { RotateCw, Lock, LayoutGrid, History, ShoppingBasket, ChefHat } from 'lucide-vue-next';

const tg = window.Telegram.WebApp;

const activeTab = ref('main'); 
const userRole = ref(null); 
const products = ref([]);
const dailyEntries = ref([]);
const loading = ref(true);
const userId = tg.initDataUnsafe?.user?.id || null;

const initialize = async () => {
  loading.value = true;
  
  const { data: prods } = await supabase.from('products').select('*').order('name');
  products.value = prods || [];

  if (!userId) {
    userRole.value = 'admin'; 
  } else {
    const { data: user } = await supabase.from('allowed_users').select('role').eq('telegram_id', userId).single();
    userRole.value = user?.role || false;
  }
  
  if (userRole.value) await fetchTodayRecords();
  loading.value = false;
};

const fetchTodayRecords = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('daily_records')
    .select('*, products(name, category, unit)')
    .gte('created_at', today)
    .order('created_at', { ascending: false });

  if (data && data.length > 0) {
    const uniqueMap = new Map();
    data.forEach(item => {
      if (!uniqueMap.has(item.product_id)) {
        uniqueMap.set(item.product_id, {
          product_id: item.product_id,
          name: item.products.name,
          category: item.products.category,
          arrival: item.arrival ?? 0,
          remainder: item.remainder ?? 0,
          write_off: item.write_off ?? 0
        });
      }
    });
    dailyEntries.value = Array.from(uniqueMap.values());
  } else {
    dailyEntries.value = [];
  }
};

const saveReport = async () => {
  tg.MainButton.showProgress();
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('daily_records')
    .delete()
    .eq('user_id', userId || 0)
    .gte('created_at', today);

  if (dailyEntries.value.length > 0) {
    const { error } = await supabase.from('daily_records').insert(
      dailyEntries.value.map(e => ({
        product_id: e.product_id,
        arrival: Number(e.arrival) || 0,
        remainder: Number(e.remainder) || 0,
        write_off: Number(e.write_off) || 0,
        user_id: userId || 0
      }))
    );
    if (error) alert(error.message);
  }

  tg.MainButton.hideProgress();
  tg.HapticFeedback.notificationOccurred('success');
  tg.showAlert("✅ Данные обновлены");
};

watch([userRole, dailyEntries, activeTab], () => {
  if (userRole.value !== 'chef' && dailyEntries.value.length > 0 && activeTab.value === 'main') {
    tg.MainButton.setParams({ text: "СОХРАНИТЬ ОТЧЕТ", is_visible: true, color: '#2563eb' });
  } else {
    tg.MainButton.hide();
  }
}, { deep: true });

onMounted(() => {
  tg.ready();
  tg.expand();
  initialize();
  tg.MainButton.onClick(saveReport);
});

const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [] };
  dailyEntries.value.forEach(e => { if (groups[e.category]) groups[e.category].push(e); });
  return groups;
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-hidden">
    <header class="bg-white/90 backdrop-blur-md p-3 sticky top-0 z-40 border-b border-slate-200 flex justify-between items-center shadow-sm">
      <div>
        <h1 class="text-lg font-black italic tracking-tighter text-blue-600 leading-none">KAFETERIY</h1>
        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Панель управления</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[9px] font-black px-2 py-0.5 bg-slate-100 rounded-md text-slate-500 uppercase">{{ userRole }}</span>
        <button @click="initialize" class="text-slate-300 active:rotate-180 transition-transform duration-500"><RotateCw class="w-4 h-4" /></button>
      </div>
    </header>

    <main class="p-3">
      <div v-if="loading" class="flex justify-center py-10"><RotateCw class="w-6 h-6 animate-spin text-blue-500" /></div>
      
      <div v-else-if="userRole === false" class="text-center py-10 flex flex-col items-center">
        <Lock class="w-10 h-10 text-red-400 mb-2" />
        <h2 class="text-lg font-black text-red-500 uppercase">Доступ ограничен</h2>
        <p class="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Ваш ID: {{ userId }}</p>
      </div>

      <div v-else>
        <AdminArchive v-if="activeTab === 'archive' && userRole === 'admin'" />

        <div v-else class="space-y-4">
          <ProductSelector v-if="userRole !== 'chef'" :products="products" :dailyEntries="dailyEntries" 
            @add="p => {
              if (!dailyEntries.find(e => e.product_id === p.id)) {
                dailyEntries.unshift({...p, product_id: p.id, arrival:0, remainder:0, write_off:0});
                tg.HapticFeedback.impactOccurred('light');
              }
            }" />
          
          <SummaryView v-if="userRole === 'chef'" :entries="dailyEntries" />

          <div v-else v-for="(items, cat) in groupedEntries" :key="cat" class="space-y-3">
            <h3 v-if="items.length" class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
              <component :is="cat === 'bakery' ? ShoppingBasket : ChefHat" class="w-3 h-3" />
              {{ cat === 'bakery' ? 'Выпечка' : 'Кондитерка' }}
            </h3>
            <EntryCard v-for="(item, idx) in items" :key="item.product_id" :item="item" 
              @remove="dailyEntries.splice(dailyEntries.indexOf(item), 1)" />
          </div>
        </div>
      </div>
    </main>

    <nav v-if="userRole === 'admin'" class="fixed bottom-0 left-0 right-0 bg-white/95 border-t p-2 flex justify-around shadow-lg z-50">
      <button @click="activeTab = 'main'" :class="activeTab === 'main' ? 'text-blue-600' : 'text-slate-400'" class="flex flex-col items-center gap-0.5">
        <LayoutGrid class="w-5 h-5" /><span class="text-[8px] font-black uppercase">Учет</span>
      </button>
      <button @click="activeTab = 'archive'" :class="activeTab === 'archive' ? 'text-blue-600' : 'text-slate-400'" class="flex flex-col items-center gap-0.5">
        <History class="w-5 h-5" /><span class="text-[8px] font-black uppercase">Архив</span>
      </button>
    </nav>
  </div>
</template>

<style>
/* Скрытие скроллбара */
::-webkit-scrollbar { display: none; }
* { -ms-overflow-style: none; scrollbar-width: none; -webkit-tap-highlight-color: transparent; }
body { background-color: #f8fafc; overscroll-behavior-y: contain; font-size: 14px; }
input { user-select: auto; }
input[type="number"] {
  -moz-appearance: textfield;
}
/* Чтобы при клике на пустое место клавиатура тоже уходила */
#app {
  min-height: 100vh;
}
</style>