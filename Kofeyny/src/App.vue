<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from './supabase';
import { 
  Plus, Minus, RotateCw, Save, Lock, Trash2, PlusCircle, LayoutList
} from 'lucide-vue-next';

const tg = window.Telegram.WebApp;

// Состояние
const products = ref([]); // Весь справочник
const dailyEntries = ref([]); // То, что сотрудник добавил в текущую сессию
const loading = ref(true);
const userRole = ref(null);
const userId = tg.initDataUnsafe?.user?.id || null;

// Загрузка справочника и проверка доступа
const initialize = async () => {
  loading.value = true;
  
  // 1. Проверка доступа
  const { data: user } = await supabase.from('allowed_users').select('role').eq('telegram_id', userId).single();
  if (!user) { userRole.value = false; loading.value = false; return; }
  userRole.value = user.role;

  // 2. Загрузка справочника товаров
  const { data: prods } = await supabase.from('products').select('*').order('name');
  products.value = prods;

  // 3. Загрузка сегодняшних записей (если уже заполняли)
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('daily_records')
    .select('*, products(name, category, unit)')
    .gte('created_at', today);
  
  if (existing) {
    dailyEntries.value = existing.map(e => ({
      id: e.id,
      product_id: e.product_id,
      name: e.products.name,
      category: e.products.category,
      arrival: e.arrival,
      remainder: e.remainder,
      write_off: e.write_off
    }));
  }
  
  loading.value = false;
};

// Добавление новой строки в отчет
const addEntry = (product) => {
  // Проверяем, нет ли уже этого товара в списке
  if (dailyEntries.value.find(e => e.product_id === product.id)) {
    tg.showAlert("Этот товар уже добавлен");
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
  tg.HapticFeedback.impactOccurred('medium');
};

const removeEntry = (index) => {
  dailyEntries.value.splice(index, 1);
};

// Сохранение
const saveReport = async () => {
  tg.MainButton.showProgress();
  const { error } = await supabase.from('daily_records').upsert(
    dailyEntries.value.map(e => ({
      product_id: e.product_id,
      arrival: e.arrival,
      remainder: e.remainder,
      write_off: e.write_off,
      user_id: userId
    }))
  );

  tg.MainButton.hideProgress();
  if (!error) {
    tg.showAlert("Отчет сохранен успешно!");
    tg.HapticFeedback.notificationOccurred('success');
  }
};

onMounted(() => {
  tg.ready();
  tg.expand();
  initialize();
  tg.MainButton.setText("СОХРАНИТЬ ВЕСЬ УЧЕТ");
  tg.MainButton.onClick(saveReport);
});

// Группировка для отображения
const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [] };
  dailyEntries.value.forEach(e => groups[e.category]?.push(e));
  return groups;
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 pb-40 font-sans">
    
    <div v-if="loading" class="flex flex-col items-center justify-center h-screen space-y-4">
       <RotateCw class="w-8 h-8 animate-spin text-blue-500" />
    </div>

    <div v-else-if="userRole === false" class="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <div class="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6">
        <Lock class="w-10 h-10" />
      </div>
      <h1 class="text-2xl font-black text-slate-800">Доступ закрыт</h1>
      <p class="text-slate-500 mt-3 leading-relaxed">
        Вас нет в списке сотрудников.<br>
        <span class="font-mono text-xs bg-slate-200 px-1 rounded">ID: {{ userId || 'не определен' }}</span>
      </p>
      <button @click="checkAccess" class="mt-8 text-blue-600 font-bold flex items-center gap-2">
        <RotateCw class="w-4 h-4" /> Попробовать снова
      </button>
    </div>

    <div v-else>
      <header class="bg-white p-4 sticky top-0 z-20 border-b border-slate-200 shadow-sm">
        <h1 class="text-lg font-black text-slate-800">Учет смены</h1>
        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Заполнение прихода и остатков</p>
      </header>

      <main v-if="userRole === 'staff'" class="p-4 space-y-6">
        
        <section>
          <h2 class="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <PlusCircle class="w-4 h-4" /> Добавить позицию в отчет
          </h2>
          <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button v-for="p in products" :key="p.id" 
                    @click="addEntry(p)"
                    class="flex-shrink-0 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm active:bg-blue-50 transition-colors">
              {{ p.name }}
            </button>
          </div>
        </section>

        <div v-for="(items, cat) in groupedEntries" :key="cat">
          <h2 v-if="items.length" class="text-xs font-black text-slate-400 uppercase mb-3 tracking-widest px-1">
            {{ cat === 'bakery' ? 'Выпечка' : 'Кондитерка' }}
          </h2>
          
          <div class="space-y-3">
            <div v-for="(item, idx) in items" :key="item.product_id" 
                 class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative">
              
              <div class="flex justify-between items-start mb-4">
                <h3 class="font-bold text-slate-800">{{ item.name }}</h3>
                <button @click="removeEntry(idx)" class="text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Приход</label>
                  <input type="number" v-model="item.arrival" class="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 text-center font-bold text-blue-600 focus:ring-2 ring-blue-100 outline-none" />
                </div>
                <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Остаток</label>
                  <input type="number" v-model="item.remainder" class="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 text-center font-bold text-green-600 focus:ring-2 ring-green-100 outline-none" />
                </div>
                <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Списание</label>
                  <input type="number" v-model="item.write_off" class="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 text-center font-bold text-red-500 focus:ring-2 ring-red-100 outline-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="dailyEntries.length === 0" class="py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
           <LayoutList class="w-10 h-10 mx-auto mb-2 opacity-20" />
           <p class="text-sm font-medium">Список пуст.<br>Добавьте товары сверху.</p>
        </div>
      </main>

      <main v-if="userRole === 'chef'" class="p-4 space-y-4">
        <div v-for="item in dailyEntries" :key="item.id" 
             class="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
           <div>
             <p class="font-bold text-slate-800">{{ item.name }}</p>
             <p class="text-[10px] text-slate-400 uppercase">Остаток на конец смены</p>
           </div>
           <div class="text-2xl font-black text-blue-600">
             {{ item.remainder }} <span class="text-xs text-slate-300 font-bold uppercase tracking-tighter">шт</span>
           </div>
        </div>
      </main>
    </div>

    <div v-if="userRole === 'staff' && !loading" class="fixed bottom-6 left-0 right-0 px-4">
       <button @click="saveReport" class="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-200 active:scale-95 transition-all">
         СОХРАНИТЬ ОТЧЕТ
       </button>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>