/* Hiểu thị trường và hiểu hồ sơ (4.22.0): theo dõi đối thủ (lib/rival-watch.js, lib/runtime-rivals.js) và
   bản đọc E-HSMT do trợ lý AI của người dùng trả về (lib/hsmt-ai.js, lib/runtime-hsmt.js). */
export function insightHandlers({ rivalRuntime, hsmtRuntime }) {
  return {
    GET_RIVAL_WATCH: async () => rivalRuntime.status(),
    SAVE_RIVAL_WATCH: async (payload) => rivalRuntime.add(payload),
    DELETE_RIVAL_WATCH: async (payload) => rivalRuntime.remove(payload),
    SET_RIVAL_AUTO: async (payload) => rivalRuntime.setAuto(payload),
    SET_RIVAL_READ: async () => rivalRuntime.markRead(),
    RIVAL_SWEEP_NOW: async (payload) => rivalRuntime.sweep({ force: true, only: payload?.taxCode || '' }),
    GET_HSMT_READ: async (payload) => hsmtRuntime.get(payload),
    SAVE_HSMT_READ: async (payload) => hsmtRuntime.saveAnswer(payload),
    DELETE_HSMT_READ: async (payload) => hsmtRuntime.remove(payload)
  };
}
