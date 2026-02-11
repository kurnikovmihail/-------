<script setup>
import { ref, computed, onMounted } from "vue";
import { supabase } from "../supabase";
import {
  Calendar,
  UserPlus,
  X,
  Trash2,
  Plus,
  Edit3,
  Save,
  AlertCircle,
  History,
} from "lucide-vue-next";

const props = defineProps(["userRole", "userId"]);
const tg = window.Telegram.WebApp;

// --- СОСТОЯНИЕ ---
const shifts = ref([]); // Текущие смены (с учетом локальных правок админа)
const originalShifts = ref([]); // Копия для сравнения (чтобы понимать, что изменилось)
const loading = ref(true);
const isModalOpen = ref(false);
const currentUserName = ref("Бариста"); // Имя текущего пользователя из БД

// Состояние для пакетного сохранения
const pendingDeletes = ref(new Set()); // ID смен для удаления
const unsavedNewShifts = ref([]); // Новые смены, еще не в БД
const isSaving = ref(false);

// Форма
const form = ref({
  id: null,
  date: "",
  start_time: "08:00",
  end_time: "20:00",
  employee_name: null,
});

// --- HELPER: БЕЗОПАСНЫЕ АЛЕРТЫ (для браузера и ТГ) ---
const safeAlert = (msg) => {
  if (tg.showAlert) tg.showAlert(msg);
  else alert(msg);
};

const safeConfirm = (msg, callback) => {
  if (tg.showConfirm) {
    // В Telegram API callback стиль
    tg.showConfirm(msg, (ok) => callback(ok));
  } else {
    // В браузере синхронный стиль
    const ok = window.confirm(msg);
    callback(ok);
  }
};

const triggerHaptic = (type = "light") => {
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type);
};

// --- ИНИЦИАЛИЗАЦИЯ ---
const initialize = async () => {
  loading.value = true;

  // Если мы в телеграме
  if (props.userId) {
    const { data: userData } = await supabase
      .from("allowed_users")
      .select("name")
      .eq("telegram_id", props.userId)
      .maybeSingle();
    if (userData?.name) currentUserName.value = userData.name;
  } else if (props.userRole === "admin") {
    // Если зашли как админ без ТГ (через комп)
    currentUserName.value = "Администратор";
  }

  await fetchShifts();
  loading.value = false;
};

const fetchShifts = async () => {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error(error);
    safeAlert("Ошибка загрузки расписания");
  } else {
    originalShifts.value = JSON.parse(JSON.stringify(data)); // Глубокая копия
    shifts.value = JSON.parse(JSON.stringify(data));
    // Сбрасываем буферы изменений
    pendingDeletes.value.clear();
    unsavedNewShifts.value = [];
  }
};

// --- ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ---

// Есть ли несохраненные изменения у админа
const hasUnsavedChanges = computed(() => {
  return pendingDeletes.value.size > 0 || unsavedNewShifts.value.length > 0;
});

// Группировка по дням
const groupedShifts = computed(() => {
  const groups = {};

  // Объединяем "живые" смены и "новые локальные" смены
  // И исключаем те, что в списке на удаление
  const allToShow = [
    ...shifts.value.filter((s) => !pendingDeletes.value.has(s.id)),
    ...unsavedNewShifts.value,
  ];

  // Сортируем
  allToShow.sort((a, b) => {
    const dateA = new Date(a.date + "T" + a.start_time);
    const dateB = new Date(b.date + "T" + b.start_time);
    return dateA - dateB;
  });

  allToShow.forEach((shift) => {
    if (!groups[shift.date]) groups[shift.date] = [];
    groups[shift.date].push(shift);
  });
  return groups;
});

const formatDateHeader = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const weekDay = date
    .toLocaleDateString("ru-RU", { weekday: "long" })
    .toUpperCase();
  return `${day}.${month} ${weekDay}`;
};

// Проверка на прошедшую дату (для блокировки записи)
const isPastDate = (dateStr) => {
  const today = new Date().toISOString().split("T")[0];
  return dateStr < today;
};

// --- ДЕЙСТВИЯ БАРИСТА (Мгновенные) ---

const bookShift = async (shift) => {
  // Бариста не может записаться, если админ редактирует структуру (во избежание конфликтов)
  if (hasUnsavedChanges.value) {
    safeAlert("Админ редактирует расписание. Подождите сохранения.");
    return;
  }

  // Оптимистичное обновление
  const oldName = shift.employee_name;
  const oldId = shift.employee_tg_id;

  shift.employee_name = currentUserName.value;
  shift.employee_tg_id = props.userId;

  triggerHaptic("medium");

  const { error } = await supabase
    .from("shifts")
    .update({
      employee_name: currentUserName.value,
      employee_tg_id: props.userId,
    })
    .eq("id", shift.id);

  if (error) {
    // Откат
    shift.employee_name = oldName;
    shift.employee_tg_id = oldId;
    safeAlert("Не удалось записаться. Возможно, место занято.");
  }
};

const cancelBooking = async (shift) => {
  const isMe = shift.employee_tg_id == props.userId;
  const confirmText =
    props.userRole === "admin"
      ? `Убрать сотрудника ${shift.employee_name}?`
      : "Отменить вашу запись?";

  safeConfirm(confirmText, async (ok) => {
    if (!ok) return;

    // Сохраняем состояние для отката
    const oldName = shift.employee_name;
    const oldId = shift.employee_tg_id;

    // Оптимистично очищаем
    shift.employee_name = null;
    shift.employee_tg_id = null;
    triggerHaptic("light");

    const { error } = await supabase
      .from("shifts")
      .update({ employee_name: null, employee_tg_id: null })
      .eq("id", shift.id);

    if (error) {
      shift.employee_name = oldName;
      shift.employee_tg_id = oldId;
      safeAlert("Ошибка отмены записи");
    }
  });
};

// --- ДЕЙСТВИЯ АДМИНА (Локальные -> Пакетные) ---

const openModal = (shift = null, datePreselect = null) => {
  if (shift) {
    // Редактирование старых смен я пока отключил из UI для упрощения "пакетности",
    // но можно вернуть. Сейчас модалка только для СОЗДАНИЯ.
    // Если нужно редактировать время существующих - это сложнее при пакетной отправке.
    // Проще: Удалить старую -> Создать новую.
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  form.value = {
    id: null, // null означает, что это новая смена
    date: datePreselect || today,
    start_time: "08:00",
    end_time: "16:00",
    employee_name: null,
  };
  isModalOpen.value = true;
};

const addToDraft = () => {
  // 1. Валидация
  if (!form.value.date || !form.value.start_time || !form.value.end_time)
    return;

  // 2. Проверка дублей (среди существующих И среди новых)
  const isDuplicate = [...shifts.value, ...unsavedNewShifts.value]
    .filter((s) => !pendingDeletes.value.has(s.id)) // Не считаем удаленные
    .some(
      (s) =>
        s.date === form.value.date &&
        s.start_time === form.value.start_time &&
        s.end_time === form.value.end_time,
    );

  if (isDuplicate) {
    safeAlert("Такая смена уже существует!");
    return;
  }

  // 3. Добавление в локальный массив "Новые"
  // Генерируем временный ID (отрицательный + рандом), чтобы Vue v-for не ругался
  const tempId = -(Date.now() + Math.floor(Math.random() * 1000));

  unsavedNewShifts.value.push({
    id: tempId,
    date: form.value.date,
    start_time: form.value.start_time,
    end_time: form.value.end_time,
    employee_name: null,
    employee_tg_id: null,
  });

  isModalOpen.value = false;
  triggerHaptic("success");
};

const markForDeletion = (shift) => {
  // Если это только что созданная (еще не в БД) - просто убираем из массива
  if (shift.id < 0) {
    unsavedNewShifts.value = unsavedNewShifts.value.filter(
      (s) => s.id !== shift.id,
    );
  } else {
    // Если из БД - добавляем в Set на удаление
    pendingDeletes.value.add(shift.id);
  }
  triggerHaptic("warning");
};

// --- СОХРАНЕНИЕ ВСЕГО (АДМИН) ---
const saveAllChanges = async () => {
  isSaving.value = true;

  try {
    // 1. Удаляем отмеченные
    if (pendingDeletes.value.size > 0) {
      const { error: delErr } = await supabase
        .from("shifts")
        .delete()
        .in("id", Array.from(pendingDeletes.value));
      if (delErr) throw delErr;
    }

    // 2. Вставляем новые (убираем временные ID перед отправкой)
    if (unsavedNewShifts.value.length > 0) {
      const recordsToInsert = unsavedNewShifts.value.map(
        ({ id, ...rest }) => rest,
      );
      const { error: insErr } = await supabase
        .from("shifts")
        .insert(recordsToInsert);
      if (insErr) throw insErr;
    }

    // 3. Успех
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    await fetchShifts(); // Перезагружаем чистые данные
  } catch (e) {
    console.error(e);
    safeAlert("Ошибка сохранения: " + e.message);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  initialize();
});
</script>

<template>
  <div class="pb-32">
    <div
      class="px-4 py-3 flex justify-between items-end sticky top-0 bg-slate-50 z-30"
    >
      <h2
        class="text-2xl font-black italic tracking-tighter text-slate-800 uppercase"
      >
        График
      </h2>

      <button
        v-if="userRole === 'admin'"
        @click="openModal()"
        class="bg-white text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold uppercase shadow-sm active:scale-95 transition-transform flex items-center gap-1"
      >
        <Plus class="w-3.5 h-3.5" />
        Добавить
      </button>
    </div>

    <div v-if="loading" class="text-center py-10 opacity-50">
      <div
        class="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"
      ></div>
      <span class="text-[10px] font-bold uppercase"
        >Загрузка расписания...</span
      >
    </div>

    <div v-else class="space-y-6 px-3">
      <div v-for="(dayShifts, date) in groupedShifts" :key="date">
        <div class="flex items-center gap-2 mb-2 ml-1">
          <Calendar class="w-4 h-4 text-blue-500" />
          <h3
            class="text-sm font-black text-slate-700 uppercase tracking-tight"
          >
            {{ formatDateHeader(date) }}
          </h3>
          <button
            v-if="userRole === 'admin'"
            @click="openModal(null, date)"
            class="text-slate-300 hover:text-blue-500 p-1"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="shift in dayShifts"
            :key="shift.id"
            class="bg-white rounded-xl p-3 border shadow-sm flex items-center justify-between relative overflow-hidden transition-all duration-300"
            :class="
              shift.id < 0
                ? 'border-blue-300 bg-blue-50/30'
                : 'border-slate-100'
            "
          >
            <div class="flex items-center gap-2 z-10">
              <div
                class="px-2 py-1 rounded text-[11px] font-black text-slate-600 border border-slate-100 bg-slate-50"
              >
                {{ shift.start_time }} – {{ shift.end_time }}
              </div>
              <span
                v-if="shift.id < 0"
                class="text-[8px] font-black bg-blue-500 text-white px-1 rounded uppercase"
                >New</span
              >
            </div>

            <div class="flex items-center gap-3 z-10">
              <div
                v-if="shift.employee_name"
                class="flex items-center gap-2 bg-blue-50 pl-2 pr-1 py-1 rounded-lg border border-blue-100"
              >
                <span
                  class="text-[11px] font-bold text-blue-700 truncate max-w-[80px]"
                >
                  {{ shift.employee_name }}
                </span>

                <button
                  v-if="userRole === 'admin' || shift.employee_tg_id == userId"
                  @click="cancelBooking(shift)"
                  class="bg-white rounded p-0.5 shadow-sm text-red-400 active:text-red-600"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>

              <button
                @click="bookShift(shift)"
                :disabled="isPastDate(shift.date)"
                :class="[
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow transition-all',
                  isPastDate(shift.date)
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-800 text-white active:scale-95',
                ]"
              >
                <History v-if="isPastDate(shift.date)" class="w-3 h-3" />
                <UserPlus v-else class="w-3 h-3" />
                {{ isPastDate(shift.date) ? "Прошло" : "Запись" }}
              </button>

              <button
                v-if="userRole === 'admin'"
                @click="markForDeletion(shift)"
                class="ml-2 text-slate-300 active:text-red-500 p-1"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="Object.keys(groupedShifts).length === 0"
        class="text-center py-10 opacity-40"
      >
        <p class="text-xs font-bold uppercase">Расписание пусто</p>
      </div>
    </div>

    <div
      v-if="hasUnsavedChanges && userRole === 'admin'"
      class="fixed z-[110] left-4 right-4 animate-in slide-in-from-bottom-5 fade-in"
      style="bottom: calc(80px + env(safe-area-inset-bottom))"
    >
      <button
        @click="saveAllChanges"
        :disabled="isSaving"
        class="w-full bg-blue-600 text-white py-3 rounded-xl shadow-xl shadow-blue-200/50 flex items-center justify-center gap-2 font-black uppercase text-sm tracking-wide active:scale-95 transition-all"
      >
        <span
          v-if="isSaving"
          class="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"
        ></span>
        <Save v-else class="w-4 h-4" />
        Сохранить изменения ({{
          unsavedNewShifts.length + pendingDeletes.size
        }})
      </button>
    </div>

    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div
        class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 animate-in slide-in-from-bottom-10 fade-in duration-200"
      >
        <h3 class="text-lg font-black italic text-slate-800 mb-4 uppercase">
          Новая смена
        </h3>

        <div class="space-y-4">
          <div>
            <label
              class="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1"
              >Дата</label
            >
            <input
              type="date"
              v-model="form.date"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div class="flex gap-3">
            <div class="flex-1">
              <label
                class="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1"
                >Начало</label
              >
              <input
                type="time"
                v-model="form.start_time"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-center outline-none focus:border-blue-500"
              />
            </div>
            <div class="flex-1">
              <label
                class="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1"
                >Конец</label
              >
              <input
                type="time"
                v-model="form.end_time"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-center outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div class="flex gap-2 mt-6">
          <button
            @click="isModalOpen = false"
            class="flex-1 py-3 text-xs font-bold uppercase text-slate-500 bg-slate-100 rounded-xl"
          >
            Отмена
          </button>
          <button
            @click="addToDraft"
            class="flex-1 py-3 text-xs font-bold uppercase text-white bg-blue-600 rounded-xl shadow-lg shadow-blue-200"
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
