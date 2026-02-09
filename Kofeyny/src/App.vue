<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from './supabase';
import { 
  Plus, Minus, RotateCw, Save, Lock, Trash2, PlusCircle, LayoutList, ShoppingBasket, ChefHat
} from 'lucide-vue-next';

const tg = window.Telegram.WebApp;

// Состояние
const products = ref([]); 
const dailyEntries = ref([]); 
const loading = ref(true);
const userRole = ref(null);
const userId = tg.initDataUnsafe?.user?.id || null;

// Инициализация
const initialize = async () => {
  loading.value = true;
  
  // 1. Загружаем товары (это работает всегда)
  const { data: prods } = await supabase.from('products').select('*').order('name');
  products.value = prods || [];

  // 2. Логика доступа
  if (!userId) {
    // Если мы на ноуте (userId == null)
    console.log("Локальный тест: ставим staff");
    userRole.value = 'staff'; 
  } else {
    // Если мы в Telegram (userId есть)
    const { data: user } = await supabase
      .from('allowed_users')
      .select('role')
      .eq('telegram_id', userId)
      .single();

    if (user) {
      userRole.value = user.role;
      // Загружаем записи за сегодня, если они есть
      await fetchTodayRecords();
    } else {
      userRole.value = false; // Доступ запрещен
    }
  }
  loading.value = false;
};

// Вынесем загрузку записей в отдельную функцию для чистоты
const fetchTodayRecords = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('daily_records')
    .select('*, products(name, category, unit)')
    .gte('created_at', today);
  
  if (existing && existing.length > 0) {
    dailyEntries.value = existing.map(e => ({
      product_id: e.product_id,
      name: e.products?.name,
      category: e.products?.category,
      arrival: e.arrival,
      remainder: e.remainder,
      write_off: e.write_off
    }));
  }
};

// Добавление позиции
const addEntry = (product) => {
  if (dailyEntries.value.find(e => e.product_id === product.id)) {
    tg.showAlert?.("Этот товар уже в списке");
    return;
  }
  
  dailyEntries.value.push({
    product_id: product.id,
    name: product.name,
    category: product.category,
    arrival: 0,
    remainder: 0,
    write_off: 0
  });
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

const removeEntry = (index) => {
  dailyEntries.value.splice(index, 1);
};

// Сохранение
const saveReport = async () => {
  if (dailyEntries.value.length === 0) {
    alert("Добавьте хотя бы один товар");
    return;
  }

  if (tg.MainButton) tg.MainButton.showProgress();

  const { error } = await supabase.from('daily_records').upsert(
    dailyEntries.value.map(e => ({
      product_id: e.product_id,
      arrival: e.arrival,
      remainder: e.remainder,
      write_off: e.write_off,
      user_id: userId || 0 // 0 для тестов
    }))
  );

  if (tg.MainButton) tg.MainButton.hideProgress();

  if (!error) {
    if (tg.showAlert) tg.showAlert("Отчет сохранен!");
    else alert("Отчет сохранен!");
  } else {
    alert("Ошибка: " + error.message);
  }
};

onMounted(() => {
  tg.ready();
  tg.expand();
  initialize();
  
  if (userId) {
    tg.MainButton.setParams({ text: "СОХРАНИТЬ ОТЧЕТ", is_visible: true, color: '#2563eb' });
    tg.MainButton.onClick(saveReport);
  }
});

const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [] };
  dailyEntries.value.forEach(e => {
    if (groups[e.category]) groups[e.category].push(e);
  });
  return groups;
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 pb-40 font-sans text-slate-900">
    
    <div v-if="loading" class="flex flex-col items-center justify-center h-screen space-y-4">
       <RotateCw class="w-8 h-8 animate-spin text-blue-500" />
       <p class="text-sm text-slate-400">Синхронизация...</p>
    </div>

    <div v-else-if="userRole === false" class="flex flex-col items-center justify-center h-screen p-10 text-center">
       <Lock class="w-16 h-16 text-red-400 mb-4" />
       <h1 class="text-xl font-bold">Доступ ограничен</h1>
       <p class="text-slate-500 text-sm mt-2">ID: {{ userId }}</p>
    </div>

    <div v-else>
      <header class="bg-white/80 backdrop-blur-md p-4 sticky top-0 z-30 border-b border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <h1 class="text-lg font-black tracking-tight">Cofeyny <span class="text-blue-500">PRO</span></h1>
          <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Учет продукции</p>
        </div>
        <div class="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold uppercase text-slate-500">
          {{ userRole === 'staff' ? 'Бариста' : 'Повар' }}
        </div>
      </header>

      <main class="p-4 space-y-6">
        <section v-if="userRole === 'staff'">
          <h2 class="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">
            <PlusCircle class="w-3 h-3" /> Нажмите, чтобы добавить:
          </h2>
          <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button v-for="p in products" :key="p.id" 
                    @click="addEntry(p)"
                    class="flex-shrink-0 bg-white border-2 border-transparent active:border-blue-500 px-4 py-2 rounded-2xl text-xs font-black shadow-sm transition-all">
              {{ p.name }}
            </button>
          </div>
        </section>

        <div v-if="userRole === 'staff'" v-for="(items, cat) in groupedEntries" :key="cat">
          <div v-if="items.length" class="mb-6 space-y-4">
            <div class="flex items-center gap-2">
              <component :is="cat === 'bakery' ? ShoppingBasket : ChefHat" class="w-4 h-4 text-slate-400" />
              <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest">{{ cat === 'bakery' ? 'Выпечка' : 'Кондитерка' }}</h2>
            </div>
            
            <div v-for="(item, idx) in items" :key="item.product_id" 
                 class="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
              <div class="flex justify-between items-center mb-4">
                <span class="font-black text-slate-700">{{ item.name }}</span>
                <button @click="removeEntry(idx)" class="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <div class="grid grid-cols-3 gap-4">
                <div class="space-y-2">
                  <p class="text-[9px] font-black text-slate-400 uppercase text-center">Пришло</p>
                  <input type="number" v-model.number="item.arrival" class="w-full bg-blue-50/50 border-2 border-blue-100 rounded-xl py-3 text-center font-black text-blue-600 outline-none focus:border-blue-500 transition-all" />
                </div>
                <div class="space-y-2">
                  <p class="text-[9px] font-black text-slate-400 uppercase text-center">Остаток</p>
                  <input type="number" v-model.number="item.remainder" class="w-full bg-green-50/50 border-2 border-green-100 rounded-xl py-3 text-center font-black text-green-600 outline-none focus:border-green-500 transition-all" />
                </div>
                <div class="space-y-2">
                  <p class="text-[9px] font-black text-slate-400 uppercase text-center">Списание</p>
                  <input type="number" v-model.number="item.write_off" class="w-full bg-red-50/50 border-2 border-red-100 rounded-xl py-3 text-center font-black text-red-500 outline-none focus:border-red-500 transition-all" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="userRole === 'staff' && dailyEntries.length === 0" class="py-20 text-center">
           <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
             <LayoutList class="w-8 h-8 text-slate-200" />
           </div>
           <p class="text-sm font-bold text-slate-400">Сегодня еще ничего не добавили</p>
        </div>

        <div v-if="userRole === 'chef'" class="space-y-3">
          <div v-for="item in dailyEntries" :key="item.product_id" class="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
             <span class="font-bold text-slate-700">{{ item.name }}</span>
             <div class="flex gap-2">
               <span class="px-3 py-1 bg-green-100 text-green-600 rounded-lg text-xs font-black">Ост: {{ item.remainder }}</span>
               <span class="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-black">Спис: {{ item.write_off }}</span>
             </div>
          </div>
        </div>
      </main>

      <div v-if="userRole === 'staff' && !userId" class="fixed bottom-6 left-0 right-0 px-4">
         <button @click="saveReport" class="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all">
           СОХРАНИТЬ ОТЧЕТ
         </button>
      </div>
    </div>
  </div>
</template>

<style>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>