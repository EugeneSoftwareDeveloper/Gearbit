using System.Net;
using Gearbit.Core.Descriptors;
using Gearbit.Core.Protocol;
using Gearbit.Core.Transport;
using Gearbit.Emulator;
using Gearbit.Hub.Programs;
using Gearbit.Hub.Rpc;
using Gearbit.Hub.UserData;
using Gearbit.Protocols.Tudao;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Gearbit.Hub;

/// <summary>
/// Сборка хаба: сервисы, WebSocket /ws, раздача веб-интерфейса.
/// Используется и консольным сервером, и WPF-приложением (хаб внутри процесса).
/// </summary>
public static class GearbitHub
{
    /// <param name="addTransports">Подключить транспорты конкретной платформы (WinRT BLE и т. п.).</param>
    public static WebApplication Build(string[] args, Action<IServiceCollection>? addTransports = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
        });

        var options = new HubOptions();
        builder.Configuration.GetSection("Hub").Bind(options);

        // Только localhost: хаб не виден в локальной сети.
        builder.WebHost.UseUrls($"http://localhost:{options.Port}");

        // Запросы только к localhost по имени: чужой сайт не доберётся до хаба, подменив адрес в DNS (DNS rebinding).
        if (string.IsNullOrEmpty(builder.Configuration["AllowedHosts"]))
        {
            builder.Configuration["AllowedHosts"] = "localhost;127.0.0.1;[::1]";
        }

        AddHub(builder.Services, options, builder.Configuration.GetValue("Hub:Emulator", true));
        addTransports?.Invoke(builder.Services);

        var app = builder.Build();
        MapHub(app, options);
        return app;
    }

    public static IServiceCollection AddHub(IServiceCollection services, HubOptions options, bool withEmulator = true)
    {
        ArgumentNullException.ThrowIfNull(options);

        var baseDir = AppContext.BaseDirectory;
        var catalog = RobotCatalog.Load(
            options.DevicesDirectory ?? Path.Combine(baseDir, "devices"),
            options.ProfilesDirectory ?? Path.Combine(baseDir, "profiles"));

        services.AddSingleton(options);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(catalog);
        services.AddSingleton<IRobotProtocolFactory, TudaoProtocolFactory>();

        if (withEmulator)
        {
            services.AddSingleton(_ => new EmulatorHost());
            services.AddSingleton<IDeviceScanner>(sp => sp.GetRequiredService<EmulatorHost>());
            services.AddSingleton<ITransportFactory>(sp => sp.GetRequiredService<EmulatorHost>());
        }

        services.AddSingleton<SettingsStore>();
        services.AddSingleton<HistoryStore>();
        services.AddSingleton<RobotManager>();
        services.AddSingleton<ControlArbiter>();
        services.AddSingleton<ServiceMode>();
        services.AddSingleton<ClientRegistry>();
        services.AddSingleton<IProgramLauncher, ProcessLauncher>();
        services.AddSingleton<IProgramLanguage, PythonLanguage>();
        services.AddSingleton<IProgramLanguage, CSharpLanguage>();
        services.AddSingleton<ProgramRunner>();
        services.AddHostedService(sp => sp.GetRequiredService<ProgramRunner>());
        services.AddSingleton<RpcDispatcher>();
        services.AddSingleton<HubMethods>();
        services.AddHostedService<Notifier>();
        services.AddHostedService<SafetyWatchdog>();
        return services;
    }

    public static void MapHub(WebApplication app, HubOptions options)
    {
        ArgumentNullException.ThrowIfNull(app);
        ArgumentNullException.ThrowIfNull(options);

        var dispatcher = app.Services.GetRequiredService<RpcDispatcher>();
        app.Services.GetRequiredService<HubMethods>().Register(dispatcher);

        var registry = app.Services.GetRequiredService<ClientRegistry>();
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Gearbit.Hub.WebSocket");
        var allowedOrigins = new HashSet<string>(options.EffectiveOrigins, StringComparer.OrdinalIgnoreCase);

        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

        app.Map("/ws", async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("Это WebSocket JSON-RPC хаба Gearbit.").ConfigureAwait(false);
                return;
            }

            var origin = context.Request.Headers.Origin.ToString();
            if (!string.IsNullOrEmpty(origin) && !allowedOrigins.Contains(origin))
            {
                logger.LogWarning("Отклонено подключение с источника {Origin}", origin);
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
            var client = new HubClient(socket, logger);
            registry.Add(client);
            try
            {
                await client.RunAsync(dispatcher, context.RequestAborted).ConfigureAwait(false);
            }
            finally
            {
                registry.Remove(client);
            }
        });

        HttpApi.Map(app, allowedOrigins);

        app.MapGet("/api/info", (RobotManager robots) => Results.Json(new
        {
            hub = "Gearbit",
            version = HubMethods.Version,
            websocket = $"ws://localhost:{options.Port}/ws",
            robot = robots.Active?.Name,
            clients = registry.Count,
        }));

        var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (File.Exists(Path.Combine(webRoot, "index.html")))
        {
            var files = new PhysicalFileProvider(webRoot);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
            app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
        }
        else
        {
            app.MapGet("/", (HttpContext context, SettingsStore settings) => Results.Content(
                NoWebUiPage(NoWebUiText(settings.Read()?["lang"]?.GetValue<string>(), context.Request.GetTypedHeaders().AcceptLanguage)),
                "text/html; charset=utf-8"));
        }
    }

    /// <summary>Язык заглушки: выбранный в настройках, иначе по <c>Accept-Language</c> окна или браузера.</summary>
    internal static IHubText NoWebUiText(string? settingsLang, IList<StringWithQualityHeaderValue> acceptLanguage) =>
        HubText.Find(settingsLang)
        ?? HubText.ForSystem(acceptLanguage.OrderByDescending(l => l.Quality ?? 1).Select(l => l.Value.Value));

    /// <summary>
    /// Страница вместо интерфейса, если его не собрали (свежий клон: wwwroot в .gitignore).
    /// Цвета — системные (Canvas, CanvasText): текст читается и в светлом, и в тёмном окне.
    /// </summary>
    internal static string NoWebUiPage(IHubText t)
    {
        static string E(string s) => WebUtility.HtmlEncode(s);
        return $$"""
            <!doctype html>
            <html lang="{{t.Language}}">
            <meta charset="utf-8">
            <meta name="color-scheme" content="light dark">
            <title>Gearbit</title>
            <style>
              :root { color-scheme: light dark; }
              body { margin: 0; background: Canvas; color: CanvasText; font: 16px/1.5 system-ui, sans-serif; }
              main { max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
              pre, code { font-family: ui-monospace, Consolas, monospace; }
              pre { padding: .75rem 1rem; border-radius: 8px; background: color-mix(in srgb, CanvasText 8%, Canvas); }
            </style>
            <main>
              <h1>{{E(t.NoWebUiTitle)}}</h1>
              <p>{{E(t.NoWebUiText)}}</p>
              <pre>cd web/studio-ui
            npm install
            npm run build</pre>
              <p>{{E(t.NoWebUiRestart)}}</p>
            </main>
            """;
    }
}
