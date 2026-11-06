using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using BotStudio.Hub;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace BotStudio.Tests;

/// <summary>Хаб целиком: настоящий Kestrel, WebSocket, JSON-RPC, эмулятор вместо робота.</summary>
public sealed class HubTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        _port = FreePort();
        _app = BotStudioHub.Build([$"--Hub:Port={_port}", "--Hub:RemoteWatchdogMs=300", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Hello_returns_version_and_client_id()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        var hello = await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "тест" });

        Assert.Equal("BotStudio", (string?)hello["hub"]);
        Assert.False(string.IsNullOrEmpty((string?)hello["clientId"]));
        Assert.Contains("emulator", hello["transports"]!.AsArray().Select(t => (string?)t));
    }

    [Fact]
    public async Task Drives_the_emulator_and_stops()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "пульт" });

        var robot = await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        Assert.Equal("connected", (string?)robot["state"]);
        Assert.Equal("superbot-car", (string?)robot["profileId"]);
        Assert.Contains(robot["components"]!.AsArray(), c => (string?)c!["id"] == "D1" && c["aliases"]!.AsArray().Any(a => (string?)a == "front"));

        await rpc.CallAsync("drive.arcade", new JsonObject { ["throttle"] = 100, ["turn"] = 0 });
        var telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(60, (int)telemetry["motors"]!["M1"]!);   // лимит машинки
        Assert.Equal(-60, (int)telemetry["motors"]!["M2"]!);  // правый мотор зеркальный

        await rpc.CallAsync("robot.stop");
        telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(0, (int)telemetry["motors"]!["M1"]!);

        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Watchdog_stops_robot_when_remote_goes_silent()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await rpc.CallAsync("drive.tank", new JsonObject { ["left"] = 50, ["right"] = 50 });

        var safety = await rpc.WaitNotificationAsync("safety.event", TimeSpan.FromSeconds(3));
        Assert.Equal("watchdog", (string?)safety["reason"]);

        var telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(0, (int)telemetry["motors"]!["M1"]!);
        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Second_client_cannot_drive_while_first_one_controls()
    {
        await using var first = await RpcClient.ConnectAsync(_port);
        await using var second = await RpcClient.ConnectAsync(_port);
        await first.CallAsync("hub.hello", new JsonObject { ["name"] = "Программа" });
        await first.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await first.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10, ["source"] = "program" });

        var error = await Assert.ThrowsAsync<RpcError>(() => second.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10 }));
        Assert.Equal(HubErrors.ControlBusy, error.Code);

        // СТОП разрешён всем.
        await second.CallAsync("robot.stop");
        await first.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Rejects_websocket_from_foreign_origin()
    {
        using var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", "https://evil.example");
        await Assert.ThrowsAnyAsync<WebSocketException>(() => socket.ConnectAsync(new Uri($"ws://localhost:{_port}/ws"), CancellationToken.None));
    }

    [Fact]
    public async Task Unknown_method_returns_method_not_found()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        var error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("robot.fly"));
        Assert.Equal(HubErrors.MethodNotFound, error.Code);
    }

    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    internal sealed class RpcError(int code, string message) : Exception(message)
    {
        public int Code { get; } = code;
    }

    /// <summary>Мини-клиент JSON-RPC для тестов (как будущий C#-SDK, только проще).</summary>
    private sealed class RpcClient : IAsyncDisposable
    {
        private readonly ClientWebSocket _socket = new();
        private readonly Dictionary<int, TaskCompletionSource<JsonNode>> _pending = [];
        private readonly List<JsonNode> _notifications = [];
        private readonly Lock _lock = new();
        private readonly CancellationTokenSource _cts = new();
        private Task _receiver = Task.CompletedTask;
        private int _nextId;

        public static async Task<RpcClient> ConnectAsync(int port)
        {
            var client = new RpcClient();
            await client._socket.ConnectAsync(new Uri($"ws://localhost:{port}/ws"), CancellationToken.None);
            client._receiver = client.ReceiveLoopAsync();
            return client;
        }

        public async Task<JsonNode> CallAsync(string method, JsonObject? parameters = null)
        {
            var id = Interlocked.Increment(ref _nextId);
            var tcs = new TaskCompletionSource<JsonNode>(TaskCreationOptions.RunContinuationsAsynchronously);
            lock (_lock)
            {
                _pending[id] = tcs;
            }

            var request = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters ?? [] };
            await _socket.SendAsync(Encoding.UTF8.GetBytes(request.ToJsonString()), WebSocketMessageType.Text, true, CancellationToken.None);
            var response = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(10));
            if (response["error"] is { } error)
            {
                throw new RpcError((int)error["code"]!, (string?)error["message"] ?? "");
            }

            return response["result"] ?? JsonValue.Create((string?)null)!;
        }

        public async Task<JsonNode> WaitNotificationAsync(string method, TimeSpan timeout)
        {
            var deadline = DateTime.UtcNow + timeout;
            while (DateTime.UtcNow < deadline)
            {
                lock (_lock)
                {
                    var found = _notifications.FirstOrDefault(n => (string?)n["method"] == method);
                    if (found is not null)
                    {
                        return found["params"]!;
                    }
                }

                await Task.Delay(20);
            }

            throw new TimeoutException($"Не пришло уведомление {method}.");
        }

        public async ValueTask DisposeAsync()
        {
            await _cts.CancelAsync();
            if (_socket.State == WebSocketState.Open)
            {
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            }

            try
            {
                await _receiver;
            }
            catch (Exception ex) when (ex is OperationCanceledException or WebSocketException)
            {
            }

            _socket.Dispose();
            _cts.Dispose();
        }

        private async Task ReceiveLoopAsync()
        {
            var buffer = new byte[64 * 1024];
            using var stream = new MemoryStream();
            while (!_cts.IsCancellationRequested)
            {
                var result = await _socket.ReceiveAsync(buffer, _cts.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }

                stream.Write(buffer, 0, result.Count);
                if (!result.EndOfMessage)
                {
                    continue;
                }

                var message = JsonNode.Parse(stream.ToArray())!;
                stream.SetLength(0);
                lock (_lock)
                {
                    if (message["id"] is JsonValue idValue && idValue.TryGetValue<int>(out var id) && _pending.Remove(id, out var tcs))
                    {
                        tcs.TrySetResult(message);
                    }
                    else if (message["method"] is not null)
                    {
                        _notifications.Add(message);
                    }
                }
            }
        }
    }
}
