<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../supabase';
import { Calendar, Clock, User, Check } from 'lucide-vue-next';

const props = defineProps({
  lockedMode: { type: String, default: '' },
  hideToggle: { type: Boolean, default: false }
});

const tg = window.Telegram?.WebApp || null;
const safeAlert = (msg) => tg?.showAlert ? tg.showAlert(msg) : alert(msg);

const archiveMode = ref(props.lockedMode || 'records');
const recordsHistory = ref({});
const shifts = ref([]);

const recordsLoading = ref(false);
const shiftsLoading = ref(false);
const recordsLoaded = ref(false);
const shiftsLoaded = ref(false);

const showPaid = ref(false);
const selectedEmployee = ref('all');

const formatDateLabel = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
};

const parseShiftHours = (shift) => {
  if (!shift?.date || !shift?.start_time || !shift?.end_time) return 0;
  const start = new Date(`${shift.date}T${shift.start_time}`);
  const end = new Date(`${shift.date}T${shift.end_time}`);
  if (end <= start) end.setDate(end.getDate() + 1);
  const diff = (end - start) / 3600000;
  return diff > 0 ? diff : 0;
};

const formatHours = (hours) => {
  const rounded = Math.round(hours * 10) / 10;
  return String(rounded).replace('.', ',');
};

const baseShifts = computed(() => shifts.value.filter(s => (s.status || 'approved') === 'approved' && s.employee_name));

const employees = computed(() => {
  const map = new Map();
  baseShifts.value.forEach(s => {
    const key = s.employee_tg_id ? `tg:${s.employee_tg_id}` : `name:${s.employee_name}`;
    if (!map.has(key)) map.set(key, { key, name: s.employee_name });
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
});

const visibleShifts = computed(() => baseShifts.value.filter(s => (showPaid.value ? true : !s.is_paid)));

const filteredShifts = computed(() => {
  return visibleShifts.value.filter(s => {
    if (selectedEmployee.value === 'all') return true;
    if (selectedEmployee.value.startsWith('tg:')) return String(s.employee_tg_id) === selectedEmployee.value.slice(3);
    return s.employee_name === selectedEmployee.value.slice(5);
  });
});

const groupedShiftHistory = computed(() => {
  const sorted = [...filteredShifts.value].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
  const list = [];
  const map = new Map();
  sorted.forEach(s => {
    const label = formatDateLabel(s.date);
    if (!map.has(label)) {
      const group = { label, items: [] };
      map.set(label, group);
      list.push(group);
    }
    map.get(label).items.push(s);
  });
  return list;
});

const totalHoursAll = computed(() => visibleShifts.value.reduce((sum, s) => sum + parseShiftHours(s), 0));
const totalHoursSelected = computed(() => {
  if (selectedEmployee.value === 'all') return null;
  return filteredShifts.value.reduce((sum, s) => sum + parseShiftHours(s), 0);
});

const loadRecords = async () => {
  recordsLoading.value = true;
  const { data } = await supabase
    .from('daily_records')
    .select('*, products(name)')
    .order('created_at', { ascending: false });

  if (data) {
    const groups = {};
    data.forEach(rec => {
      const date = formatDateLabel(rec.created_at);
      if (!groups[date]) groups[date] = [];
      if (!groups[date].find(i => i.product_id === rec.product_id)) {
        groups[date].push(rec);
      }
    });
    recordsHistory.value = groups;
  }
  recordsLoading.value = false;
  recordsLoaded.value = true;
};

const loadShifts = async () => {
  shiftsLoading.value = true;
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) {
    console.error(error);
    safeAlert('Ошибка загрузки смен');
  }
  shifts.value = data || [];
  shiftsLoading.value = false;
  shiftsLoaded.value = true;
};

const togglePaid = async (shift) => {
  const next = !shift.is_paid;
  const prev = shift.is_paid;
  shift.is_paid = next;
  const { error } = await supabase.from('shifts').update({ is_paid: next }).eq('id', shift.id);
  if (error) {
    shift.is_paid = prev;
    safeAlert('Не удалось обновить статус оплаты');
  }
};

watch(archiveMode, async (mode) => {
  if (mode === 'records' && !recordsLoaded.value) await loadRecords();
  if (mode === 'shifts' && !shiftsLoaded.value) await loadShifts();
});

onMounted(async () => {
  await loadRecords();
  if (props.lockedMode) archiveMode.value = props.lockedMode;
});
</script>

<template>
  <div class="space-y-4 pb-10">
    <div v-if="!hideToggle" class="flex items-center gap-2 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm">
      <button
        @click="archiveMode = 'records'"
        :class="archiveMode === 'records' ? 'bg-blue-600 text-white' : 'text-slate-500'"
        class="flex-1 text-[10px] font-black uppercase py-1.5 rounded-xl transition-colors"
      >
        Остатки
      </button>
      <button
        @click="archiveMode = 'shifts'"
        :class="archiveMode === 'shifts' ? 'bg-blue-600 text-white' : 'text-slate-500'"
        class="flex-1 text-[10px] font-black uppercase py-1.5 rounded-xl transition-colors"
      >
        Смены
      </button>
    </div>

    <div v-if="archiveMode === 'records'">
      <div v-if="recordsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка истории...
      </div>

      <div v-else-if="Object.keys(recordsHistory).length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Архив пуст
      </div>

      <div v-for="(records, date) in recordsHistory" :key="date" class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
        <div class="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center gap-2">
          <Calendar class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{{ date }}</span>
        </div>
        
        <div class="p-2 space-y-1.5">
          <div v-for="r in records" :key="r.id" class="flex justify-between items-center text-[11px] font-bold">
            <span class="text-slate-700 truncate mr-2">{{ r.products?.name || 'Удален' }}</span>
            <div class="flex gap-1.5 flex-shrink-0">
              <span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">П:{{ r.arrival }}</span>
              <span class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded">О:{{ r.remainder }}</span>
              <span class="px-1.5 py-0.5 bg-red-50 text-red-500 rounded">С:{{ r.write_off }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="bg-white rounded-2xl p-2.5 border border-slate-100 shadow-sm space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-blue-500" />
            <span class="text-[10px] font-black uppercase text-slate-600">Часы работы</span>
          </div>
          <div class="text-[12px] font-black text-slate-800">{{ formatHours(totalHoursAll) }} ч</div>
        </div>

        <div class="flex gap-2">
          <div class="flex-1 bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-100">
            <label class="text-[9px] font-black uppercase text-slate-400">Сотрудник</label>
            <div class="flex items-center gap-2 mt-1">
              <User class="w-3.5 h-3.5 text-slate-400" />
              <select v-model="selectedEmployee" class="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">Все</option>
                <option v-for="e in employees" :key="e.key" :value="e.key">{{ e.name }}</option>
              </select>
            </div>
          </div>

          <button
            @click="showPaid = !showPaid"
            class="bg-slate-800 text-white text-[9px] font-black uppercase px-3 rounded-xl shadow-md"
          >
            {{ showPaid ? 'Скрыть оплач.' : 'Показать все' }}
          </button>
        </div>

        <div v-if="totalHoursSelected !== null" class="text-[10px] font-black text-slate-500 uppercase">
          Итого по сотруднику: {{ formatHours(totalHoursSelected) }} ч
        </div>
      </div>

      <div v-if="shiftsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка смен...
      </div>

      <div v-else-if="groupedShiftHistory.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Смен нет
      </div>

      <div v-for="group in groupedShiftHistory" :key="group.label" class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
        <div class="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center gap-2">
          <Calendar class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{{ group.label }}</span>
        </div>
        <div class="p-2 space-y-1.5">
          <div v-for="s in group.items" :key="s.id" class="flex items-center justify-between text-[11px] font-bold">
            <div class="min-w-0">
              <div class="text-slate-700 truncate">{{ s.employee_name }}</div>
              <div class="text-[10px] text-slate-400 font-black">
                {{ s.start_time }}–{{ s.end_time }} • {{ formatHours(parseShiftHours(s)) }} ч
              </div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <span v-if="s.is_paid" class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[9px] font-black uppercase">Оплачено</span>
              <button
                @click="togglePaid(s)"
                class="px-2 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1"
                :class="s.is_paid ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'"
              >
                <Check class="w-3 h-3" />
                {{ s.is_paid ? 'Вернуть' : 'В счет' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
