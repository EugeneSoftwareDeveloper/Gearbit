using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Gearbit.Hub;
using Microsoft.AspNetCore.Builder;

namespace Gearbit.Tests;

/// <summary>HTTP-часть хаба: настройки интерфейса в файле и проверки, кто может их записать.</summary>
public sealed class UserDataTests : IAsyncLifetime
{
    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), "gearbit-tests", Guid.NewGuid().ToString("N"));
    private readonly HttpClient _http = new();
    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build([$"--Hub:Port={_port}", $"--Hub:DataDirectory={_dataDir}", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
        _http.BaseAddress = new Uri($"http://localhost:{_port}/");
    }

    public async Task DisposeAsync()
    {
        _http.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
        if (Directory.Exists(_dataDir))
        {
            Directory.Delete(_dataDir, recursive: true);
        }
    }

    private HttpRequestMessage Put(string path, string body, string contentType = "application/json", string? origin = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = new StringContent(body, Encoding.UTF8, contentType) };
        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        return request;
    }

    [Fact]
    public async Task Settings_are_saved_to_a_file_and_read_back()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("api/settings")).StatusCode);

        var put = await _http.SendAsync(Put("api/settings", """{"lang":"en","theme":"dark"}""", origin: $"http://localhost:{_port}"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var saved = await _http.GetFromJsonAsync<JsonObject>("api/settings");
        Assert.Equal("en", (string?)saved!["lang"]);
        Assert.Equal("dark", (string?)saved["theme"]);
        Assert.True(File.Exists(Path.Combine(_dataDir, "settings.json")));
    }

    [Fact]
    public async Task Foreign_sites_cannot_write_settings()
    {
        var put = await _http.SendAsync(Put("api/settings", """{"lang":"en"}""", origin: "https://evil.example"));
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
        Assert.False(File.Exists(Path.Combine(_dataDir, "settings.json")));
    }

    [Fact]
    public async Task Only_json_objects_of_limited_size_are_accepted()
    {
        // Простую форму (text/plain) чужой сайт мог бы отправить без CORS-предзапроса.
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await _http.SendAsync(Put("api/settings", """{"lang":"en"}""", "text/plain"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.SendAsync(Put("api/settings", "[1,2]"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.SendAsync(Put("api/settings", "{oops"))).StatusCode);

        var huge = new JsonObject { ["text"] = new string('x', 70 * 1024) }.ToJsonString();
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await _http.SendAsync(Put("api/settings", huge))).StatusCode);
        Assert.False(File.Exists(Path.Combine(_dataDir, "settings.json")));
    }

    [Fact]
    public async Task Requests_for_other_host_names_are_refused()
    {
        // Защита от DNS rebinding: чужое имя, указывающее на 127.0.0.1, не пускаем.
        var request = new HttpRequestMessage(HttpMethod.Get, "api/settings");
        request.Headers.Host = $"evil.example:{_port}";
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.SendAsync(request)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await _http.GetAsync("api/info")).StatusCode);
    }
}
