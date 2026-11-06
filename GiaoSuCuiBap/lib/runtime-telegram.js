/* ============================================================================
 *  TELEGRAM (tách khỏi background.js ở 4.19.0) — gửi tin, dò Chat ID, đẩy gói mới.
 *  Không đổi hành vi: cùng thông báo lỗi tiếng Việt, cùng cách cắt khúc 3.800 ký
 *  tự, cùng nhật ký 20 lần gửi gần nhất. Kho và khoá được truyền vào để kiểm thử.
 * ========================================================================== */
import { formatMoney } from './core.js';
import { safeChatId } from './channels.js';

const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Ghi chú gốc:
 *  TELEGRAM — đẩy gói thầu mới về điện thoại
 *
 *  Đã đối chiếu trực tiếp với API Telegram:
 *    • Token sai   -> HTTP 401 {"ok":false,"error_code":401,"description":"Unauthorized"}
 *    • Dấu ":" trong token mã hoá thành %3A vẫn được Telegram chấp nhận.
 *    • Một tin nhắn tối đa 4096 ký tự — vượt quá là lỗi 400, nên phải cắt khúc.
 * ======================================================================== */

export const TELEGRAM_LIMIT=3800;          // chừa biên an toàn dưới mức 4096 của Telegram
const TELEGRAM_LOG_MAX=20;

/** Dịch lỗi Telegram sang tiếng Việt kèm hướng khắc phục. */
export function telegramError(status,description){
  const d=String(description||'');
  if(status===401||/unauthorized/i.test(d))
    return 'Bot Token sai hoặc đã bị thu hồi. Mở @BotFather → /mytoken để lấy lại.';
  if(/chat not found/i.test(d))
    return 'Chat ID sai, hoặc bạn chưa bấm Start với bot. Mở Telegram, tìm bot của bạn và bấm START trước.';
  if(/bot was blocked/i.test(d))
    return 'Bạn đã chặn bot này trong Telegram. Bỏ chặn rồi thử lại.';
  if(/too many requests/i.test(d))
    return 'Telegram đang chặn tạm vì gửi quá nhiều. Chờ vài phút rồi thử lại.';
  if(/can.t parse entities/i.test(d))
    return 'Nội dung tin nhắn có ký tự làm Telegram hiểu nhầm định dạng. Đã ghi nhận để sửa.';
  return d||(status?`Telegram trả lỗi HTTP ${status}.`:'Không gọi được Telegram.');
}

/** Cắt văn bản thành nhiều khúc, không cắt giữa dòng. */
export function chunkForTelegram(text,limit=TELEGRAM_LIMIT){
  const lines=String(text||'').split('\n');
  const out=[];let cur='';
  for(const line of lines){
    const piece=line.length>limit?line.slice(0,limit):line;
    if((cur+'\n'+piece).length>limit&&cur){out.push(cur);cur=piece;}
    else cur=cur?`${cur}\n${piece}`:piece;
  }
  if(cur)out.push(cur);
  return out.length?out:[''];
}

/** Một dòng mô tả gói thầu trong tin nhắn Telegram. */
export function telegramTenderLine(t){
  const code=t.displayCode||t.notifyNo||t.bidNo||'';
  const label=t.codeLabel||'Mã TBMT';
  const status=t.statusLabel?` · ${t.statusLabel}`:'';
  const days=(t.status==='OPEN'&&Number.isFinite(t.daysLeft))?` (còn ${t.daysLeft} ngày)`:'';
  const url=t.detailUrl||t.sourcePageUrl||'';
  const name=escapeHtml(t.bidName||code);
  return `• <b>${t.score}đ</b> — ${url?`<a href="${escapeHtml(url)}">${name}</a>`:name}\n`
    +`  ${escapeHtml(label)}: ${escapeHtml(code)}${status}${days}\n`
    +`  💰 ${escapeHtml(formatMoney(t.price))} · 📍 ${escapeHtml(t.location||'Chưa rõ địa điểm')}`
    +(t.investorName?`\n  🏛 ${escapeHtml(t.investorName)}`:'');
}

/** Phần có trạng thái: nhật ký gửi (kho), mạng (fetch), chế độ khoá. */
export function createTelegramRuntime({getState,save,withLock,KEYS,fetchImpl=(...a)=>fetch(...a),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
/** Ghi nhật ký gửi để người dùng biết hệ thống có chạy hay không. */
async function logTelegram(entry){
  return withLock(async()=>{
    const s=await getState();
    const log=[{at:new Date().toISOString(),...entry},...(s.telegramLog||[])].slice(0,TELEGRAM_LOG_MAX);
    await save({[KEYS.telegramLog]:log});
  });
}

async function callTelegram(token,method,payload){
  const res=await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(String(token||'').trim())}/${method}`,
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload||{})});
  const data=await res.json().catch(()=>({}));
  return {httpOk:res.ok,status:res.status,data};
}

async function sendTelegram(settings,text,opts={}){
  if(!opts.force&&!settings.telegramEnabled)return {ok:false,message:'Chưa bật gửi Telegram trong Cấu hình.'};
  const token=String(settings.telegramBotToken||'').trim();
  const chatId=String(opts.chatId||settings.telegramChatId||'').trim();
  if(!token||!chatId)return {ok:false,message:'Thiếu Bot Token hoặc Chat ID.'};

  const parts=chunkForTelegram(text);
  try{
    for(let i=0;i<parts.length;i++){
      const {httpOk,status,data}=await callTelegram(token,'sendMessage',{
        chat_id:chatId,text:parts[i],parse_mode:'HTML',disable_web_page_preview:true
      });
      if(!httpOk||data.ok===false){
        const message=telegramError(status,data.description);
        await logTelegram({ok:false,message,kind:opts.kind||'send'});
        return {ok:false,message};
      }
      if(i+1<parts.length)await sleep(400);
    }
    const message=parts.length>1?`Đã gửi (${parts.length} tin nhắn).`:'Đã gửi.';
    await logTelegram({ok:true,message,kind:opts.kind||'send'});
    return {ok:true,message};
  }catch(e){
    const message=`Không kết nối được Telegram: ${String(e?.message||e)}`;
    await logTelegram({ok:false,message,kind:opts.kind||'send'});
    return {ok:false,message};
  }
}

/**
 * Dò Chat ID tự động: đọc các tin nhắn gần đây mà bot nhận được.
 * Người dùng chỉ cần nhắn một câu bất kỳ cho bot rồi bấm nút — đỡ phải đi
 * tìm @userinfobot và chép tay con số.
 */
async function telegramDetectChatId(token){
  const t=String(token||'').trim();
  if(!t)return {ok:false,message:'Nhập Bot Token trước đã.'};
  try{
    const me=await callTelegram(t,'getMe',{});
    if(!me.httpOk||me.data.ok===false)return {ok:false,message:telegramError(me.status,me.data.description)};
    const botName=me.data.result&&me.data.result.username?`@${me.data.result.username}`:'bot của bạn';

    const upd=await callTelegram(t,'getUpdates',{limit:50});
    if(!upd.httpOk||upd.data.ok===false)return {ok:false,message:telegramError(upd.status,upd.data.description)};

    const seen=new Map();
    for(const u of (upd.data.result||[])){
      const msg=u.message||u.channel_post||u.edited_message;
      const chat=msg&&msg.chat;
      if(!chat||seen.has(String(chat.id)))continue;
      seen.set(String(chat.id),{
        id:String(chat.id),
        name:[chat.title,chat.first_name,chat.last_name].filter(Boolean).join(' ')||chat.username||'(không tên)',
        type:chat.type
      });
    }
    const chats=[...seen.values()];
    if(!chats.length){
      return {ok:false,botName,
        message:`Chưa thấy tin nhắn nào. Mở Telegram, tìm ${botName}, bấm START và nhắn một câu bất kỳ, rồi bấm lại nút này.`};
    }
    return {ok:true,botName,chats};
  }catch(e){
    return {ok:false,message:`Không kết nối được Telegram: ${String(e?.message||e)}`};
  }
}

async function dispatchOutbound(settings,text,opts={}){
  // External webhook delivery is not enabled in this release: arbitrary hosts
  // need separate permission and a verified receiving service. Keep the
  // existing user-configured Telegram channel; JSON signing stays local.
  if((await getState()).settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa và tự động hóa.'};
  return sendTelegram(settings,text,opts);
}

async function pushTelegramMatches(settings,matches,run){
  if(!settings.telegramEnabled||settings.readOnlyMode)return;
  const list=matches||[];
  const partial=run?.status==='PARTIAL'||Boolean(run?.partial);
  const scopeNote=partial?'\n⚠️ <b>DỮ LIỆU CHƯA ĐẦY ĐỦ</b>: lượt quét bị giới hạn hoặc gián đoạn.':' ';

  // Không có gói mới: chỉ nhắn khi người dùng bật "báo cả khi không có gì mới",
  // để biết hệ thống vẫn sống chứ không phải đã chết âm thầm.
  const hunt=(run?.huntId?((await getState()).hunts||[]).find(h=>h.id===run.huntId):null);
  if(hunt&&!hunt.telegram)return;
  const chatId=safeChatId(hunt?.telegramChatId);
  if(!list.length){
    if(!settings.telegramDailySummary)return;
    await dispatchOutbound(settings,
      `📡 <b>Giáo Sư Cùi Bắp</b> — ${new Date().toLocaleString('vi-VN')}\n`
      +`${partial?'Đã quét một phần':'Đã quét xong'}, <b>không có gói mới</b> đạt ngưỡng.${scopeNote}\n`
      +`Tổng cộng đã nhận ${Number(run?.captured||0)} bản ghi từ e-GP.`,
      {kind:'summary',chatId});
    return;
  }

  const amended=list.filter(t=>t.alertKind==='amendment').length;
  const head=`📡 <b>Giáo Sư Cùi Bắp</b>: ${list.length} gói mới đạt ngưỡng`
    +(amended?` · ${amended} gói theo dõi vừa điều chỉnh/gia hạn`:'')
    +`\n<i>${new Date().toLocaleString('vi-VN')}</i>${scopeNote}`;
  const body=[...list].sort((a,b)=>Number(b.score||0)-Number(a.score||0))
    .slice(0,25).map(t=> (t.alertKind==='amendment'?'✏️ <b>Điều chỉnh / gia hạn</b>\n':'')+telegramTenderLine(t)).join('\n\n');
  const tail=list.length>25?`\n\n… và ${list.length-25} gói nữa, xem trong tiện ích.`:'';
  await dispatchOutbound(settings,`${head}\n\n${body}${tail}`,{kind:'matches',chatId});
}

return {logTelegram,callTelegram,sendTelegram,telegramDetectChatId,dispatchOutbound,pushTelegramMatches};
}
