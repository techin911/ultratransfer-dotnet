using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;

namespace UltraTransfer
{
    class Program
    {
        private static int Port = 5050;
        private static string UploadsDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "uploads");
        private static string WebDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
        private static TcpListener server;
        
        private static Dictionary<string, List<string>> RoomSignals = new Dictionary<string, List<string>>();
        private static object RoomLock = new object();

        private static Dictionary<string, UploadSession> Sessions = new Dictionary<string, UploadSession>();

        class UploadSession
        {
            public string SessionId { get; set; }
            public string FileName { get; set; }
            public long TotalSize { get; set; }
            public int TotalChunks { get; set; }
            public string TargetPath { get; set; }
            public HashSet<int> ReceivedChunks { get; set; }
            public object Lock { get; set; }

            public UploadSession()
            {
                ReceivedChunks = new HashSet<int>();
                Lock = new object();
            }
        }

        static void Main(string[] args)
        {
            string envPort = Environment.GetEnvironmentVariable("PORT");
            int parsedPort;
            if (!string.IsNullOrEmpty(envPort) && int.TryParse(envPort, out parsedPort))
            {
                Port = parsedPort;
            }

            Console.Title = "UltraTransfer .NET - Ultrafast File Transfer";
            Directory.CreateDirectory(UploadsDir);
            Directory.CreateDirectory(WebDir);

            List<string> localIPs = GetLocalIPAddresses();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
   ╔════════════════════════════════════════════════════════════════╗
   ║          ULTRATRANSFER .NET - ULTRAFAST FILE TRANSFER          ║
   ║            (Local Network + Over-The-Internet P2P)             ║
   ╚════════════════════════════════════════════════════════════════╝");
            Console.ResetColor();

            Console.WriteLine("\n [!] Uploads Folder: " + UploadsDir);
            Console.WriteLine(" [!] Local LAN / Wi-Fi Links (Phone must be on SAME Wi-Fi):");
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("     -> Local Host: http://localhost:" + Port);
            foreach (var ip in localIPs)
            {
                Console.WriteLine("     -> Network IP: http://" + ip + ":" + Port);
            }
            Console.ResetColor();

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("\n [📱] USING MOBILE DATA (4G/5G)? (Phone NOT on Wi-Fi):");
            Console.WriteLine("     1. Turn ON 'Mobile Hotspot' on phone & connect PC to it, OR");
            Console.WriteLine("     2. Run 'start_mobile_internet_tunnel.bat' to generate a public Internet link!");
            Console.ResetColor();
            Console.WriteLine("--------------------------------------------------------------------\n");

            StartServer();
        }

        private static List<string> GetLocalIPAddresses()
        {
            List<string> ips = new List<string>();
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus == OperationalStatus.Up &&
                        ni.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    {
                        foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                        {
                            if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                            {
                                string address = ip.Address.ToString();
                                if (!address.StartsWith("127."))
                                    ips.Add(address);
                            }
                        }
                    }
                }
            }
            catch { }
            return ips;
        }

        private static void StartServer()
        {
            while (true)
            {
                try
                {
                    server = new TcpListener(IPAddress.Any, Port);
                    server.Start();
                    break;
                }
                catch (Exception)
                {
                    Port++;
                }
            }

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine(" [✓] Server listening active on Port " + Port + " (All Interfaces 0.0.0.0)\n");
            Console.ResetColor();

            try
            {
                Process.Start("http://localhost:" + Port);
            }
            catch { }

            while (true)
            {
                try
                {
                    TcpClient client = server.AcceptTcpClient();
                    Task.Run(() => HandleClient(client));
                }
                catch (Exception)
                {
                    break;
                }
            }
        }

        private static void HandleClient(TcpClient client)
        {
            using (client)
            {
                NetworkStream stream = client.GetStream();
                stream.ReadTimeout = 30000;
                stream.WriteTimeout = 30000;

                try
                {
                    StreamReader reader = new StreamReader(stream, Encoding.UTF8, false, 8192, true);
                    string reqLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(reqLine)) return;

                    string[] reqParts = reqLine.Split(' ');
                    if (reqParts.Length < 2) return;

                    string method = reqParts[0].ToUpper();
                    string url = reqParts[1];

                    Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    string headerLine;
                    long contentLength = 0;

                    while (!string.IsNullOrEmpty(headerLine = reader.ReadLine()))
                    {
                        int colonIdx = headerLine.IndexOf(':');
                        if (colonIdx > 0)
                        {
                            string key = headerLine.Substring(0, colonIdx).Trim();
                            string val = headerLine.Substring(colonIdx + 1).Trim();
                            headers[key] = val;
                        }
                    }

                    if (headers.ContainsKey("Content-Length"))
                    {
                        long.TryParse(headers["Content-Length"], out contentLength);
                    }

                    if (method == "OPTIONS")
                    {
                        SendHttpResponse(stream, 200, "text/plain", new byte[0], headers);
                        return;
                    }

                    string path = url;
                    string query = "";
                    int qIdx = url.IndexOf('?');
                    if (qIdx != -1)
                    {
                        path = url.Substring(0, qIdx);
                        query = url.Substring(qIdx + 1);
                    }
                    path = path.ToLower();

                    if (path == "/api/info")
                    {
                        HandleInfo(stream);
                    }
                    else if (path == "/api/room/create")
                    {
                        HandleRoomCreate(stream);
                    }
                    else if (path == "/api/room/signal")
                    {
                        string body = ReadBodyString(reader, contentLength);
                        HandleRoomSignal(stream, body);
                    }
                    else if (path == "/api/upload/init")
                    {
                        string body = ReadBodyString(reader, contentLength);
                        HandleUploadInit(stream, body);
                    }
                    else if (path == "/api/upload/chunk")
                    {
                        HandleUploadChunk(stream, headers, contentLength);
                    }
                    else if (path == "/api/upload/complete")
                    {
                        string body = ReadBodyString(reader, contentLength);
                        HandleUploadComplete(stream, body);
                    }
                    else if (path == "/api/files")
                    {
                        HandleFileList(stream);
                    }
                    else if (path == "/api/download")
                    {
                        HandleFileDownload(stream, query);
                    }
                    else if (path == "/api/open-folder")
                    {
                        HandleOpenFolder(stream);
                    }
                    else
                    {
                        ServeStaticFile(stream, path);
                    }
                }
                catch (Exception ex)
                {
                    SendJson(stream, 500, "{\"error\":\"" + EscapeJson(ex.Message) + "\"}");
                }
            }
        }

        private static string ReadBodyString(StreamReader reader, long length)
        {
            if (length <= 0) return "";
            char[] buffer = new char[length];
            int read = 0;
            while (read < length)
            {
                int r = reader.Read(buffer, read, (int)(length - read));
                if (r <= 0) break;
                read += r;
            }
            return new string(buffer, 0, read);
        }

        private static void HandleInfo(NetworkStream stream)
        {
            List<string> ips = GetLocalIPAddresses();
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"hostname\":\"" + EscapeJson(Environment.MachineName) + "\",");
            sb.Append("\"port\":" + Port + ",");
            sb.Append("\"ips\":[");
            for (int i = 0; i < ips.Count; i++)
            {
                sb.Append("\"" + ips[i] + "\"");
                if (i < ips.Count - 1) sb.Append(",");
            }
            sb.Append("]}");
            SendJson(stream, 200, sb.ToString());
        }

        private static void HandleRoomCreate(NetworkStream stream)
        {
            Random rand = new Random();
            string roomId = rand.Next(100000, 999999).ToString();
            lock (RoomLock)
            {
                RoomSignals[roomId] = new List<string>();
            }
            SendJson(stream, 200, "{\"roomId\":\"" + roomId + "\"}");
        }

        private static void HandleRoomSignal(NetworkStream stream, string body)
        {
            string roomId = GetJsonValue(body, "roomId");
            string action = GetJsonValue(body, "action");
            string signal = GetJsonValue(body, "signal");

            if (string.IsNullOrEmpty(roomId))
            {
                SendJson(stream, 400, "{\"error\":\"Missing roomId\"}");
                return;
            }

            lock (RoomLock)
            {
                if (!RoomSignals.ContainsKey(roomId))
                {
                    RoomSignals[roomId] = new List<string>();
                }

                if (action == "send" && !string.IsNullOrEmpty(signal))
                {
                    RoomSignals[roomId].Add(signal);
                    SendJson(stream, 200, "{\"status\":\"ok\"}");
                }
                else
                {
                    List<string> signals = new List<string>(RoomSignals[roomId]);
                    RoomSignals[roomId].Clear();

                    StringBuilder sb = new StringBuilder();
                    sb.Append("{\"signals\":[");
                    for (int i = 0; i < signals.Count; i++)
                    {
                        sb.Append("\"" + EscapeJson(signals[i]) + "\"");
                        if (i < signals.Count - 1) sb.Append(",");
                    }
                    sb.Append("]}");
                    SendJson(stream, 200, sb.ToString());
                }
            }
        }

        private static void HandleUploadInit(NetworkStream stream, string body)
        {
            string fileName = GetJsonValue(body, "fileName");
            long totalSize = 0;
            long.TryParse(GetJsonValue(body, "totalSize"), out totalSize);
            int totalChunks = 1;
            int.TryParse(GetJsonValue(body, "totalChunks"), out totalChunks);
            if (totalChunks < 1) totalChunks = 1;

            if (string.IsNullOrEmpty(fileName)) fileName = "unnamed_file_" + DateTime.Now.Ticks;

            string safeFileName = Path.GetFileName(fileName);
            string sessionId = Guid.NewGuid().ToString("N");
            string targetPath = Path.Combine(UploadsDir, safeFileName);

            int counter = 1;
            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(safeFileName);
            string ext = Path.GetExtension(safeFileName);
            while (File.Exists(targetPath))
            {
                targetPath = Path.Combine(UploadsDir, fileNameWithoutExt + "_" + counter + ext);
                counter++;
            }

            using (FileStream fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
            {
                fs.SetLength(totalSize);
            }

            UploadSession session = new UploadSession();
            session.SessionId = sessionId;
            session.FileName = Path.GetFileName(targetPath);
            session.TotalSize = totalSize;
            session.TotalChunks = totalChunks;
            session.TargetPath = targetPath;

            lock (Sessions)
            {
                Sessions[sessionId] = session;
            }

            Console.WriteLine(" [*] Incoming transfer initialized: " + session.FileName + " (" + FormatBytes(totalSize) + ")");

            SendJson(stream, 200, "{\"sessionId\":\"" + sessionId + "\",\"fileName\":\"" + EscapeJson(session.FileName) + "\"}");
        }

        private static void HandleUploadChunk(NetworkStream stream, Dictionary<string, string> headers, long contentLength)
        {
            string sessionId = headers.ContainsKey("X-Session-Id") ? headers["X-Session-Id"] : null;
            int chunkIndex = 0;
            if (headers.ContainsKey("X-Chunk-Index")) int.TryParse(headers["X-Chunk-Index"], out chunkIndex);
            long offset = 0;
            if (headers.ContainsKey("X-Offset")) long.TryParse(headers["X-Offset"], out offset);

            if (string.IsNullOrEmpty(sessionId) || !Sessions.ContainsKey(sessionId))
            {
                SendJson(stream, 404, "{\"error\":\"Session not found\"}");
                return;
            }

            UploadSession session = Sessions[sessionId];

            using (FileStream fs = new FileStream(session.TargetPath, FileMode.Open, FileAccess.Write, FileShare.ReadWrite))
            {
                fs.Seek(offset, SeekOrigin.Begin);
                byte[] buffer = new byte[8192];
                long remaining = contentLength;
                while (remaining > 0)
                {
                    int toRead = (int)Math.Min(buffer.Length, remaining);
                    int r = stream.Read(buffer, 0, toRead);
                    if (r <= 0) break;
                    fs.Write(buffer, 0, r);
                    remaining -= r;
                }
            }

            lock (session.Lock)
            {
                session.ReceivedChunks.Add(chunkIndex);
            }

            SendJson(stream, 200, "{\"chunkIndex\":" + chunkIndex + ",\"received\":true}");
        }

        private static void HandleUploadComplete(NetworkStream stream, string body)
        {
            string sessionId = GetJsonValue(body, "sessionId");

            if (string.IsNullOrEmpty(sessionId) || !Sessions.ContainsKey(sessionId))
            {
                SendJson(stream, 404, "{\"error\":\"Session not found\"}");
                return;
            }

            UploadSession session = Sessions[sessionId];
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine(" [✓] Completed file transfer: " + session.FileName + " (" + FormatBytes(session.TotalSize) + ")");
            Console.ResetColor();

            string filePath = session.TargetPath;
            Task.Run(() => UploadToCloudStorage(filePath));

            lock (Sessions)
            {
                Sessions.Remove(sessionId);
            }

            SendJson(stream, 200, "{\"status\":\"completed\",\"fileName\":\"" + EscapeJson(session.FileName) + "\"}");
        }

        private static void HandleFileList(NetworkStream stream)
        {
            // Privacy mode: Do not return file list to web clients
            SendJson(stream, 200, "{\"files\":[]}");
        }

        private static void HandleFileDownload(NetworkStream stream, string query)
        {
            string fileName = GetQueryValue(query, "file");
            if (string.IsNullOrEmpty(fileName))
            {
                SendJson(stream, 400, "{\"error\":\"Missing file parameter\"}");
                return;
            }

            string safeFileName = Path.GetFileName(fileName);
            string filePath = Path.Combine(UploadsDir, safeFileName);

            if (!File.Exists(filePath))
            {
                SendJson(stream, 404, "{\"error\":\"File not found\"}");
                return;
            }

            FileInfo fi = new FileInfo(filePath);
            byte[] fileBytes = File.ReadAllBytes(filePath);

            Dictionary<string, string> h = new Dictionary<string, string>();
            h["Content-Disposition"] = "attachment; filename=\"" + Uri.EscapeDataString(fi.Name) + "\"";
            SendHttpResponse(stream, 200, "application/octet-stream", fileBytes, h);
        }

        private static void HandleOpenFolder(NetworkStream stream)
        {
            try
            {
                Process.Start("explorer.exe", UploadsDir);
                SendJson(stream, 200, "{\"status\":\"opened\"}");
            }
            catch (Exception ex)
            {
                SendJson(stream, 500, "{\"error\":\"" + EscapeJson(ex.Message) + "\"}");
            }
        }

        private static void ServeStaticFile(NetworkStream stream, string relPath)
        {
            if (relPath == "/" || string.IsNullOrEmpty(relPath)) relPath = "/index.html";

            string localPath = Path.Combine(WebDir, relPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

            if (!File.Exists(localPath))
            {
                byte[] notFound = Encoding.UTF8.GetBytes("<h1>404 - Asset Not Found</h1>");
                SendHttpResponse(stream, 404, "text/html", notFound, null);
                return;
            }

            string ext = Path.GetExtension(localPath).ToLower();
            string mime = "text/html";
            if (ext == ".css") mime = "text/css";
            else if (ext == ".js") mime = "application/javascript";
            else if (ext == ".json") mime = "application/json";
            else if (ext == ".png") mime = "image/png";
            else if (ext == ".jpg" || ext == ".jpeg") mime = "image/jpeg";
            else if (ext == ".svg") mime = "image/svg+xml";

            byte[] bytes = File.ReadAllBytes(localPath);
            SendHttpResponse(stream, 200, mime, bytes, null);
        }

        private static void SendJson(NetworkStream stream, int code, string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            SendHttpResponse(stream, code, "application/json", bytes, null);
        }

        private static void SendHttpResponse(NetworkStream stream, int statusCode, string contentType, byte[] body, Dictionary<string, string> extraHeaders)
        {
            string statusText = statusCode == 200 ? "OK" : statusCode == 404 ? "Not Found" : "Server Error";
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 " + statusCode + " " + statusText + "\r\n");
            sb.Append("Content-Type: " + contentType + "\r\n");
            sb.Append("Content-Length: " + body.Length + "\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type, X-Session-Id, X-Chunk-Index, X-Total-Chunks, X-Offset\r\n");
            sb.Append("Connection: close\r\n");

            if (extraHeaders != null)
            {
                foreach (var kvp in extraHeaders)
                {
                    sb.Append(kvp.Key + ": " + kvp.Value + "\r\n");
                }
            }

            sb.Append("\r\n");
            byte[] headerBytes = Encoding.UTF8.GetBytes(sb.ToString());

            stream.Write(headerBytes, 0, headerBytes.Length);
            if (body.Length > 0)
            {
                stream.Write(body, 0, body.Length);
            }
            stream.Flush();
        }

        private static string GetQueryValue(string query, string key)
        {
            if (string.IsNullOrEmpty(query)) return null;
            string[] pairs = query.Split('&');
            foreach (var p in pairs)
            {
                string[] parts = p.Split('=');
                if (parts.Length == 2 && parts[0].Equals(key, StringComparison.OrdinalIgnoreCase))
                {
                    return Uri.UnescapeDataString(parts[1]);
                }
            }
            return null;
        }

        private static string GetJsonValue(string json, string key)
        {
            if (string.IsNullOrEmpty(json)) return null;

            int keyIdx = json.IndexOf("\"" + key + "\"");
            if (keyIdx == -1) return null;

            int colonIdx = json.IndexOf(':', keyIdx);
            if (colonIdx == -1) return null;

            int start = colonIdx + 1;
            while (start < json.Length && (json[start] == ' ' || json[start] == '\t' || json[start] == '\r' || json[start] == '\n'))
                start++;

            if (start >= json.Length) return null;

            if (json[start] == '"')
            {
                start++;
                int end = json.IndexOf('"', start);
                if (end == -1) return null;
                return json.Substring(start, end - start);
            }
            else
            {
                int end = start;
                while (end < json.Length && json[end] != ',' && json[end] != '}' && json[end] != ']' && json[end] != ' ' && json[end] != '\r' && json[end] != '\n')
                    end++;
                return json.Substring(start, end - start).Trim();
            }
        }

        private static string EscapeJson(string str)
        {
            if (str == null) return "";
            return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        private static string FormatBytes(long bytes)
        {
            string[] suf = { "B", "KB", "MB", "GB", "TB" };
            if (bytes == 0) return "0 B";
            int place = Convert.ToInt32(Math.Floor(Math.Log(bytes, 1024)));
            double num = Math.Round(bytes / Math.Pow(1024, place), 2);
            return num.ToString() + " " + suf[place];
        }

        private static void UploadToCloudStorage(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

            string fileName = Path.GetFileName(filePath);
            string webhookUrl = Environment.GetEnvironmentVariable("GDRIVE_WEBHOOK_URL");
            string accessToken = Environment.GetEnvironmentVariable("GDRIVE_ACCESS_TOKEN");

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(" [☁️] Starting Cloud Storage sync for: " + fileName);
            Console.ResetColor();

            try
            {
                if (!string.IsNullOrEmpty(webhookUrl))
                {
                    using (WebClient client = new WebClient())
                    {
                        byte[] fileBytes = File.ReadAllBytes(filePath);
                        client.Headers[HttpRequestHeader.ContentType] = "application/octet-stream";
                        byte[] resp = client.UploadData(webhookUrl + "?name=" + Uri.EscapeDataString(fileName), "POST", fileBytes);
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine(" [✓] Successfully saved to Google Drive (Webhook): " + fileName);
                        Console.ResetColor();
                    }
                }
                else if (!string.IsNullOrEmpty(accessToken))
                {
                    using (WebClient client = new WebClient())
                    {
                        client.Headers["Authorization"] = "Bearer " + accessToken;
                        client.Headers[HttpRequestHeader.ContentType] = "application/octet-stream";
                        byte[] fileBytes = File.ReadAllBytes(filePath);
                        string url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=media";
                        byte[] resp = client.UploadData(url, "POST", fileBytes);
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine(" [✓] Successfully saved to Google Drive (API v3): " + fileName);
                        Console.ResetColor();
                    }
                }
                else
                {
                    Console.WriteLine(" [!] Note: GDRIVE_WEBHOOK_URL environment variable is not set. Set GDRIVE_WEBHOOK_URL on Render to auto-save to Google Drive!");
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine(" [!] Cloud sync warning: " + ex.Message);
                Console.ResetColor();
            }
        }
    }
}
