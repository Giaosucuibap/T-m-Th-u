/* Trạng thái dùng chung của app: tiêu chí, kết quả gần nhất, lịch sử, gói theo dõi.
 * Mọi thứ lưu trên chính điện thoại (AsyncStorage); không gửi đi đâu. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from '../core/store.js';
import { createReminders } from '../core/reminders.js';
import { parseDate } from '../core/egp/core.js';
import { ensurePermission, notificationApi } from '../notify';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppStateProvider({ children }) {
  const store = useMemo(() => createStore(AsyncStorage), []);
  const reminders = useMemo(() => createReminders(notificationApi), []);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState(null);
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  const [watch, setWatch] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const [f, l, h, w] = await Promise.all([store.getForm(), store.getLast(), store.getHistory(), store.getWatch()]);
      if (!alive) return;
      setForm(f); setLast(l); setHistory(h); setWatch(w); setReady(true);
    })().catch(() => setReady(true));
    return () => { alive = false; };
  }, [store]);

  const saveForm = useCallback(async (next) => { setForm(next); await store.saveForm(next); }, [store]);

  /** Gói đang theo dõi xuất hiện lại với hạn nộp MỚI (gia hạn/sửa TBMT): hẹn lại lời nhắc. */
  const refreshWatched = useCallback(async (tenders = []) => {
    const all = await store.getWatch();
    const changed = [];
    for (const t of tenders) {
      const old = all[t.key];
      if (!old) continue;
      const before = parseDate(old.closeDate) || '';
      const after = parseDate(t.closeDate) || '';
      if (after && before !== after) {
        await reminders.cancel(old.reminderIds || []);
        const scheduled = await reminders.scheduleFor(t).catch(() => ({ ids: [] }));
        await store.watch({ ...t, previousCloseDate: old.closeDate }, { reminderIds: scheduled.ids });
        changed.push({ key: t.key, before: old.closeDate, after: t.closeDate });
      } else {
        await store.watch(t, { reminderIds: old.reminderIds || [] });
      }
    }
    setWatch(await store.getWatch());
    return changed;
  }, [store, reminders]);

  const saveResult = useCallback(async (result) => {
    const compact = await store.saveResult(result);
    if (!compact) return null;
    const closeDateChanges = await refreshWatched(compact.tenders).catch(() => []);
    const next = { ...compact, closeDateChanges };
    setLast(next);
    setHistory(await store.getHistory());
    return next;
  }, [store, refreshWatched]);

  const toggleWatch = useCallback(async (tender) => {
    const all = await store.getWatch();
    if (all[tender.key]) {
      await reminders.cancel(all[tender.key].reminderIds || []);
      await store.unwatch(tender.key);
      setWatch(await store.getWatch());
      return { watched: false };
    }
    const allowed = await ensurePermission().catch(() => false);
    const scheduled = allowed ? await reminders.scheduleFor(tender).catch(() => ({ ids: [], skipped: 'error' })) : { ids: [], skipped: 'no-permission' };
    await store.watch(tender, { reminderIds: scheduled.ids });
    setWatch(await store.getWatch());
    return { watched: true, reminders: scheduled.ids.length, skipped: scheduled.skipped };
  }, [store, reminders]);

  const findTender = useCallback((key) => last?.tenders?.find((t) => t.key === key) || watch[key] || null, [last, watch]);

  const clearAll = useCallback(async () => {
    const all = await store.getWatch();
    for (const entry of Object.values(all)) await reminders.cancel(entry.reminderIds || []);
    await store.clearAll();
    setForm(null); setLast(null); setHistory([]); setWatch({});
  }, [store, reminders]);

  const value = useMemo(() => ({ ready, form, saveForm, last, saveResult, history, watch, toggleWatch, findTender, clearAll }),
    [ready, form, saveForm, last, saveResult, history, watch, toggleWatch, findTender, clearAll]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
