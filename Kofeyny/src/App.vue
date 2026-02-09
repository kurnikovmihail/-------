<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from './supabase';
import ProductSelector from './components/ProductSelector.vue';
import EntryCard from './components/EntryCard.vue';
import SummaryView from './components/SummaryView.vue';
import AdminArchive from './components/AdminArchive.vue';
import { RotateCw, Lock, LayoutGrid, History, ShoppingBasket, ChefHat } from 'lucide-vue-next';

const tg = window.Telegram.WebApp;

// СОСТОЯНИЕ
const activeTab = ref('main'); 
const userRole = ref(null); 
const products = ref([]);
const dailyEntries = ref([]);
const loading = ref(true);
const userId = tg.initDataUnsafe?.user?.id || null;

// ИНИЦИАЛИЗАЦИЯ
const initialize = async () => {
  loading.value = true;
  
  // 1. Загрузка справочника товаров
  const { data: prods } = await supabase.from('products').select('*').order('name');
  products.value = prods || [];

  // 2. Проверка роли
  if (!userId) {
    userRole.value = 'admin'; // Режим ПК
  } else {
    const { data: user } = await supabase.from('allowed_users').select('role').eq('telegram_id', userId).single();
    userRole.value = user?.role || false;
  }
  
  if (userRole.value) await fetchTodayRecords();
  loading.value = false;
};

// ЗАГРУЗКА ДАННЫХ ЗА СЕГОДНЯ
const fetchTodayRecords = async () => {
  const today = new Date().toISOString().split('T')[0];
  
  // Берем все записи за сегодня
  const { data } = await supabase.from('daily_records')
    .select('*, products(name, category, unit)')
    .gte('created_at', today)
    .order('created_at', { ascending: false });

  if (data && data.length > 0) {
    const uniqueMap = new Map();
    // Оставляем только самую свежую запись для каждого товара
    data.forEach(item => {
      if (!uniqueMap.has(item.product_id)) {
        uniqueMap.set(item.product_id, {
          product_id: item.product_id,
          name: item.products.name,
          category: item.products.category,
          arrival: item.arrival || null,
          remainder: item.remainder || null,
          write_off: item.write_off || null
        });
      }
    });
    dailyEntries.value = Array.from(uniqueMap.values());
  } else {
    dailyEntries.value = [];
  }
};

// СОХРАНЕНИЕ (И УДАЛЕНИЕ ЛИШНЕГО)
const saveReport = async () => {
  if (tg.MainButton) tg.MainButton.showProgress();
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. УДАЛЯЕМ ВСЁ за сегодня. 
    // Это гарантирует, что те позиции, которые ты удалил из списка на экране, исчезнут и из БД.
    const { error: deleteError } = await supabase.from('daily_records')
      .delete()
      .gte('created_at', today);

    if (deleteError) throw deleteError;

    // 2. ВСТАВЛЯЕМ АКТУАЛЬНЫЙ СПИСОК (если он не пуст)
    if (dailyEntries.value.length > 0) {
      const { error: insertError } = await supabase.from('daily_records').insert(
        dailyEntries.value.map(e => ({
          product_id: e.product_id,
          arrival: (e.arrival !== null && e.arrival !== '') ? Number(e.arrival) : 0,
          remainder: (e.remainder !== null && e.remainder !== '') ? Number(e.remainder) : 0,
          write_off: (e.write_off !== null && e.write_off !== '') ? Number(e.write_off) : 0,
          user_id: userId || 0
        }))
      );
      if (insertError) throw insertError;
    }

    tg.HapticFeedback?.notificationOccurred('success');
    tg.showAlert?.("✅ Данные в базе обновлены");
    
  } catch (err) {
    console.error(err);
    tg.showAlert?.("Ошибка: " + err.message);
  } finally {
    if (tg.MainButton) tg.MainButton.hideProgress();
  }
};

// Управление кнопкой Telegram
watch([userRole, dailyEntries, activeTab], () => {
  if (userRole.value !== 'chef' && activeTab.value === 'main') {
    // Кнопка видна всегда, чтобы можно было "сохранить пустоту" (удалить всё)
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
  <div class="min-h-screen bg-slate-50 text-slate-900 pb-24 select-none">
    
    <header class="bg-white/90 backdrop-blur-md p-3 sticky top-0 z-40 border-b border-slate-200 flex justify-between items-center shadow-sm">
      <div>
        <h1 class="text-lg font-black italic tracking-tighter text-blue-600 leading-none uppercase">Cofeyny</h1>
        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Рабочая смена</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[8px] font-black px-2 py-0.5 bg-slate-100 rounded text-slate-500 uppercase">{{ userRole }}</span>
        <button @click="initialize" class="text-slate-300 active:rotate-180 transition-transform duration-500">
          <RotateCw class="w-4 h-4" />
        </button>
      </div>
    </header>

    <main class="p-2">
      <div v-if="loading" class="flex justify-center py-10">
        <RotateCw class="w-6 h-6 animate-spin text-blue-500" />
      </div>
      
      <div v-else-if="userRole === false" class="text-center py-10">
        <Lock class="w-10 h-10 text-red-300 mx-auto mb-2" />
        <h2 class="text-xs font-black uppercase text-slate-400">Нет доступа. ID: {{ userId }}</h2>
      </div>

      <div v-else>
        <AdminArchive v-if="activeTab === 'archive' && userRole === 'admin'" />

        <div v-else class="space-y-4">
          
          <ProductSelector 
            v-if="userRole !== 'chef'" 
            :products="products" 
            :dailyEntries="dailyEntries" 
            @add="p => {
              if (!dailyEntries.find(e => e.product_id === p.id)) {
                dailyEntries.unshift({
                  product_id: p.id,
                  name: p.name,
                  category: p.category,
                  arrival: null,
                  remainder: null,
                  write_off: null
                });
                tg.HapticFeedback?.impactOccurred('light');
              }
            }" 
          />
          
          <SummaryView v-if="userRole === 'chef'" :entries="dailyEntries" />

          <div v-else v-for="(items, cat) in groupedEntries" :key="cat" class="space-y-1">
            <h3 v-if="items.length" class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] pt-2 pb-1 ml-1 flex items-center gap-1">
              <component :is="cat === 'bakery' ? ShoppingBasket : ChefHat" class="w-2.5 h-2.5" />
              {{ cat === 'bakery' ? 'Выпечка' : 'Кондитерка' }}
            </h3>
            
            <EntryCard 
              v-for="item in items" 
              :key="item.product_id" 
              :item="item" 
              @remove="() => {
                const idx = dailyEntries.indexOf(item);
                if (idx > -1) dailyEntries.splice(idx, 1);
                tg.HapticFeedback?.impactOccurred('medium');
              }" 
            />
          </div>

          <div v-if="dailyEntries.length === 0" class="text-center py-10 opacity-20">
            <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
            <p class="text-[10px] font-black uppercase">Список пуст</p>
          </div>
        </div>
      </div>
    </main>

    <nav v-if="userRole === 'admin'" class="fixed bottom-0 left-0 right-0 bg-white/95 border-t p-2 flex justify-around shadow-lg z-50">
      <button @click="activeTab = 'main'" :class="activeTab === 'main' ? 'text-blue-600' : 'text-slate-300'" class="flex flex-col items-center">
        <LayoutGrid class="w-5 h-5" /><span class="text-[8px] font-black uppercase mt-0.5">Смена</span>
      </button>
      <button @click="activeTab = 'archive'" :class="activeTab === 'archive' ? 'text-blue-600' : 'text-slate-300'" class="flex flex-col items-center">
        <History class="w-5 h-5" /><span class="text-[8px] font-black uppercase mt-0.5">Архив</span>
      </button>
    </nav>
  </div>
</template>