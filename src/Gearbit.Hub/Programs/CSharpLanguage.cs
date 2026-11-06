namespace Gearbit.Hub.Programs;

/// <summary>
/// C#: программа — скрипт C# (команды без class и Main). Её собирает и запускает
/// Gearbit.ScriptHost.exe (Roslyn Scripting) в отдельном процессе; он лежит рядом с хабом.
/// </summary>
public sealed class CSharpLanguage(HubOptions options) : IProgramLanguage
{
    public const string HostFileName = "Gearbit.ScriptHost.exe";

    /// <summary>Версия языка, которую собирает ScriptHost (<c>ScriptCompiler.Version</c>).</summary>
    public const string LanguageVersion = "14";

    public string Id => "csharp";

    public string Title => "C#";

    public string FileName => "program.csx";

    /// <summary>Gearbit.ScriptHost со своими зависимостями (Roslyn) лежит в папке csharp рядом с хабом (CopyToHost.targets).</summary>
    public string HostPath => options.CSharpHostPath ?? Path.Combine(AppContext.BaseDirectory, "csharp", HostFileName);

    public Task<LanguageStatus> CheckAsync(CancellationToken cancellationToken) =>
        Task.FromResult(File.Exists(HostPath)
            ? new LanguageStatus(true, LanguageVersion, null)
            : new LanguageStatus(false, null, NotFound));

    public Task<ProgramCommand> PrepareAsync(string programPath, CancellationToken cancellationToken)
    {
        if (!File.Exists(HostPath))
        {
            throw new HubException(HubErrors.NotSupported, NotFound);
        }

        var environment = new Dictionary<string, string>
        {
            // Без лишних сообщений .NET о первом запуске и телеметрии.
            ["DOTNET_NOLOGO"] = "1",
            ["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1",
        };
        return Task.FromResult(new ProgramCommand(HostPath, [programPath], environment));
    }

    private string NotFound => $"Не найден запускатель программ на C# ({HostFileName}). Переустановите Gearbit.";
}
