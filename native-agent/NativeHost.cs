// Build with .NET Framework's csc.exe; no HTTP listener, no third-party runtime.
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Diagnostics;
using System.Threading;

internal static class NativeHost {
  const string Origin = "chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj";
  const string Upstream = "http://127.0.0.1:1234";
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 8 };
  static object Reply(bool ok, string code, string message) { return new { ok = ok, installed = true, code = code, message = message }; }
  static string Text(Dictionary<string, object> msg, string key) { object value; return msg.TryGetValue(key, out value) && value is string ? (string)value : ""; }
  static HttpWebRequest Request(string path, int timeout) {
    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Upstream + path);
    req.Method = "GET"; req.Timeout = timeout; req.ReadWriteTimeout = timeout;
    req.AllowAutoRedirect = false; req.Proxy = null; req.UseDefaultCredentials = false;
    return req;
  }
  static bool IsUpstreamAlive() {
    try { using (HttpWebResponse res = (HttpWebResponse)Request("/", 2500).GetResponse()) return (int)res.StatusCode < 500; }
    catch (WebException e) { using (HttpWebResponse res = e.Response as HttpWebResponse) return res != null && (int)res.StatusCode < 500; }
  }
  static string OutputDirectory() {
    string config = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "settings.json");
    string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "GiaoSuCuiBap", "HoSo");
    if (File.Exists(config)) {
      Dictionary<string, object> settings = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(config, Encoding.UTF8));
      string configured = Text(settings, "downloadDirectory");
      if (configured.Length > 0) dir = configured;
    }
    if (!Path.IsPathRooted(dir) || dir.StartsWith(@"\\") || !Regex.IsMatch(dir, @"^[A-Za-z]:\\")) throw new InvalidDataException();
    dir = Path.GetFullPath(dir);
    if (dir.Length < 4) throw new InvalidDataException();
    Directory.CreateDirectory(dir);
    return dir;
  }
  static string SafeName(string name) {
    if (String.IsNullOrWhiteSpace(name) || name.Length > 180 || name != Path.GetFileName(name)
        || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name.EndsWith(".") || name.EndsWith(" ")
        || Regex.IsMatch(name, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)", RegexOptions.IgnoreCase)
        || !Regex.IsMatch(name, @"\.(pdf|docx?|xlsx?|zip|rar|7z|png|jpe?g)$", RegexOptions.IgnoreCase)) throw new InvalidDataException();
    return name;
  }
  static bool ErrorDocument(byte[] bytes, int count, string contentType) {
    string prefix = Encoding.UTF8.GetString(bytes, 0, count).TrimStart('\uFEFF', ' ', '\r', '\n', '\t').ToLowerInvariant();
    return contentType.Contains("text/html") || contentType.Contains("application/json") || prefix.StartsWith("<") || prefix.StartsWith("{") || prefix.StartsWith("[");
  }
  static bool StartsWith(byte[] bytes, int count, params byte[] magic) {
    if (count < magic.Length) return false;
    for (int i = 0; i < magic.Length; i++) if (bytes[i] != magic[i]) return false;
    return true;
  }
  static bool ValidContent(byte[] prefix, int count, string contentType, string name) {
    if (ErrorDocument(prefix, count, contentType)) return false;
    string ext = Path.GetExtension(name).ToLowerInvariant();
    if (ext == ".pdf") {
      // PDF permits a short binary preamble; inspect only the first KiB.
      for (int i = 0; i <= count - 5; i++) if (prefix[i] == '%' && prefix[i+1] == 'P' && prefix[i+2] == 'D' && prefix[i+3] == 'F' && prefix[i+4] == '-') return true;
      return false;
    }
    if (ext == ".zip" || ext == ".docx" || ext == ".xlsx") return StartsWith(prefix, count, 0x50, 0x4b, 0x03, 0x04) || StartsWith(prefix, count, 0x50, 0x4b, 0x05, 0x06);
    if (ext == ".doc" || ext == ".xls") return StartsWith(prefix, count, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    if (ext == ".rar") return StartsWith(prefix, count, 0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00) || StartsWith(prefix, count, 0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00);
    if (ext == ".7z") return StartsWith(prefix, count, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c);
    if (ext == ".png") return StartsWith(prefix, count, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    if (ext == ".jpg" || ext == ".jpeg") return StartsWith(prefix, count, 0xff, 0xd8, 0xff);
    return false;
  }
  static object Download(Dictionary<string, object> msg) {
    string id = Text(msg, "fileId");
    if (!Regex.IsMatch(id, @"\A[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\z")) return Reply(false, "INVALID_FILE_ID", "Ma tep khong hop le.");
    string name, dir;
    try { name = SafeName(Text(msg, "fileName")); dir = OutputDirectory(); }
    catch { return Reply(false, "INVALID_DESTINATION", "Ten tep hoac thu muc tai khong hop le."); }
    string temp = Path.Combine(dir, ".gscb-" + Guid.NewGuid().ToString("N") + ".partial");
    const int MaxElapsedMs = 300000;
    Stopwatch elapsed = Stopwatch.StartNew();
    HttpWebRequest request = Request("/api/download/file/browser/public?fileId=" + id, 120000);
    try {
      // Abort enforces the total deadline even while a blocking read waits.
      using (Timer deadline = new Timer(delegate(object state) { request.Abort(); }, null, MaxElapsedMs, Timeout.Infinite))
      using (HttpWebResponse res = (HttpWebResponse)request.GetResponse()) {
        if ((int)res.StatusCode != 200) return Reply(false, "UPSTREAM_STATUS", "Phan mem ho tro e-GP chua tra tep (HTTP " + (int)res.StatusCode + ").");
        long length = 0; const long MaxLength = 2147483648L;
        if (res.ContentLength > MaxLength) return Reply(false, "FILE_TOO_LARGE", "Tep vuot gioi han 2 GiB cua cau noi.");
        using (Stream input = res.GetResponseStream()) using (FileStream output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
          byte[] buffer = new byte[65536], prefix = new byte[1024]; int count, prefixLength = 0; bool validated = false;
          while ((count = input.Read(buffer, 0, buffer.Length)) > 0) {
            if (elapsed.ElapsedMilliseconds >= MaxElapsedMs) throw new IOException();
            int copy = Math.Min(count, prefix.Length - prefixLength);
            if (copy > 0) { Buffer.BlockCopy(buffer, 0, prefix, prefixLength, copy); prefixLength += copy; }
            if (!validated && prefixLength == prefix.Length) {
              if (!ValidContent(prefix, prefixLength, (res.ContentType ?? "").ToLowerInvariant(), name)) throw new InvalidDataException();
              validated = true;
            }
            length += count; if (length > MaxLength) throw new InvalidDataException();
            output.Write(buffer, 0, count);
          }
          if (length == 0 || (res.ContentLength >= 0 && length != res.ContentLength)) throw new InvalidDataException();
          if (!validated && !ValidContent(prefix, prefixLength, (res.ContentType ?? "").ToLowerInvariant(), name)) throw new InvalidDataException();
          output.Flush(true);
        }
        if (elapsed.ElapsedMilliseconds >= MaxElapsedMs) throw new IOException();
        string destination = Path.Combine(dir, name);
        // Reserve through File.Move; never overwrite any existing file.
        for (int n = 0; ; n++) {
          if (elapsed.ElapsedMilliseconds >= MaxElapsedMs) throw new IOException();
          if (n > 0) destination = Path.Combine(dir, Path.GetFileNameWithoutExtension(name) + " (" + n + ")" + Path.GetExtension(name));
          if (n > 9999) throw new IOException();
          try { File.Move(temp, destination); break; }
          catch (IOException) { if (!File.Exists(destination)) throw; }
        }
        return new { ok = true, installed = true, code = "DOWNLOADED", filename = destination, bytes = length, message = "Da tai va kiem tra kich thuoc tep." };
      }
    } catch (WebException e) {
      using (HttpWebResponse res = e.Response as HttpWebResponse) return Reply(false, "UPSTREAM_UNAVAILABLE", res == null ? "Khong ket noi duoc phan mem ho tro e-GP tai 127.0.0.1:1234." : "Phan mem ho tro e-GP tra HTTP " + (int)res.StatusCode + ".");
    } catch { return Reply(false, "DOWNLOAD_FAILED", "Tep rong, chua tai du hoac khong ghi duoc; chua danh dau thanh cong."); }
    finally { try { if (File.Exists(temp)) File.Delete(temp); } catch { } }
  }
  static byte[] ReadExact(Stream input, int size) {
    byte[] data = new byte[size]; int at = 0, n;
    while (at < size && (n = input.Read(data, at, size - at)) > 0) at += n;
    if (at != size) throw new EndOfStreamException(); return data;
  }
  public static int Main(string[] args) {
    if (args.Length < 1 || args[0].TrimEnd('/') != Origin) return 2;
    try {
      Stream input = Console.OpenStandardInput(), output = Console.OpenStandardOutput();
      uint size = BitConverter.ToUInt32(ReadExact(input, 4), 0);
      if (size == 0 || size > 65536) return 3;
      object result;
      try {
        Dictionary<string, object> msg = Json.Deserialize<Dictionary<string, object>>(new UTF8Encoding(false, true).GetString(ReadExact(input, (int)size)));
        string command = Text(msg, "command");
        foreach (string key in msg.Keys) if (key != "command" && !(command == "download" && (key == "fileId" || key == "fileName"))) throw new InvalidDataException();
        if (command == "ping") result = new { ok = true, installed = true, upstream = IsUpstreamAlive(), version = "4.11.0" };
        else if (command == "download") result = Download(msg);
        else result = Reply(false, "INVALID_COMMAND", "Lenh khong duoc ho tro.");
      } catch { result = Reply(false, "INVALID_MESSAGE", "Thong diep khong hop le."); }
      byte[] response = Encoding.UTF8.GetBytes(Json.Serialize(result));
      byte[] header = BitConverter.GetBytes(response.Length);
      output.Write(header, 0, header.Length); output.Write(response, 0, response.Length); output.Flush(); return 0;
    } catch { return 4; }
  }
}
