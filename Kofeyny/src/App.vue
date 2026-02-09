<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from './supabase';
import { ShoppingBasket, ChefHat, Plus, Minus, RotateCw, Save } from 'lucide-vue-next';

const tg = window.Telegram.WebApp;
const inventory = ref([]);
const loading = ref(true);
const issaving = ref(false);

// Проверка: запущено ли в Телеге или в обычном браузере
// Если platform === 'unknown', значит это обычный браузер
const isTelegram = computed(() => tg.platform !== 'unknown');

const fetchInventory = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('category', { ascending: false });
  
  if (data) inventory.value = data;
  loading.value = false;
};

const saveToDb = async () => {
  if (issaving.value) return;
  issaving.value = true;
  
  if (isTelegram.value) tg.MainButton.showProgress();

  const { error } = await supabase
    .from('inventory')
    .upsert(inventory.value.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      count: item.count,
      unit: item.unit,
      updated_at: new Date()
    })));

  issaving.value = false;
  if (isTelegram.value) tg.MainButton.hideProgress();

  if (!error) {
    if (isTelegram.value) {
      tg.HapticFeedback.notificationOccurred('success');
      tg.showPopup({ message: "Данные успешно сохранены!" });
    } else {
      alert("✅ Сохранено в базу данных!");
    }
  } else {
    alert("Ошибка сохранения: " + error.message);
  }
};

const increment = (id) => {
  const item = inventory.value.find(i => i.id === id);
  if (item) {
    item.count++;
    if (isTelegram.value) tg.HapticFeedback.impactOccurred('light');
  }
};

const decrement = (id) => {
  const item = inventory.value.find(i => i.id === id);
  if (item && item.count > 0) {
    item.count--;
    if (isTelegram.value) tg.HapticFeedback.impactOccurred('light');
  }
};

const categories = computed(() => {
  const groups = {};
  inventory.value.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  return groups;
});

onMounted(() => {
  tg.ready();
  fetchInventory();
  
  if (isTelegram.value) {
    tg.MainButton.setParams({
      text: 'СОХРАНИТЬ В БАЗУ',
      color: '#2563eb',
      is_active: true,
      is_visible: true
    });
    tg.MainButton.onClick(saveToDb);
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-32 font-sans antialiased">
    <header class="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 flex justify-between items-center">
      <div>
        <h1 class="text-xl font-extrabold text-slate-800 tracking-tight">Кафетерий</h1>
        <p class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Учет остатков</p>
      </div>
      <button @click="fetchInventory" class="p-2 text-slate-400 active:rotate-180 transition-transform duration-500">
        <RotateCw :class="{'animate-spin': loading}" class="w-5 h-5" />
      </button>
    </header>

    <main class="p-4 space-y-8">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-slate-400 text-sm">Загрузка данных...</p>
      </div>

      <div v-else v-for="(items, catName) in categories" :key="catName" class="space-y-4">
        <div class="flex items-center gap-2 px-1">
          <component :is="catName === 'bakery' ? ShoppingBasket : ChefHat" 
                     :class="['w-5 h-5', catName === 'bakery' ? 'text-amber-500' : 'text-pink-500']" />
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-500">
            {{ catName === 'bakery' ? 'Выпечка' : 'Кондитерка' }}
          </h2>
        </div>

        <div class="grid gap-3">
          <div v-for="item in items" :key="item.id" 
               class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div class="flex-1">
              <h3 class="font-bold text-slate-700">{{ item.name }}</h3>
              <p class="text-xs text-slate-400 font-medium">{{ item.unit }}</p>
            </div>

            <div class="flex items-center bg-slate-50 rounded-xl p-1 border border-slate-100">
              <button @click="decrement(item.id)" class="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-90 transition-transform">
                <Minus class="w-4 h-4 text-slate-600" />
              </button>
              <div class="w-12 text-center font-black text-slate-800 text-lg">{{ item.count }}</div>
              <button @click="increment(item.id)" class="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-600 shadow-sm active:scale-90 transition-transform">
                <Plus class="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-if="!isTelegram && !loading" class="fixed bottom-6 left-0 right-0 px-4 z-30">
      <button @click="saveToDb" 
              :disabled="issaving"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
        <Save v-if="!issaving" class="w-5 h-5" />
        <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        {{ issaving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ В БАЗУ' }}
      </button>
      <p class="text-center text-[10px] text-slate-400 mt-2 uppercase font-bold tracking-tighter">Режим веб-браузера</p>
    </div>
  </div>
</template>
<style>
/* Убираем выделение при нажатии на мобилках */
* {
  -webkit-tap-highlight-color: transparent;
}
</style>