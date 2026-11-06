using BotStudio.Core.Descriptors;
using BotStudio.Core.Protocol;
using BotStudio.Core.Transport;
using BotStudio.Emulator;
using BotStudio.Hub.Rpc;
using BotStudio.Protocols.Tudao;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BotStudio.Hub;

/// <summary>
/// Сборка хаба: сервисы, WebSocket /ws, раздача веб-интерфейса.
/// Используется и консольным сервером, и WPF-приложением (хаб внутри процесса).
/// </summary>
public static class BotStudioHub
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

        services.AddSingleton<RobotManager>();
        services.AddSingleton<ControlArbiter>();
        services.AddSingleton<ClientRegistry>();
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
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("BotStudio.Hub.WebSocket");
        var allowedOrigins = new HashSet<string>(options.EffectiveOrigins, StringComparer.OrdinalIgnoreCase);

        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

        app.Map("/ws", async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("Это WebSocket JSON-RPC хаба BotStudio.").ConfigureAwait(false);
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

        app.MapGet("/api/info", (RobotManager robots) => Results.Json(new
        {
            hub = "BotStudio",
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
            app.MapGet("/", () => Results.Content(
                """
                <!doctype html><meta charset="utf-8"><title>BotStudio</title>
                <body style="font-family:system-ui;max-width:40rem;margin:3rem auto;line-height:1.5">
                <h1>BotStudio: хаб работает</h1>
                <p>Веб-интерфейс ещё не собран. Выполните в папке <code>web/studio-ui</code>:</p>
                <pre>npm install
                npm run build</pre>
                <p>и перезапустите сервер. Для разработки: <code>npm run dev</code> → http://localhost:5173</p>
                </body>
                """,
                "text/html; charset=utf-8"));
        }
    }
}
