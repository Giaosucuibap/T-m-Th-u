/* ============================================================================
 *  LỆNH MẢNG TỰ ĐỘNG HOÁ (tách khỏi background.js ở 4.19.0):
 *  kiểm tra cấu trúc e-GP (canary), bộ săn, trạm săn, sức khoẻ e-GP, kho lịch
 *  sử, theo dõi chủ đầu tư. Hành vi giữ nguyên bản trong switch cũ; phụ thuộc
 *  được truyền vào để kiểm thử từng lệnh mà không cần Chrome.
 * ========================================================================== */
export function automationHandlers({ getState, save, withLock, KEYS, validateHunt, maxHunts, ensureHuntAlarms, runHuntById, huntRuntime,
  liveCanaryRuntime, historyRuntime, wakeTimes, schemaIsRed, canaryBlocked, safeWatches, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
  return {
    CANARY_STATUS: () => liveCanaryRuntime.status(),
    CANARY_CONFIG: (p) => liveCanaryRuntime.configure(p),
    CANARY_RUN: async (p) => {
      if (await canaryBlocked()) return { ok: false, message: 'Hãy chờ lượt tra cứu đang chạy hoàn tất trước khi kiểm tra cấu trúc.' };
      return liveCanaryRuntime.run({ trigger: 'manual', wait: p?.wait === true });
    },

    SAVE_HUNT: async (p) => {
      const parsed = validateHunt(p || {});
      if (!parsed.ok) return parsed;
      const rows = await withLock(async () => {
        const s = await getState();
        const hunt = { ...parsed.hunt, id: parsed.hunt.id || uuid() };
        /* Trạng thái quét nhanh chỉ còn giá trị khi TIÊU CHÍ giữ nguyên: đổi tiêu
           chí là đổi tập gói, mốc và bằng chứng cũ không áp dụng được nữa. */
        const old = (s.hunts || []).find((x) => x.id === hunt.id);
        const sameCriteria = old && JSON.stringify(old.criteria) === JSON.stringify(hunt.criteria) && old.kind === hunt.kind;
        hunt.deltaState = sameCriteria && !p?.resetDelta ? old.deltaState : validateHunt({ ...hunt, deltaState: null }).hunt.deltaState;
        if (old) { for (const k of ['lastRunAt', 'lastStatus', 'lastCompletedJobId', 'lastMessage', 'createdAt', 'activeSince', 'lastCatchup']) if (!hunt[k]) hunt[k] = old[k]; }
        /* Trạm săn (4.19.0): mốc "bắt đầu có hiệu lực" — tạo mới, bật lại hoặc đổi giờ
           thì tính từ bây giờ, để lượt chạy bù không chạy cho giờ chưa từng được hẹn. */
        const nowIso = new Date(now()).toISOString();
        if (!old) hunt.createdAt = nowIso;
        if (!old || (!old.enabled && hunt.enabled) || (old.times || []).join(',') !== (hunt.times || []).join(',')) hunt.activeSince = nowIso;
        const rest = (s.hunts || []).filter((x) => x.id !== hunt.id);
        if (rest.length >= maxHunts) throw new Error(`Đã đủ ${maxHunts} bộ săn. Hãy xóa một bộ trước.`);
        const hunts = [hunt, ...rest];
        await save({ [KEYS.hunts]: hunts });
        await ensureHuntAlarms(hunts);
        return hunts;
      });
      return { ok: true, hunts: rows };
    },
    DELETE_HUNT: async (p) => {
      const rows = await withLock(async () => {
        const s = await getState();
        const hunts = (s.hunts || []).filter((x) => x.id !== p?.id);
        await save({ [KEYS.hunts]: hunts });
        await ensureHuntAlarms(hunts);
        return hunts;
      });
      return { ok: true, hunts: rows };
    },
    RUN_HUNT: (p) => runHuntById(p?.id, { forceFull: p?.full === true }),

    /* Chỉ đọc: tiện ích có đang tự dừng vì e-GP đổi cấu trúc, bộ săn nào đang lỗi. */
    EGP_HEALTH: async () => {
      const s = await getState();
      const canary = (await liveCanaryRuntime.status().catch(() => null))?.liveCanary || null;
      const failingHunts = (s.hunts || []).filter((h) => h.enabled && ['ERROR', 'TIMEOUT'].includes(h.lastStatus)).slice(0, 5).map((h) => ({ name: h.name, status: h.lastStatus, at: h.lastRunAt || '' }));
      return { ok: true, red: schemaIsRed(s), canaryStatus: canary?.status || 'UNKNOWN', canaryReason: String(canary?.reason || '').slice(0, 200), checkedAt: canary?.checkedAt || null, failingHunts };
    },
    STATION_STATUS: async () => {
      const s = await getState();
      return { ok: true, station: await huntRuntime.stationStatus(), huntTimes: wakeTimes(s.hunts, 0), wakeTimes: wakeTimes(s.hunts, 3), readOnly: Boolean(s.settings.readOnlyMode) };
    },

    HISTORY_STATUS: () => historyRuntime.status(),
    HISTORY_CONFIGURE: async (p) => historyRuntime.configure(p || {}, { watchedInvestors: (await getState()).watchedInvestors }),
    HISTORY_PAUSE: (p) => historyRuntime.setPaused(p?.paused !== false),
    HISTORY_CLEAR: () => historyRuntime.clear(),
    HISTORY_TICK: async () => { await historyRuntime.tick(); return historyRuntime.status(); },

    SAVE_WATCH: async (p) => {
      const rows = await withLock(async () => {
        const s = await getState();
        const next = safeWatches([{ id: p?.id || uuid(), name: p?.name, taxCode: p?.taxCode, createdAt: new Date(now()).toISOString() }, ...s.watchedInvestors]);
        await save({ [KEYS.watchedInvestors]: next });
        return next;
      });
      return { ok: true, watchedInvestors: rows };
    },
    DELETE_WATCH: async (p) => {
      const rows = await withLock(async () => {
        const s = await getState();
        const next = (s.watchedInvestors || []).filter((x) => x.id !== p?.id);
        await save({ [KEYS.watchedInvestors]: next });
        return next;
      });
      return { ok: true, watchedInvestors: rows };
    }
  };
}
