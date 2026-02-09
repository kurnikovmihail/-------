<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from './supabase';
import ProductSelector from './components/ProductSelector.vue';
import EntryCard from './components/EntryCard.vue';
import SummaryView from './components/SummaryView.vue';
import AdminArchive from './components/AdminArchive.vue';
import { RotateCw, Lock, LayoutGrid, History, ShoppingBasket, ChefHat } from 'lucide-vue-next';

const tg = window.Telegram.WebApp;

// Состояние
const activeTab = ref('main'); 
const userRole = ref(null); 
const products = ref([]);
const dailyEntries = ref([]);
const loading = ref(true);
const userId = tg.initDataUnsafe?.user?.id || null;

const initialize = async () => {
  loading.value = true;
  
  // 1. Справочник продуктов
  const { data: prods } = await supabase.from('products').select('*').order('name');
  products.value = prods || [];

  // 2. Доступ
  if (!userId) {
    userRole.value = 'admin'; // Для локальных тестов
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

  if (data) {
    // Оставляем только уникальные последние записи по product_id
    const uniqueMap = new Map();
    data.forEach(item => {
      if (!uniqueMap.has(item.product_id)) {
        uniqueMap.set(item.product_id, {
          product_id: item.product_id,
          name: item.products.name,
          category: item.products.category,
          arrival: item.arrival,
          remainder: item.remainder,
          write_off: item.write_off
        });
      }
    });
    dailyEntries.value = Array.from(uniqueMap.values());
  }
};

const saveReport = async () => {
  if (dailyEntries.value.length === 0) return;
  tg.MainButton.showProgress();
  
  const { error } = await supabase.from('daily_records').insert(
    dailyEntries.value.map(e => ({
      product_id: e.product_id,
      arrival: e.arrival,
      remainder: e.remainder,
      write_off: e.write_off,
      user_id: userId || 0
    }))
  );

  tg.MainButton.hideProgress();
  if (!error) {
    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert("✅ Отчет сохранен!");
  }
};

// Управление кнопкой Telegram
watch([userRole, dailyEntries], () => {
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
  <div class="min-h-screen bg-slate-50 text-slate-900 pb-32">
    <header class="bg-white/80 backdrop-blur-md p-4 sticky top-0 z-40 border-b border-slate-200 flex justify-between items-center">
      <div>
        <h1 class="text-xl font-black italic tracking-tighter text-blue-600">COFEYNY</h1>
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Control Panel</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-[10px] font-black px-3 py-1 bg-slate-100 rounded-full text-slate-500 uppercase">{{ userRole }}</span>
        <button @click="initialize" class="text-slate-300"><RotateCw class="w-5 h-5" /></button>
      </div>
    </header>

    <main class="p-4">
      <div v-if="loading" class="flex justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div></div>
      
      <div v-else-if="userRole === false" class="text-center py-20 flex flex-col items-center">
        <Lock class="w-12 h-12 text-red-400 mb-4" />
        <h2 class="text-xl font-black">Доступ закрыт</h2>
        <p class="text-sm text-slate-400 mt-2">Ваш ID: {{ userId }}</p>
      </div>

      <div v-else>
        <AdminArchive v-if="activeTab === 'archive' && userRole === 'admin'" />

        <div v-else class="space-y-8">
          <ProductSelector v-if="userRole !== 'chef'" :products="products" :dailyEntries="dailyEntries" 
            @add="p => dailyEntries.push({...p, product_id: p.id, arrival:0, remainder:0, write_off:0})" />
          
          <SummaryView v-if="userRole === 'chef'" :entries="dailyEntries" />

          <div v-else v-for="(items, cat) in groupedEntries" :key="cat" class="space-y-4">
            <h3 v-if="items.length" class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <component :is="cat === 'bakery' ? ShoppingBasket : ChefHat" class="w-3 h-3" />
              {{ cat === 'bakery' ? 'Выпечка' : 'Кондитерка' }}
            </h3>
            <EntryCard v-for="(item, idx) in items" :key="item.product_id" :item="item" 
              @remove="dailyEntries.splice(dailyEntries.indexOf(item), 1)" />
          </div>
        </div>
      </div>
    </main>

    <nav v-if="userRole === 'admin'" class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t p-4 flex justify-around shadow-2xl z-50">
      <button @click="activeTab = 'main'" :class="activeTab === 'main' ? 'text-blue-600' : 'text-slate-400'" class="flex flex-col items-center gap-1 transition-colors">
        <LayoutGrid class="w-6 h-6" /><span class="text-[9px] font-black uppercase">Учет</span>
      </button>
      <button @click="activeTab = 'archive'" :class="activeTab === 'archive' ? 'text-blue-600' : 'text-slate-400'" class="flex flex-col items-center gap-1 transition-colors">
        <History class="w-6 h-6" /><span class="text-[9px] font-black uppercase">Архив</span>
      </button>
    </nav>
  </div>
</template>