using System.ComponentModel;
using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub.Programs;

/// <summary>
/// Python: программа запускается как <c>python -m gearbit._runner program.py</c>.
/// Пакет gearbit лежит рядом с хабом (папка python) и подключается через PYTHONPATH — pip не нужен.
/// </summary>
public sealed class PythonLanguage(HubOptions options, ILogger<PythonLanguage> logger) : IProgramLanguage
{
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(10);

    private readonly SemaphoreSlim _probeLock = new(1, 1);
    private Interpreter? _found;

    public string Id => "python";

    public string Title => "Python";

    public string FileName => "program.py";

    /// <summary>Папка, в которой лежит пакет gearbit.</summary>
    public string PackageDirectory => options.PythonPackageDirectory ?? Path.Combine(AppContext.BaseDirectory, "python");

    public async Task<LanguageStatus> CheckAsync(CancellationToken cancellationToken)
    {
        var python = await FindAsync(cancellationToken).ConfigureAwait(false);
        return python is null ? new LanguageStatus(false, null, t => t.PythonNotFound) : new LanguageStatus(true, python.Version, null);
    }

    public async Task<ProgramCommand> PrepareAsync(string programPath, CancellationToken cancellationToken)
    {
        var python = await FindAsync(cancellationToken).ConfigureAwait(false)
            ?? throw new HubException(HubErrors.NotSupported, t => t.PythonNotFound);

        var package = PackageDirectory;
        if (!File.Exists(Path.Combine(package, "gearbit", "__init__.py")))
        {
            throw new HubException(HubErrors.NotSupported, t => t.PythonPackageMissing(package));
        }

        var existing = Environment.GetEnvironmentVariable("PYTHONPATH");
        var environment = new Dictionary<string, string>
        {
            // Свой gearbit — первым: установленный через pip старый пакет не перекроет его.
            ["PYTHONPATH"] = string.IsNullOrEmpty(existing) ? package : package + Path.PathSeparator + existing,
            ["PYTHONIOENCODING"] = "utf-8",
            ["PYTHONUTF8"] = "1",
            ["PYTHONUNBUFFERED"] = "1",
            ["PYTHONDONTWRITEBYTECODE"] = "1",
        };
        return new ProgramCommand(python.FileName, [.. python.Prefix, "-X", "utf8", "-u", "-B", "-m", "gearbit._runner", programPath], environment);
    }

    private async Task<Interpreter?> FindAsync(CancellationToken cancellationToken)
    {
        if (_found is { } known && File.Exists(known.FileName))
        {
            return known;
        }

        await _probeLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_found is { } again && File.Exists(again.FileName))
            {
                return again;
            }

            foreach (var (file, prefix) in Candidates())
            {
                var version = await ProbeAsync(file, prefix, cancellationToken).ConfigureAwait(false);
                if (version is not null)
                {
                    logger.LogInformation("Python {Version}: {File} {Prefix}", version, file, string.Join(' ', prefix));
                    _found = new Interpreter(file, prefix, version);
                    return _found;
                }
            }

            // Не кэшируем «не найден»: Python могут установить, не закрывая Gearbit.
            return null;
        }
        finally
        {
            _probeLock.Release();
        }
    }

    /// <summary>Где искать: явный путь, портативный Python рядом с программой, py-лаунчер, python в PATH.</summary>
    private IEnumerable<(string File, string[] Prefix)> Candidates()
    {
        if (!string.IsNullOrWhiteSpace(options.PythonPath))
        {
            yield return (options.PythonPath, []);
        }

        yield return (Path.Combine(PackageDirectory, "runtime", "python.exe"), []);

        foreach (var py in FindOnPath("py.exe"))
        {
            yield return (py, ["-3"]);
        }

        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        if (!string.IsNullOrEmpty(windows))
        {
            yield return (Path.Combine(windows, "py.exe"), ["-3"]);
        }

        foreach (var name in new[] { "python.exe", "python3.exe" })
        {
            foreach (var python in FindOnPath(name))
            {
                yield return (python, []);
            }
        }
    }

    private static IEnumerable<string> FindOnPath(string fileName)
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            // Заглушка Microsoft Store («python.exe» в WindowsApps) открывает магазин вместо Python.
            if (dir.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string candidate;
            try
            {
                candidate = Path.Combine(dir, fileName);
            }
            catch (ArgumentException)
            {
                continue;
            }

            if (File.Exists(candidate))
            {
                yield return candidate;
            }
        }
    }

    /// <summary>Версия, если это Python 3.9 или новее; иначе null.</summary>
    private async Task<string?> ProbeAsync(string file, string[] prefix, CancellationToken cancellationToken)
    {
        if (!File.Exists(file))
        {
            return null;
        }

        var info = new ProcessStartInfo(file)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in prefix)
        {
            info.ArgumentList.Add(argument);
        }

        info.ArgumentList.Add("-c");
        info.ArgumentList.Add("import sys; print('%d.%d.%d' % sys.version_info[:3]); sys.exit(0 if sys.version_info >= (3, 9) else 3)");

        try
        {
            using var process = Process.Start(info);
            if (process is null)
            {
                return null;
            }

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ProbeTimeout);
            var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            try
            {
                await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                process.Kill(entireProcessTree: true);
                return null;
            }

            var version = (await output.ConfigureAwait(false)).Trim();
            if (process.ExitCode != 0)
            {
                logger.LogInformation("{File}: Python {Version} слишком старый или не работает (код {Code})", file, version, process.ExitCode);
                return null;
            }

            return version;
        }
        catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or IOException)
        {
            logger.LogDebug(ex, "Не удалось проверить {File}", file);
            return null;
        }
    }

    private sealed record Interpreter(string FileName, string[] Prefix, string Version);
}
