<script setup>
import { ref, computed, onMounted } from 'vue';
import { supabase } from '../supabase';
import { 
  Calendar, UserPlus, X, Trash2, Plus, 
  Save, History, Check, HandHelping, Bell
} from 'lucide-vue-next';

const props = defineProps(['userRole', 'userId']);
const tg = window.Telegram.WebApp;

// --- СОСТОЯНИЕ ---
const shifts = ref([]); 
const loading = ref(true);
const isModalOpen = ref(false);
const isExtraShift = ref(false); // Флаг: создаем обычную смену или "помощь"
const currentUserName = ref('Сотрудник');
const showPending = ref(false); // Переключатель видимости заявок для админа

// Состояние для админа (локальные правки)
const pendingDeletes = ref(new Set());
const unsavedNewShifts = ref([]);
const isSaving = ref(false);

const form = ref({ date: '', start_time: '08:00', end_time: '16:00' });

// --- HELPERS ---
const safeAlert = (msg) => tg.showAlert ? tg.showAlert(msg) : alert(msg);
const safeConfirm = (msg, callback) => {
  if (tg.showConfirm) tg.showConfirm(msg, (ok) => callback(ok));
  else callback(window.confirm(msg));
};
const triggerHaptic = (type = 'light') => tg.HapticFeedback?.impactOccurred(type);

// --- ИНИЦИАЛИЗАЦИЯ ---
const initialize = async () => {
  loading.value = true;
  if (props.userId) {
    const { data } = await supabase.from('allowed_users').select('name').eq('telegram_id', props.userId).maybeSingle();
    if (data?.name) currentUserName.value = data.name;
  }
  await fetchShifts();
  loading.value = false;
};

const fetchShifts = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('shifts').select('*').gte('date', today).order('date').order('start_time');
  if (data) {
    shifts.value = data;
    pendingDeletes.value.clear();
    unsavedNewShifts.value = [];
  }
};

// --- ГРУППИРОВКА ---
const approvedShifts = computed(() => {
  return [
    ...shifts.value.filter(s => s.status === 'approved' && !pendingDeletes.value.has(s.id)),
    ...unsavedNewShifts.value
  ].sort((a, b) => new Date(a.date + 'T' + a.start_time) - new Date(b.date + 'T' + b.start_time));
});

const groupedShifts = computed(() => {
  const groups = {};
  approvedShifts.value.forEach(s => {
    if (!groups[s.date]) groups[s.date] = [];
    groups[s.date].push(s);
  });
  return groups;
});

const pendingRequests = computed(() => shifts.value.filter(s => s.status === 'pending'));

// --- ДЕЙСТВИЯ ---

// 1. Запись на существующую смену
const bookShift = (shift) => {
  if (shift.employee_name) return; // Защита: уже занято

  safeConfirm(`Записаться на смену ${shift.start_time}-${shift.end_time}?`, async (ok) => {
    if (!ok) return;
    
    const { error } = await supabase.from('shifts')
      .update({ employee_name: currentUserName.value, employee_tg_id: props.userId })
      .eq('id', shift.id);

    if (!error) {
      shift.employee_name = currentUserName.value;
      shift.employee_tg_id = props.userId;
      triggerHaptic('success');
    } else safeAlert('Ошибка записи');
  });
};

// 2. Создание смены (Админ или Помощь)
const openModal = (date = null, isHelp = false) => {
  isExtraShift.value = isHelp;
  form.value = {
    date: date || new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00'
  };
  isModalOpen.value = true;
};

const handleSaveModal = async () => {
  if (isExtraShift.value) {
    // Сотрудник просит доп. смену (сразу в БД со статусом pending)
    const { error } = await supabase.from('shifts').insert({
      ...form.value,
      employee_name: currentUserName.value,
      employee_tg_id: props.userId,
      status: 'pending'
    });
    if (!error) {
      safeAlert('Заявка отправлена админу ✅');
      await fetchShifts();
    }
  } else {
    // Админ добавляет в черновик
    const tempId = -Date.now();
    unsavedNewShifts.value.push({ ...form.value, id: tempId, status: 'approved', employee_name: null });
  }
  isModalOpen.value = false;
};

// 3. Управление заявками (Админ)
const approveRequest = async (shift) => {
  const { error } = await supabase.from('shifts').update({ status: 'approved' }).eq('id', shift.id);
  if (!error) {
    shift.status = 'approved';
    triggerHaptic('success');
  }
};

const rejectRequest = async (shiftId) => {
  const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
  if (!error) {
    shifts.value = shifts.value.filter(s => s.id !== shiftId);
    triggerHaptic('warning');
  }
};

// Пакетное сохранение структуры (удаление/создание)
const saveStructure = async () => {
  isSaving.value = true;
  if (pendingDeletes.value.size > 0) {
    await supabase.from('shifts').delete().in('id', Array.from(pendingDeletes.value));
  }
  if (unsavedNewShifts.value.length > 0) {
    const toInsert = unsavedNewShifts.value.map(({ id, ...rest }) => rest);
    await supabase.from('shifts').insert(toInsert);
  }
  await fetchShifts();
  isSaving.value = false;
};

onMounted(initialize);
</script>

<template>
  <div class="pb-32">
    <div class="px-4 py-3 flex justify-between items-center sticky top-0 bg-slate-50 z-30">
      <h2 class="text-2xl font-black italic tracking-tighter text-slate-800 uppercase">График</h2>
      
      <div class="flex gap-2">
        <button v-if="userRole === 'admin' && pendingRequests.length > 0" 
                @click="showPending = !showPending"
                class="relative p-2 bg-white border border-blue-100 rounded-xl text-blue-600 shadow-sm">
          <Bell class="w-5 h-5" :class="{'animate-swing': pendingRequests.length > 0}" />
          <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
            {{ pendingRequests.length }}
          </span>
        </button>

        <button v-if="userRole === 'admin'" @click="openModal()" 
                class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase">
          + Смена
        </button>
        <button v-else @click="openModal(null, true)" 
                class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1">
          <HandHelping class="w-3 h-3" /> Помочь
        </button>
      </div>
    </div>

    <div v-if="showPending && userRole === 'admin'" class="px-3 mb-6 animate-in slide-in-from-top duration-300">
      <div class="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-2xl p-3">
        <h4 class="text-[10px] font-black text-blue-600 uppercase mb-3 flex items-center gap-2">
          <Bell class="w-3 h-3" /> Новые заявки на смену
        </h4>
        <div class="space-y-2">
          <div v-for="req in pendingRequests" :key="req.id" 
               class="bg-white p-3 rounded-xl shadow-sm border border-blue-100 flex justify-between items-center">
            <div>
              <p class="text-[10px] font-black text-slate-400 uppercase">{{ formatDateHeader(req.date) }}</p>
              <p class="text-xs font-bold text-slate-700">{{ req.start_time }}-{{ req.end_time }} · <span class="text-blue-600">{{ req.employee_name }}</span></p>
            </div>
            <div class="flex gap-1">
              <button @click="rejectRequest(req.id)" class="p-2 text-red-500 bg-red-50 rounded-lg"><X class="w-4 h-4"/></button>
              <button @click="approveRequest(req)" class="p-2 text-green-600 bg-green-50 rounded-lg"><Check class="w-4 h-4"/></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading" class="px-3 space-y-6">
      <div v-for="(dayShifts, date) in groupedShifts" :key="date">
        <h3 class="text-xs font-black text-slate-400 uppercase mb-2 ml-1">{{ formatDateHeader(date) }}</h3>
        <div class="space-y-2">
          <div v-for="s in dayShifts" :key="s.id" 
               class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-black bg-slate-50 px-2 py-1 rounded border border-slate-100">{{ s.start_time }}-{{ s.end_time }}</span>
              <span v-if="s.id < 0" class="text-[8px] font-black bg-blue-500 text-white px-1 rounded uppercase tracking-tighter">Черновик</span>
            </div>

            <div class="flex items-center gap-2">
              <div v-if="s.employee_name" class="flex items-center gap-2 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                <span class="text-[11px] font-bold text-blue-700">{{ s.employee_name }}</span>
                <button v-if="userRole === 'admin' || s.employee_tg_id == userId" 
                        @click="cancelBooking(s)" class="text-red-400"><X class="w-3.5 h-3.5"/></button>
              </div>
              <button v-else @click="bookShift(s)" 
                      class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase">
                Запись
              </button>
              <button v-if="userRole === 'admin'" @click="markForDeletion(s)" class="text-slate-200 ml-1"><Trash2 class="w-4 h-4"/></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="(unsavedNewShifts.length > 0 || pendingDeletes.size > 0) && userRole === 'admin'" 
         class="fixed bottom-[calc(85px+env(safe-area-inset-bottom))] left-4 right-4 z-[100]">
      <button @click="saveStructure" :disabled="isSaving"
              class="w-full bg-blue-600 text-white py-3.5 rounded-2xl shadow-xl font-black uppercase text-xs flex items-center justify-center gap-2">
        <Save class="w-4 h-4" /> Сохранить изменения
      </button>
    </div>

    <div v-if="isModalOpen" class="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
      <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-black uppercase tracking-tighter">{{ isExtraShift ? 'Доп. смена (Помощь)' : 'Новая смена' }}</h3>
          <button @click="isModalOpen = false" class="text-slate-300"><X class="w-6 h-6"/></button>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Дата</label>
            <input type="date" v-model="form.date" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold mt-1 outline-none focus:ring-2 ring-blue-500/20" />
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-[10px] font-black text-slate-400 uppercase ml-1">С</label>
              <input type="time" v-model="form.start_time" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold mt-1 text-center" />
            </div>
            <div class="flex-1">
              <label class="text-[10px] font-black text-slate-400 uppercase ml-1">До</label>
              <input type="time" v-model="form.end_time" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold mt-1 text-center" />
            </div>
          </div>
        </div>

        <button @click="handleSaveModal" 
                class="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs mt-8 shadow-lg shadow-blue-200">
          {{ isExtraShift ? 'Отправить заявку' : 'Добавить в график' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes swing {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(10deg); }
  40% { transform: rotate(-10deg); }
  60% { transform: rotate(5deg); }
  80% { transform: rotate(-5deg); }
}
.animate-swing { animation: swing 2s infinite; }
</style>