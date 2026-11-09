// ============================================================================
//  GiaoSuCuiBap.DienThoai.exe — LINK DIEN THOAI (may tinh cong ty lam may tra)
//
//  Chrome khoi dong tep nay qua native messaging (vn.giaosucuibap.dienthoai)
//  khi tien ich bat "Link dien thoai". Tep nay:
//   1. mo mot cong CHI TRONG MAY (127.0.0.1, cong ngau nhien) phuc vu giao dien
//      web cho dien thoai va vai lenh API;
//   2. chay cloudflared.exe dat canh tep nay (duong ham https mien phi cua
//      Cloudflare) de iPhone mo duoc tu bat cu dau;
//   3. chuyen lenh "tim goi" tu dien thoai cho tien ich (qua stdin/stdout cua
//      native messaging) va tra ket qua ve.
//  Moi lenh API phai kem KHOA do tien ich cap (nam trong ma QR). Khong chay
//  chuong trinh nao khac ngoai cloudflared.exe; khong doc/ghi tep nao ngoai thu
//  muc web va tep nhat ky canh tep nay.
//
//  Build (C# 5, .NET Framework 4):
//    csc /nologo /target:exe /optimize+ /r:System.Web.Extensions.dll
//        /out:GiaoSuCuiBap.DienThoai.exe DienThoai.cs
//  Giao thuc: native-agent/DIEN-THOAI-GIAO-THUC.md
// ============================================================================
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

internal sealed class PhoneJob {
  public string Id;
  public string Op;
  public string State;       // queued | running | done | error
  public object Progress;
  public string ResultJson;  // JSON nguyen van tu tien ich (khong phan tich lai)
  public string Code;
  public DateTime Created;
  public DateTime Updated;
}

internal sealed class HttpRequestLite {
  public string Method;
  public string Path;
  public string Query;
  public Dictionary<string, string> Headers;
  public byte[] Body;
}

internal static class DienThoai {
  const string Version = "1.0.0";
  const string Origin = "chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj";
  const int MaxInbound = 32 * 1024 * 1024;   // tu tien ich: ket qua co the vai MB
  const int MaxOutbound = 1000 * 1000;       // Chrome nhan toi da 1 MB moi tin tu host
  const int MaxHeader = 16 * 1024;
  const int MaxBody = 64 * 1024;
  const string Csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
  static readonly string[] AllowedCriteria = { "province", "category", "keyword", "investor", "minPrice", "maxPrice", "mustKeywords", "excludeKeywords", "ward" };
  static readonly Regex TunnelUrlPattern = new Regex(@"https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com", RegexOptions.IgnoreCase);
  static readonly UTF8Encoding Utf8Strict = new UTF8Encoding(false, true);
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static readonly object WriteLock = new object();
  static readonly object StateLock = new object();
  static readonly object LogLock = new object();
  static readonly Dictionary<string, PhoneJob> Jobs = new Dictionary<string, PhoneJob>();
  static Stream Output;
  static string Key = "";
  static string WebRoot = "";
  static string LogPath = "";
  static int Port;
  static TcpListener Listener;
  static bool NoTunnel;
  static string FakeTunnel = "";   // chi de kiem thu: bao duong ham "up" voi dia chi nay, khong chay cloudflared
  static int FixedPort;            // chi de kiem thu: cong co dinh (mac dinh 0 = ngau nhien)
  static volatile bool Stopping;
  static bool TunnelStarted;
  static string TunnelState = "starting";
  static string TunnelUrl = "";
  static string TunnelCode = "";
  static Process Tunnel;
  static IntPtr KillJob = IntPtr.Zero;
  static string ActiveSearch = "";
  static string LastResultJson = "";

  public static int Main(string[] args) {
    if (args.Length < 1 || !String.Equals(args[0].TrimEnd('/'), Origin, StringComparison.Ordinal)) return 2;
    for (int i = 1; i < args.Length; i++) {
      // Chrome tren Windows them --parent-window=N: bo qua co la.
      if (args[i] == "--no-tunnel") NoTunnel = true;
      else if (args[i] == "--web" && i + 1 < args.Length) WebRoot = args[++i];
      else if (args[i] == "--log" && i + 1 < args.Length) LogPath = args[++i];
      else if (args[i] == "--fake-tunnel" && i + 1 < args.Length) FakeTunnel = args[++i];
      else if (args[i] == "--port" && i + 1 < args.Length) { int p; if (Int32.TryParse(args[++i], NumberStyles.None, CultureInfo.InvariantCulture, out p) && p > 0 && p < 65536) FixedPort = p; }
    }
    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
    WebRoot = Path.GetFullPath(WebRoot.Length > 0 ? WebRoot : Path.Combine(baseDir, "web"));
    if (LogPath.Length == 0) LogPath = Path.Combine(baseDir, "nhat-ky.log");
    Json.MaxJsonLength = MaxInbound;
    Json.RecursionLimit = 64;
    Stream input = Console.OpenStandardInput();
    Output = Console.OpenStandardOutput();
    try {
      Listener = new TcpListener(IPAddress.Loopback, FixedPort);
      Listener.Start();
      Port = ((IPEndPoint)Listener.LocalEndpoint).Port;
    } catch (Exception e) {
      Log("Khong mo duoc cong may phuc vu: " + e.Message);
      return 5;
    }
    Thread accept = new Thread(AcceptLoop);
    accept.IsBackground = true;
    accept.Start();
    Log("Bat dau " + Version + ", cong 127.0.0.1:" + Port);
    try { ReadLoop(input); } catch (Exception e) { Log("Kenh tien ich loi: " + e.Message); }
    Shutdown();
    return 0;
  }

  // ---------------------------------------------------------------- tien ich
  static void ReadLoop(Stream input) {
    while (!Stopping) {
      byte[] head = ReadExact(input, 4);
      if (head == null) return;                      // Chrome dong cong -> thoat
      int size = BitConverter.ToInt32(head, 0);
      if (size <= 0 || size > MaxInbound) { Log("Khung tin nhan sai kich thuoc: " + size); return; }
      byte[] body = ReadExact(input, size);
      if (body == null) return;
      Dictionary<string, object> msg = null;
      try { msg = Json.Deserialize<Dictionary<string, object>>(Utf8Strict.GetString(body)); } catch { Log("Tin nhan tu tien ich khong phai JSON"); }
      if (msg != null) HandleExtension(msg);
    }
  }

  static byte[] ReadExact(Stream input, int size) {
    byte[] data = new byte[size];
    int at = 0;
    while (at < size) {
      int n = input.Read(data, at, size - at);
      if (n <= 0) return null;
      at += n;
    }
    return data;
  }

  static void HandleExtension(Dictionary<string, object> msg) {
    string type = Str(msg, "type");
    if (type == "config") {
      string k = Str(msg, "key");
      if (!Regex.IsMatch(k, "^[A-Za-z0-9_-]{24,128}$")) { Send(Obj("type", "error", "code", "BAD_KEY")); return; }
      bool startTunnel = false;
      lock (StateLock) {
        Key = k;
        if (!TunnelStarted) { TunnelStarted = true; startTunnel = true; }
      }
      SendReady();
      if (startTunnel) {
        if (FakeTunnel.Length > 0) SetTunnel("up", FakeTunnel, "");
        else if (NoTunnel) SetTunnel("off", "http://127.0.0.1:" + Port, "NO_TUNNEL");
        else { Thread t = new Thread(TunnelLoop); t.IsBackground = true; t.Start(); }
      }
      return;
    }
    if (type == "ping") { Send(Obj("type", "pong", "version", Version)); return; }
    if (type == "job-progress" || type == "job-result" || type == "job-error") {
      string id = Str(msg, "id");
      lock (StateLock) {
        PhoneJob job;
        if (!Jobs.TryGetValue(id, out job)) return;
        job.Updated = DateTime.UtcNow;
        if (type == "job-progress") {
          if (job.State == "queued") job.State = "running";
          job.Progress = Get(msg, "progress");
        } else if (type == "job-result") {
          job.State = "done";
          job.ResultJson = Str(msg, "resultJson");
          if (job.Op == "search" && job.ResultJson.Length > 0) LastResultJson = job.ResultJson;
          if (ActiveSearch == id) ActiveSearch = "";
        } else {
          job.State = "error";
          job.Code = Str(msg, "code");
          if (job.Code.Length == 0) job.Code = "EXTENSION_ERROR";
          job.Progress = Get(msg, "message");
          if (ActiveSearch == id) ActiveSearch = "";
        }
      }
    }
  }

  static void SendReady() {
    string state, url, code;
    lock (StateLock) { state = TunnelState; url = TunnelUrl; code = TunnelCode; }
    Send(Obj("type", "ready", "version", Version, "port", Port, "tunnel", Obj("state", state, "url", url, "code", code)));
  }

  static void Send(Dictionary<string, object> msg) {
    byte[] body;
    try { body = Encoding.UTF8.GetBytes(Json.Serialize(msg)); } catch { return; }
    if (body.Length > MaxOutbound) { Log("Tin gui tien ich qua lon, bo qua"); return; }
    lock (WriteLock) {
      try {
        Output.Write(BitConverter.GetBytes(body.Length), 0, 4);
        Output.Write(body, 0, body.Length);
        Output.Flush();
      } catch { Stopping = true; }
    }
  }

  // ---------------------------------------------------------------- duong ham
  static void TunnelLoop() {
    string exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "cloudflared.exe");
    int[] backoff = { 5, 15, 30, 60, 120, 300 };
    int attempt = 0;
    while (!Stopping) {
      if (!File.Exists(exe)) { SetTunnel("missing", "", "CLOUDFLARED_MISSING"); return; }
      SetTunnel("starting", "", "");
      DateTime started = DateTime.UtcNow;
      try {
        ProcessStartInfo psi = new ProcessStartInfo(exe, "tunnel --no-autoupdate --url http://127.0.0.1:" + Port);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardOutput = true;
        psi.WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory;
        Process p = new Process();
        p.StartInfo = psi;
        p.ErrorDataReceived += OnTunnelLine;
        p.OutputDataReceived += OnTunnelLine;
        p.Start();
        AttachToKillJob(p);
        lock (StateLock) Tunnel = p;
        p.BeginErrorReadLine();
        p.BeginOutputReadLine();
        p.WaitForExit();
        Log("cloudflared thoat, ma " + p.ExitCode);
      } catch (Exception e) {
        Log("Khong chay duoc cloudflared: " + e.Message);
      }
      lock (StateLock) Tunnel = null;
      if (Stopping) return;
      if ((DateTime.UtcNow - started).TotalMinutes > 10) attempt = 0;
      int wait = backoff[Math.Min(attempt, backoff.Length - 1)];
      attempt++;
      SetTunnel("down", "", "TUNNEL_RESTARTING");
      for (int i = 0; i < wait * 10 && !Stopping; i++) Thread.Sleep(100);
    }
  }

  static void OnTunnelLine(object sender, DataReceivedEventArgs e) {
    string line = e.Data;
    if (line == null) return;
    foreach (Match m in TunnelUrlPattern.Matches(line)) {
      string url = m.Value.ToLowerInvariant();
      // Dong loi co the nhac toi may chu cap phat (api.trycloudflare.com) — khong phai link.
      if (url == "https://api.trycloudflare.com") continue;
      SetTunnel("up", url, "");
      return;
    }
    if (line.IndexOf(" ERR ", StringComparison.Ordinal) >= 0 || line.IndexOf("error", StringComparison.OrdinalIgnoreCase) >= 0) Log("cloudflared: " + Clip(line, 300));
  }

  static void SetTunnel(string state, string url, string code) {
    lock (StateLock) {
      if (TunnelState == state && TunnelUrl == url && TunnelCode == code) return;
      TunnelState = state; TunnelUrl = url; TunnelCode = code;
    }
    Log("Duong ham: " + state + (url.Length > 0 ? " " + url : "") + (code.Length > 0 ? " " + code : ""));
    Send(Obj("type", "tunnel", "state", state, "url", url, "code", code));
  }

  // Windows: dua cloudflared vao "job" tu huy — tep nay thoat (ke ca bi tat ngang) thi
  // cloudflared cung bi Windows dong theo, khong de lai duong ham mo coi.
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps; public ulong WriteOps; public ulong OtherOps; public ulong ReadBytes; public ulong WriteBytes; public ulong OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }

  static void AttachToKillJob(Process p) {
    if (Environment.OSVersion.Platform != PlatformID.Win32NT) return;
    try {
      if (KillJob == IntPtr.Zero) {
        IntPtr handle = CreateJobObject(IntPtr.Zero, null);
        ExtendedLimit info = new ExtendedLimit();
        info.Basic.LimitFlags = 0x2000;  // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int length = Marshal.SizeOf(typeof(ExtendedLimit));
        IntPtr ptr = Marshal.AllocHGlobal(length);
        try {
          Marshal.StructureToPtr(info, ptr, false);
          if (SetInformationJobObject(handle, 9, ptr, (uint)length)) KillJob = handle;
        } finally { Marshal.FreeHGlobal(ptr); }
      }
      if (KillJob != IntPtr.Zero && !AssignProcessToJobObject(KillJob, p.Handle)) Log("Khong gan duoc cloudflared vao job tu huy");
    } catch (Exception e) { Log("Job tu huy: " + e.Message); }
  }

  static void Shutdown() {
    Stopping = true;
    try { if (Listener != null) Listener.Stop(); } catch { }
    Process p;
    lock (StateLock) p = Tunnel;
    if (p != null) { try { if (!p.HasExited) p.Kill(); } catch { } }
    Log("Dung");
  }

  // ---------------------------------------------------------------- HTTP
  static void AcceptLoop() {
    while (!Stopping) {
      TcpClient client;
      try { client = Listener.AcceptTcpClient(); } catch { if (Stopping) return; Thread.Sleep(50); continue; }
      ThreadPool.QueueUserWorkItem(Serve, client);
    }
  }

  static void Serve(object state) {
    TcpClient client = (TcpClient)state;
    try {
      client.ReceiveTimeout = 20000;
      client.SendTimeout = 20000;
      NetworkStream stream = client.GetStream();
      HttpRequestLite request = ReadRequest(stream);
      if (request == null) { PlainText(stream, 400, "Bad request"); return; }
      Route(stream, request);
    } catch (Exception e) {
      Log("Phuc vu loi: " + Clip(e.Message, 200));
    } finally {
      try { client.Close(); } catch { }
    }
  }

  static HttpRequestLite ReadRequest(Stream s) {
    byte[] buf = new byte[MaxHeader];
    int len = 0, end = -1;
    while (len < buf.Length && end < 0) {
      int n = s.Read(buf, len, buf.Length - len);
      if (n <= 0) return null;
      int from = Math.Max(0, len - 3);
      len += n;
      for (int i = from; i + 3 < len; i++) {
        if (buf[i] == 13 && buf[i + 1] == 10 && buf[i + 2] == 13 && buf[i + 3] == 10) { end = i; break; }
      }
    }
    if (end < 0) return null;
    string head = Encoding.ASCII.GetString(buf, 0, end);
    string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
    string[] first = lines[0].Split(' ');
    if (first.Length != 3 || !first[2].StartsWith("HTTP/1.", StringComparison.Ordinal)) return null;
    HttpRequestLite r = new HttpRequestLite();
    r.Method = first[0];
    r.Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    string target = first[1];
    if (target.Length == 0 || target[0] != '/') return null;
    int q = target.IndexOf('?');
    r.Path = q >= 0 ? target.Substring(0, q) : target;
    r.Query = q >= 0 ? target.Substring(q + 1) : "";
    for (int i = 1; i < lines.Length; i++) {
      int c = lines[i].IndexOf(':');
      if (c <= 0) return null;
      r.Headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
    }
    byte[] rest = new byte[len - (end + 4)];
    Buffer.BlockCopy(buf, end + 4, rest, 0, rest.Length);
    string te;
    if (r.Headers.TryGetValue("Transfer-Encoding", out te)) {
      if (te.IndexOf("chunked", StringComparison.OrdinalIgnoreCase) < 0) return null;
      r.Body = ReadChunked(s, rest);
      return r.Body == null ? null : r;
    }
    int contentLength = 0;
    string cl;
    if (r.Headers.TryGetValue("Content-Length", out cl)) {
      if (!Int32.TryParse(cl, NumberStyles.None, CultureInfo.InvariantCulture, out contentLength) || contentLength > MaxBody) return null;
    }
    byte[] body = new byte[contentLength];
    int have = Math.Min(rest.Length, contentLength);
    Buffer.BlockCopy(rest, 0, body, 0, have);
    while (have < contentLength) {
      int n = s.Read(body, have, contentLength - have);
      if (n <= 0) return null;
      have += n;
    }
    r.Body = body;
    return r;
  }

  // Duong ham co the chuyen than yeu cau dang "chunked": gom lai, toi da MaxBody byte.
  static byte[] ReadChunked(Stream s, byte[] initial) {
    MemoryStream raw = new MemoryStream();
    raw.Write(initial, 0, initial.Length);
    MemoryStream body = new MemoryStream();
    int pos = 0;
    byte[] tmp = new byte[4096];
    while (true) {
      byte[] data = raw.ToArray();
      int lineEnd = IndexOfCrlf(data, pos);
      while (lineEnd < 0) {
        int n = s.Read(tmp, 0, tmp.Length);
        if (n <= 0 || raw.Length > MaxBody * 2) return null;
        raw.Write(tmp, 0, n);
        data = raw.ToArray();
        lineEnd = IndexOfCrlf(data, pos);
      }
      string sizeText = Encoding.ASCII.GetString(data, pos, lineEnd - pos).Split(';')[0].Trim();
      int size;
      if (!Int32.TryParse(sizeText, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out size) || size < 0) return null;
      pos = lineEnd + 2;
      if (size == 0) return body.ToArray();
      if (body.Length + size > MaxBody) return null;
      while (data.Length < pos + size + 2) {
        int n = s.Read(tmp, 0, tmp.Length);
        if (n <= 0 || raw.Length > MaxBody * 2) return null;
        raw.Write(tmp, 0, n);
        data = raw.ToArray();
      }
      body.Write(data, pos, size);
      pos += size + 2;
    }
  }

  static int IndexOfCrlf(byte[] data, int from) {
    for (int i = from; i + 1 < data.Length; i++) if (data[i] == 13 && data[i + 1] == 10) return i;
    return -1;
  }

  static void Route(Stream s, HttpRequestLite r) {
    if (r.Path.StartsWith("/api/", StringComparison.Ordinal)) { Api(s, r); return; }
    if (r.Method != "GET" && r.Method != "HEAD") { PlainText(s, 405, "Method not allowed"); return; }
    StaticFile(s, r);
  }

  static void Api(Stream s, HttpRequestLite r) {
    if (r.Path == "/api/ics" && r.Method == "POST") { Ics(s, r); return; }
    string provided;
    r.Headers.TryGetValue("X-GSCB-Key", out provided);
    if (!KeyMatches(provided)) { JsonOut(s, 401, Obj("ok", false, "code", "UNAUTHORIZED")); return; }
    if (r.Path == "/api/status" && r.Method == "GET") { JsonOut(s, 200, StatusObject()); return; }
    if (r.Path == "/api/search" && r.Method == "POST") { StartSearch(s, r); return; }
    if (r.Path == "/api/job" && r.Method == "GET") { JobStatus(s, QueryValue(r.Query, "id")); return; }
    if (r.Path == "/api/cancel" && r.Method == "POST") { Cancel(s); return; }
    if (r.Path == "/api/last" && r.Method == "GET") {
      string last;
      lock (StateLock) last = LastResultJson;
      RawJson(s, 200, last.Length > 0 ? "{\"ok\":true,\"result\":" + last + "}" : "{\"ok\":true,\"result\":null}");
      return;
    }
    JsonOut(s, 404, Obj("ok", false, "code", "NOT_FOUND"));
  }

  static bool KeyMatches(string provided) {
    string key;
    lock (StateLock) key = Key;
    if (key.Length == 0 || provided == null || provided.Length != key.Length) return false;
    int diff = 0;
    for (int i = 0; i < key.Length; i++) diff |= key[i] ^ provided[i];
    return diff == 0;
  }

  static Dictionary<string, object> StatusObject() {
    lock (StateLock) {
      return Obj("ok", true, "version", Version, "busy", ActiveSearch.Length > 0, "hasLast", LastResultJson.Length > 0,
        "tunnel", Obj("state", TunnelState, "url", TunnelUrl, "code", TunnelCode));
    }
  }

  static void StartSearch(Stream s, HttpRequestLite r) {
    Dictionary<string, object> body = null;
    try { body = Json.Deserialize<Dictionary<string, object>>(Utf8Strict.GetString(r.Body)); } catch { }
    Dictionary<string, object> criteria = body == null ? null : Get(body, "criteria") as Dictionary<string, object>;
    if (criteria == null) { JsonOut(s, 400, Obj("ok", false, "code", "BAD_CRITERIA")); return; }
    // Chi chuyen cac truong chuoi da biet, moi truong toi da 500 ky tu.
    Dictionary<string, object> clean = new Dictionary<string, object>();
    foreach (string name in AllowedCriteria) {
      object v;
      if (!criteria.TryGetValue(name, out v) || v == null) continue;
      if (!(v is string) && !(v is int) && !(v is long) && !(v is decimal) && !(v is double)) continue;
      string text = Convert.ToString(v, CultureInfo.InvariantCulture);
      clean[name] = text.Length > 500 ? text.Substring(0, 500) : text;
    }
    string id = null, busyWith = null;
    lock (StateLock) {
      CleanupJobs();
      if (ActiveSearch.Length > 0) busyWith = ActiveSearch;
      else {
        id = NewId();
        PhoneJob job = new PhoneJob();
        job.Id = id; job.Op = "search"; job.State = "queued"; job.Created = job.Updated = DateTime.UtcNow;
        Jobs[id] = job;
        ActiveSearch = id;
      }
    }
    if (busyWith != null) { JsonOut(s, 409, Obj("ok", false, "code", "BUSY", "jobId", busyWith)); return; }
    Send(Obj("type", "job", "id", id, "op", "search", "criteria", clean));
    JsonOut(s, 202, Obj("ok", true, "jobId", id));
  }

  static void JobStatus(Stream s, string id) {
    string state = null, code = null, resultJson = null;
    object progress = null;
    lock (StateLock) {
      PhoneJob job;
      if (id != null && Jobs.TryGetValue(id, out job)) { state = job.State; code = job.Code; progress = job.Progress; resultJson = job.ResultJson; }
    }
    if (state == null) { JsonOut(s, 404, Obj("ok", false, "code", "NO_JOB")); return; }
    StringBuilder sb = new StringBuilder();
    sb.Append("{\"ok\":true,\"id\":").Append(Json.Serialize(id)).Append(",\"state\":").Append(Json.Serialize(state));
    sb.Append(",\"code\":").Append(Json.Serialize(code ?? "")).Append(",\"progress\":").Append(Json.Serialize(progress));
    sb.Append(",\"result\":").Append(state == "done" && !String.IsNullOrEmpty(resultJson) ? resultJson : "null").Append('}');
    RawJson(s, 200, sb.ToString());
  }

  static void Cancel(Stream s) {
    string target;
    lock (StateLock) target = ActiveSearch;
    if (target.Length == 0) { JsonOut(s, 200, Obj("ok", true, "idle", true)); return; }
    Send(Obj("type", "job", "id", NewId(), "op", "cancel", "target", target));
    JsonOut(s, 202, Obj("ok", true));
  }

  static void CleanupJobs() {
    DateTime now = DateTime.UtcNow;
    List<string> old = new List<string>();
    foreach (KeyValuePair<string, PhoneJob> kv in Jobs) if ((now - kv.Value.Updated).TotalMinutes > 30) old.Add(kv.Key);
    foreach (string id in old) Jobs.Remove(id);
    PhoneJob active;
    if (ActiveSearch.Length > 0 && (!Jobs.TryGetValue(ActiveSearch, out active) || (now - active.Updated).TotalMinutes > 20)) ActiveSearch = "";
  }

  // Them han nop vao Lich iPhone: form POST (ca khoa) -> tep .ics, Safari hoi "Them vao Lich".
  static void Ics(Stream s, HttpRequestLite r) {
    Dictionary<string, string> form = ParseForm(Utf8Strict.GetString(r.Body));
    string k;
    form.TryGetValue("k", out k);
    if (!KeyMatches(k)) { PlainText(s, 401, "Unauthorized"); return; }
    string summary = Field(form, "summary", 300), description = Field(form, "description", 1500), url = Field(form, "url", 600), close = Field(form, "close", 40);
    DateTime when;
    if (!DateTime.TryParse(close, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out when)
        || when < DateTime.UtcNow.AddYears(-1) || when > DateTime.UtcNow.AddYears(3)) { PlainText(s, 400, "Bad date"); return; }
    if (!Regex.IsMatch(url, @"\Ahttps://muasamcong\.(mof|mpi)\.gov\.vn/[^\s""<>]*\z")) url = "";
    string stamp = "yyyyMMdd'T'HHmmss'Z'";
    StringBuilder ics = new StringBuilder();
    ics.Append("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GiaoSuCuiBap//DienThoai//VI\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\n");
    ics.Append("UID:").Append(Sha256Hex(summary + "|" + close).Substring(0, 32)).Append("@giaosucuibap\r\n");
    ics.Append("DTSTAMP:").Append(DateTime.UtcNow.ToString(stamp, CultureInfo.InvariantCulture)).Append("\r\n");
    ics.Append("DTSTART:").Append(when.ToString(stamp, CultureInfo.InvariantCulture)).Append("\r\n");
    ics.Append("DTEND:").Append(when.AddMinutes(30).ToString(stamp, CultureInfo.InvariantCulture)).Append("\r\n");
    ics.Append(Fold("SUMMARY:" + IcsText(summary)));
    if (description.Length > 0) ics.Append(Fold("DESCRIPTION:" + IcsText(description)));
    if (url.Length > 0) ics.Append(Fold("URL:" + url));
    foreach (string trigger in new string[] { "-PT72H", "-PT24H", "-PT3H" }) {
      ics.Append("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:").Append(trigger).Append("\r\n").Append(Fold("DESCRIPTION:" + IcsText(summary))).Append("END:VALARM\r\n");
    }
    ics.Append("END:VEVENT\r\nEND:VCALENDAR\r\n");
    Dictionary<string, string> h = new Dictionary<string, string>();
    h["Content-Disposition"] = "inline; filename=\"han-nop.ics\"";
    h["Cache-Control"] = "no-store";
    Respond(s, 200, "text/calendar; charset=utf-8", Encoding.UTF8.GetBytes(ics.ToString()), h);
  }

  static string IcsText(string v) {
    return v.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\r\n", "\\n").Replace("\n", "\\n").Replace("\r", "");
  }

  // Gap dong .ics o 75 byte, khong cat giua ky tu nhieu byte.
  static string Fold(string line) {
    StringBuilder sb = new StringBuilder();
    int bytes = 0;
    foreach (char c in line) {
      int n = Encoding.UTF8.GetByteCount(new char[] { c });
      if (bytes + n > 75) { sb.Append("\r\n "); bytes = 1; }
      sb.Append(c);
      bytes += n;
    }
    return sb.Append("\r\n").ToString();
  }

  static void StaticFile(Stream s, HttpRequestLite r) {
    string path;
    try { path = Uri.UnescapeDataString(r.Path); } catch { PlainText(s, 400, "Bad path"); return; }
    if (path.IndexOf('\0') >= 0 || path.IndexOf('\\') >= 0 || path.IndexOf(':') >= 0 || path.Contains("..") || path.Contains("//")) { PlainText(s, 400, "Bad path"); return; }
    if (path == "/") path = "/index.html";
    string root = WebRoot.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) ? WebRoot : WebRoot + Path.DirectorySeparatorChar;
    string full;
    try { full = Path.GetFullPath(Path.Combine(root, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))); } catch { PlainText(s, 400, "Bad path"); return; }
    if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) { PlainText(s, 404, "Not found"); return; }
    if (!File.Exists(full)) {
      // Ung dung mot trang: duong dan khong co duoi tep (/theo-doi, /goi/...) tra ve index.html.
      if (Path.GetExtension(path).Length == 0) full = Path.Combine(root, "index.html");
      else { PlainText(s, 404, "Not found"); return; }
    }
    if (!File.Exists(full)) { PlainText(s, 503, "Giao dien dien thoai chua duoc cai. Chay lai BAT-LINK-DIEN-THOAI.bat."); return; }
    byte[] data = File.ReadAllBytes(full);
    string type = ContentType(full);
    Dictionary<string, string> h = new Dictionary<string, string>();
    if (type.StartsWith("text/html", StringComparison.Ordinal)) {
      h["Content-Security-Policy"] = Csp;
      h["Cache-Control"] = "no-cache";
      h["X-Frame-Options"] = "DENY";
    } else if (path.StartsWith("/_expo/static/", StringComparison.Ordinal) || path.StartsWith("/assets/", StringComparison.Ordinal)) {
      h["Cache-Control"] = "public, max-age=604800, immutable";
    } else {
      h["Cache-Control"] = "no-cache";
    }
    Respond(s, 200, type, r.Method == "HEAD" ? new byte[0] : data, h);
  }

  static string ContentType(string file) {
    switch (Path.GetExtension(file).ToLowerInvariant()) {
      case ".html": return "text/html; charset=utf-8";
      case ".js": return "text/javascript; charset=utf-8";
      case ".css": return "text/css; charset=utf-8";
      case ".json": return "application/json; charset=utf-8";
      case ".webmanifest": return "application/manifest+json; charset=utf-8";
      case ".png": return "image/png";
      case ".ico": return "image/x-icon";
      case ".svg": return "image/svg+xml";
      case ".ttf": return "font/ttf";
      case ".woff2": return "font/woff2";
      default: return "application/octet-stream";
    }
  }

  // ---------------------------------------------------------------- tien ich chung
  static void Respond(Stream s, int code, string type, byte[] body, Dictionary<string, string> extra) {
    StringBuilder h = new StringBuilder();
    h.Append("HTTP/1.1 ").Append(code).Append(' ').Append(Reason(code)).Append("\r\n");
    h.Append("Content-Type: ").Append(type).Append("\r\n");
    h.Append("Content-Length: ").Append(body.Length).Append("\r\n");
    h.Append("Connection: close\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n");
    if (extra != null) foreach (KeyValuePair<string, string> kv in extra) h.Append(kv.Key).Append(": ").Append(kv.Value).Append("\r\n");
    h.Append("\r\n");
    byte[] head = Encoding.ASCII.GetBytes(h.ToString());
    s.Write(head, 0, head.Length);
    if (body.Length > 0) s.Write(body, 0, body.Length);
    s.Flush();
  }

  static void JsonOut(Stream s, int code, object value) { RawJson(s, code, Json.Serialize(value)); }

  static void RawJson(Stream s, int code, string json) {
    Dictionary<string, string> h = new Dictionary<string, string>();
    h["Cache-Control"] = "no-store";
    Respond(s, code, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json), h);
  }

  static void PlainText(Stream s, int code, string text) { Respond(s, code, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(text), null); }

  static string Reason(int code) {
    switch (code) {
      case 200: return "OK";
      case 202: return "Accepted";
      case 400: return "Bad Request";
      case 401: return "Unauthorized";
      case 404: return "Not Found";
      case 405: return "Method Not Allowed";
      case 409: return "Conflict";
      case 503: return "Service Unavailable";
      default: return "Status";
    }
  }

  static Dictionary<string, string> ParseForm(string body) {
    Dictionary<string, string> form = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (string pair in body.Split('&')) {
      if (pair.Length == 0) continue;
      int eq = pair.IndexOf('=');
      string name = eq < 0 ? pair : pair.Substring(0, eq), value = eq < 0 ? "" : pair.Substring(eq + 1);
      try { form[Uri.UnescapeDataString(name.Replace('+', ' '))] = Uri.UnescapeDataString(value.Replace('+', ' ')); } catch { }
    }
    return form;
  }

  static string QueryValue(string query, string name) {
    string value;
    return ParseForm(query ?? "").TryGetValue(name, out value) ? value : null;
  }

  static string Field(Dictionary<string, string> form, string name, int max) {
    string value;
    if (!form.TryGetValue(name, out value) || value == null) return "";
    value = value.Trim();
    return value.Length > max ? value.Substring(0, max) : value;
  }

  static Dictionary<string, object> Obj(params object[] pairs) {
    Dictionary<string, object> o = new Dictionary<string, object>();
    for (int i = 0; i + 1 < pairs.Length; i += 2) o[(string)pairs[i]] = pairs[i + 1];
    return o;
  }

  static object Get(Dictionary<string, object> o, string key) {
    object v;
    return o != null && o.TryGetValue(key, out v) ? v : null;
  }

  static string Str(Dictionary<string, object> o, string key) {
    string v = Get(o, key) as string;
    return v ?? "";
  }

  static string NewId() {
    byte[] b = new byte[12];
    using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
    return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
  }

  static string Sha256Hex(string text) {
    using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "").ToLowerInvariant();
  }

  static string Clip(string v, int max) { return v.Length > max ? v.Substring(0, max) : v; }

  static void Log(string line) {
    try {
      lock (LogLock) {
        FileInfo f = new FileInfo(LogPath);
        if (f.Exists && f.Length > 1024 * 1024) File.Delete(LogPath);
        File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + " " + line + Environment.NewLine, Encoding.UTF8);
      }
    } catch { }
  }
}
