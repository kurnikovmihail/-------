<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { supabase } from "./supabase";
import ProductSelector from "./components/ProductSelector.vue";
import EntryCard from "./components/EntryCard.vue";
import SummaryView from "./components/SummaryView.vue";
import AdminArchive from "./components/AdminArchive.vue";
import ScheduleView from "./components/ScheduleView.vue";
import {
  RotateCw,
  Lock,
  LayoutGrid,
  History,
  ShoppingBasket,
  ChefHat,
  CalendarClock,
} from "lucide-vue-next";

const tg = window.Telegram.WebApp;

// --- СОСТОЯНИЕ ---
const activeTab = ref("main");
const userRole = ref(null);
const products = ref([]);
const dailyEntries = ref([]);
const loading = ref(true);
const userId = tg.initDataUnsafe?.user?.id || null;

// --- ИНИЦИАЛИЗАЦИЯ ---
const initialize = async () => {
  loading.value = true;
  try {
    const { data: prods } = await supabase
      .from("products")
      .select("*")
      .order("name");
    products.value = prods || [];

    if (!userId) {
      userRole.value = "admin";
    } else {
      const { data: user } = await supabase
        .from("allowed_users")
        .select("role")
        .eq("telegram_id", userId)
        .maybeSingle();
      userRole.value = user?.role ? user.role.toLowerCase() : false;
    }

    if (userRole.value) await fetchTodayRecords();
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const fetchTodayRecords = async () => {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("daily_records")
    .select("*, products(name, category, unit)")
    .gte("created_at", today)
    .order("created_at", { ascending: false });

  if (data && data.length > 0) {
    const uniqueMap = new Map();
    data.forEach((item) => {
      if (!uniqueMap.has(item.product_id)) {
        uniqueMap.set(item.product_id, {
          product_id: item.product_id,
          name: item.products.name,
          category: item.products.category,
          arrival: item.arrival || null,
          remainder: item.remainder || null,
          write_off: item.write_off || null,
        });
      }
    });
    dailyEntries.value = Array.from(uniqueMap.values());
  } else {
    dailyEntries.value = [];
  }
};

// --- ДЕЙСТВИЯ ---
const onAddProduct = (p) => {
  if (!dailyEntries.value.find((e) => e.product_id === p.id)) {
    dailyEntries.value.unshift({
      product_id: p.id,
      name: p.name,
      category: p.category,
      arrival: null,
      remainder: null,
      write_off: null,
    });
    tg.HapticFeedback?.impactOccurred("light");
  }
};

const saveReport = async () => {
  if (tg.MainButton) tg.MainButton.showProgress();
  const today = new Date().toISOString().split("T")[0];

  try {
    // Удаляем всё за сегодня перед сохранением
    await supabase.from("daily_records").delete().gte("created_at", today);

    if (dailyEntries.value.length > 0) {
      const { error } = await supabase.from("daily_records").insert(
        dailyEntries.value.map((e) => ({
          product_id: e.product_id,
          arrival:
            e.arrival !== null && e.arrival !== "" ? Number(e.arrival) : 0,
          remainder:
            e.remainder !== null && e.remainder !== ""
              ? Number(e.remainder)
              : 0,
          write_off:
            e.write_off !== null && e.write_off !== ""
              ? Number(e.write_off)
              : 0,
          user_id: userId || 0,
        })),
      );
      if (error) throw error;
    }
    tg.HapticFeedback?.notificationOccurred("success");
    tg.showAlert?.("✅ Сохранено");
  } catch (err) {
    tg.showAlert?.("Ошибка: " + err.message);
  } finally {
    if (tg.MainButton) tg.MainButton.hideProgress();
  }
};

const closeKeyboard = (e) => {
  if (e.target.tagName !== "INPUT") document.activeElement.blur();
};

// --- ГРУППИРОВКА ---
const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [] };
  dailyEntries.value.forEach((e) => {
    if (groups[e.category]) groups[e.category].push(e);
  });
  return groups;
});

// --- ТЕЛЕГРАМ КНОПКА ---
watch(
  [userRole, activeTab, dailyEntries],
  () => {
    if (
      userRole.value &&
      userRole.value !== "chef" &&
      activeTab.value === "main"
    ) {
      tg.MainButton.setParams({
        text: "СОХРАНИТЬ ОТЧЕТ",
        is_visible: true,
        color: "#2563eb",
      });
    } else {
      tg.MainButton.hide();
    }
  },
  { deep: true },
);

onMounted(() => {
  tg.ready();
  tg.expand();
  initialize();
  tg.MainButton.onClick(saveReport);
});
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 text-slate-900 pb-24 select-none touch-manipulation"
    @click="closeKeyboard"
  >
    <header
      class="bg-white/95 backdrop-blur-md p-3 sticky top-0 z-40 border-b border-slate-200 flex justify-between items-center shadow-sm"
    >
      <div @click="initialize">
        <h1
          class="text-lg font-black italic tracking-tighter text-blue-600 leading-none uppercase"
        >
          Cofeyny
        </h1>
        <p
          class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1"
        >
          Смена
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="userRole"
          class="text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100"
          >{{ userRole }}</span
        >
        <button
          @click="initialize"
          class="text-slate-300 active:rotate-180 transition-all duration-500"
        >
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
        <h2 class="text-xs font-black uppercase text-slate-400">
          Доступ ограничен
        </h2>
      </div>
      <div v-else-if="activeTab === 'schedule'">
        <ScheduleView :userRole="userRole" :userId="userId" />
      </div>
      <div v-else>
        <div v-if="activeTab === 'archive' && userRole === 'admin'">
          <AdminArchive />
        </div>

        <div v-else class="space-y-4">
          <ProductSelector
            v-if="userRole !== 'chef'"
            :products="products"
            :dailyEntries="dailyEntries"
            @add="onAddProduct"
          />

          <div v-if="userRole === 'chef'" class="space-y-6">
            <div
              class="bg-blue-600 rounded-2xl p-5 text-white shadow-lg flex items-center justify-between"
            >
              <div>
                <p
                  class="text-[9px] font-black opacity-70 uppercase tracking-widest leading-none"
                >
                  Кухня
                </p>
                <p class="text-xl font-black mt-1">План выпечки</p>
              </div>
              <ChefHat class="w-8 h-8 opacity-40" />
            </div>

            <div
              v-for="(items, cat) in groupedEntries"
              :key="cat"
              class="space-y-2"
            >
              <h3
                v-if="items.length"
                class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"
              >
                <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                {{ cat === "bakery" ? "Выпечка" : "Кондитерка" }}
              </h3>
              <SummaryView :entries="items" />
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(items, cat) in groupedEntries"
              :key="cat"
              class="space-y-1"
            >
              <h3
                v-if="items.length"
                class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] pt-2 pb-1 ml-1 flex items-center gap-1"
              >
                <component
                  :is="cat === 'bakery' ? ShoppingBasket : ChefHat"
                  class="w-2.5 h-2.5"
                />
                {{ cat === "bakery" ? "Выпечка" : "Кондитерка" }}
              </h3>

              <EntryCard
                v-for="item in items"
                :key="item.product_id"
                :item="item"
                @remove="
                  () => {
                    const idx = dailyEntries.indexOf(item);
                    if (idx > -1) dailyEntries.splice(idx, 1);
                    tg.HapticFeedback?.impactOccurred('medium');
                  }
                "
              />
            </div>

            <div
              v-if="dailyEntries.length === 0"
              class="text-center py-10 opacity-20"
            >
              <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
              <p class="text-[10px] font-black uppercase">
                Нет товаров в отчете
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <nav
      v-if="userRole"
      class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 flex justify-around z-[100] pb-safe"
    >
      <button
        @click="activeTab = 'main'"
        :class="activeTab === 'main' ? 'text-blue-600' : 'text-slate-300'"
        class="flex flex-col items-center flex-1 py-3 transition-colors"
      >
        <LayoutGrid class="w-5 h-5" />
        <span class="text-[9px] font-black uppercase mt-1">Смена</span>
      </button>

      <button
        @click="activeTab = 'schedule'"
        :class="activeTab === 'schedule' ? 'text-blue-600' : 'text-slate-300'"
        class="flex flex-col items-center flex-1 py-3 transition-colors"
      >
        <CalendarClock class="w-5 h-5" />
        <span class="text-[9px] font-black uppercase mt-1">График</span>
      </button>

      <button
        v-if="userRole === 'admin'"
        @click="activeTab = 'archive'"
        :class="activeTab === 'archive' ? 'text-blue-600' : 'text-slate-300'"
        class="flex flex-col items-center flex-1 py-3 transition-colors"
      >
        <History class="w-5 h-5" />
        <span class="text-[9px] font-black uppercase mt-1">Архив</span>
      </button>
    </nav>
  </div>
</template>

<style>
::-webkit-scrollbar {
  display: none;
}
* {
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
body {
  background-color: #f8fafc;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  touch-action: pan-x pan-y;
}
/* Добавь это в блок <style> в App.vue */
.pb-safe {
  /* Добавляет отступ под "палку" iPhone, если она есть */
  padding-bottom: env(safe-area-inset-bottom);
}

/* Также обнови padding у основного контейнера, чтобы контент не перекрывался */
.pb-24 {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom));
}
</style>
