using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Gearbit.Hub;
using Gearbit.Hub.UserData;
using Microsoft.AspNetCore.Builder;

namespace Gearbit.Tests;

/// <summary>Локальная история программ: снимки, повторы, чистка старого и проверки HTTP.</summary>
public sealed class HistoryTests : IAsyncLifetime
{
    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), "gearbit-tests", Guid.NewGuid().ToString("N"));
    private readonly Clock _clock = new(new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.Zero));
    private readonly HttpClient _http = new();
    private WebApplication? _app;
    private int _port;

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        _http.Dispose();
        if (_app is not null)
        {
            await _app.StopAsync();
            await _app.DisposeAsync();
        }

        if (Directory.Exists(_dataDir))
        {
            Directory.Delete(_dataDir, recursive: true);
        }
    }

    private HistoryStore Store() => new(new HubOptions { DataDirectory = _dataDir }, _clock);

    private string Folder(string kind) => Path.Combine(_dataDir, "History", kind);

    [Fact]
    public void Same_program_is_not_saved_twice_in_a_row()
    {
        var store = Store();

        var (first, saved) = store.Add("python", "run", "Моя программа", "print(1)\n");
        Assert.True(saved);
        _clock.Now += TimeSpan.FromMinutes(1);
        var (again, savedAgain) = store.Add("python", "auto", "Моя программа", "print(1)\n");
        Assert.False(savedAgain);
        Assert.Equal(first.Id, again.Id);

        _clock.Now += TimeSpan.FromMinutes(1);
        var (second, _) = store.Add("python", "new", null, "print(2)\n");

        var list = store.List("python");
        Assert.Equal([second.Id, first.Id], list.Select(e => e.Id));
        Assert.Equal("20261107-100000-000", first.Id);
        Assert.Equal("Моя программа", list[1].Name);
        Assert.Equal("run", list[1].Reason);
        Assert.Equal("print(1)\n", store.Get("python", first.Id)!.Content);
        Assert.Empty(store.List("csharp"));
    }

    [Fact]
    public void Snapshots_in_the_same_millisecond_get_different_names()
    {
        var store = Store();

        var a = store.Add("csharp", "auto", null, "a").Entry;
        var b = store.Add("csharp", "auto", null, "b").Entry;

        Assert.NotEqual(a.Id, b.Id);
        Assert.Equal(2, Directory.GetFiles(Folder("csharp")).Length);
        Assert.Equal("b", store.Get("csharp", store.List("csharp")[0].Id)!.Content);
    }

    [Fact]
    public void Old_snapshots_are_removed_but_the_last_twenty_stay()
    {
        var store = Store();
        for (var i = 0; i < 25; i++)
        {
            store.Add("blocks", "auto", null, $"v{i}");
            _clock.Now += TimeSpan.FromMinutes(1);
        }

        _clock.Now += TimeSpan.FromDays(40);
        store.Add("blocks", "start", null, "fresh");

        var list = store.List("blocks");
        Assert.Equal(HistoryStore.KeepAlways, list.Count);
        Assert.Equal("fresh", store.Get("blocks", list[0].Id)!.Content);
        Assert.Equal("v24", store.Get("blocks", list[1].Id)!.Content);
        Assert.Equal(HistoryStore.KeepAlways, Directory.GetFiles(Folder("blocks")).Length);
    }

    [Fact]
    public void No_more_than_two_hundred_snapshots()
    {
        var store = Store();
        for (var i = 0; i < HistoryStore.MaxCount + 5; i++)
        {
            store.Add("python", "auto", null, $"x = {i}");
            _clock.Now += TimeSpan.FromSeconds(1);
        }

        Assert.Equal(HistoryStore.MaxCount, store.List("python").Count);
        Assert.Equal(HistoryStore.MaxCount, Directory.GetFiles(Folder("python")).Length);

        // Новый хаб (перезапуск) видит те же снимки.
        Assert.Equal(store.List("python"), Store().List("python"));
    }

    [Fact]
    public void Only_known_kinds_ids_and_reasons()
    {
        var store = Store();

        Assert.Throws<ArgumentException>(() => store.Add("..", "auto", null, "x"));
        Assert.Throws<ArgumentException>(() => store.Add("python", "../evil", null, "x"));
        Assert.Null(store.Get("python", @"..\..\settings"));
        Assert.Null(store.Get("python", "20261107-100000-000"));
        Assert.False(Directory.Exists(Path.Combine(_dataDir, "History")));

        // Чужой и испорченный файлы в папке не мешают.
        Directory.CreateDirectory(Folder("python"));
        File.WriteAllText(Path.Combine(Folder("python"), "notes.json"), "{}");
        File.WriteAllText(Path.Combine(Folder("python"), "20261101-000000-000.json"), "{oops");
        store.Add("python", "run", null, "print(1)");
        Assert.Single(store.List("python"));
    }

    [Fact]
    public async Task Snapshots_over_http()
    {
        await StartHubAsync();
        var origin = $"http://localhost:{_port}";

        var created = await _http.SendAsync(Post("api/history/python", """{"reason":"run","name":"Тест","content":"print(1)\n"}""", origin: origin));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var entry = (await created.Content.ReadFromJsonAsync<JsonObject>())!["entry"]!;
        var id = (string)entry["id"]!;

        var duplicate = await _http.SendAsync(Post("api/history/python", """{"reason":"auto","content":"print(1)\n"}"""));
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.False((bool)(await duplicate.Content.ReadFromJsonAsync<JsonObject>())!["saved"]!);

        var list = (await _http.GetFromJsonAsync<JsonArray>("api/history/python"))!;
        Assert.Equal(id, (string?)list.Single()!["id"]);
        Assert.Equal("Тест", (string?)list[0]!["name"]);
        Assert.Null(list[0]!["content"]);

        var snapshot = await _http.GetFromJsonAsync<JsonObject>($"api/history/python/{id}");
        Assert.Equal("print(1)\n", (string?)snapshot!["content"]);
        Assert.True(File.Exists(Path.Combine(Folder("python"), id + ".json")));
    }

    [Fact]
    public async Task Bad_history_requests_are_refused()
    {
        await StartHubAsync();
        const string body = """{"reason":"run","content":"x"}""";

        Assert.Equal(HttpStatusCode.Forbidden, (await _http.SendAsync(Post("api/history/python", body, origin: "https://evil.example"))).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await _http.SendAsync(Post("api/history/python", body, "text/plain"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _http.SendAsync(Post("api/history/music", body))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.SendAsync(Post("api/history/python", """{"reason":"run"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.SendAsync(Post("api/history/python", """{"reason":"Run!","content":"x"}"""))).StatusCode);
        var huge = new JsonObject { ["reason"] = "auto", ["content"] = new string('x', HistoryStore.MaxBytes + 1) }.ToJsonString();
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await _http.SendAsync(Post("api/history/python", huge))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("api/history/music")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("api/history/python/..%2Fsettings")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("api/history/python/20261107-100000-000")).StatusCode);
        Assert.False(Directory.Exists(Folder("python")));
    }

    private async Task StartHubAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build([$"--Hub:Port={_port}", $"--Hub:DataDirectory={_dataDir}", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
        _http.BaseAddress = new Uri($"http://localhost:{_port}/");
    }

    private static HttpRequestMessage Post(string path, string body, string contentType = "application/json", string? origin = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new StringContent(body, Encoding.UTF8, contentType) };
        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        return request;
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }
}
