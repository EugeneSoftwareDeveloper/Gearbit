using System.Text;
using System.Text.Json.Nodes;
using Gearbit.Client;

namespace Gearbit.ScriptHost;

/// <summary>
/// Запуск программы на C#: <c>Gearbit.ScriptHost программа.csx</c>.
/// Gearbit (хаб) запускает его в отдельном процессе и читает строки «@@gearbit:{…}»:
/// облачко над роботом и место ошибки. Коды выхода: 0 — закончилась, 1 — ошибка, 2 — остановлена (СТОП).
/// Работает и без Gearbit-окна, если хаб запущен: тогда это просто консольный запуск скрипта.
/// </summary>
internal static class Program
{
    public const int Finished = 0;
    public const int Failed = 1;
    public const int Stopped = 2;

    public static int Main(string[] args)
    {
        // Без консоли (вывод в канал) .NET пишет в кодировке OEM: хабу нужен UTF-8.
        var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), utf8) { AutoFlush = true });
        Console.SetError(new StreamWriter(Console.OpenStandardError(), utf8) { AutoFlush = true });

        if (args.Length < 1 || !File.Exists(args[0]))
        {
            Console.Error.WriteLine("Использование: Gearbit.ScriptHost программа.csx");
            return 64;
        }

        var path = Path.GetFullPath(args[0]);
        var code = File.ReadAllText(path, Encoding.UTF8);
        var lines = code.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        Directory.SetCurrentDirectory(Path.GetDirectoryName(path)!);

        var (script, compileError, errorCount) = ScriptCompiler.Compile(code, path);
        if (compileError is not null)
        {
            if (errorCount > 1)
            {
                compileError = compileError with { Original = $"{compileError.Original} (всего ошибок: {errorCount})" };
            }

            return Fail(compileError, lines);
        }

        try
        {
            script!.RunAsync().GetAwaiter().GetResult();
            return Finished;
        }
        catch (ProgramStoppedException e)
        {
            Console.Error.WriteLine($"Программа остановлена: {e.Message}");
            Report(new JsonObject { ["type"] = "stopped", ["message"] = e.Message });
            return Stopped;
        }
#pragma warning disable CA1031 // Любая ошибка программы ребёнка превращается в понятное сообщение.
        catch (Exception e)
#pragma warning restore CA1031
        {
            return Fail(RuntimeErrors.Explain(e, path), lines);
        }
        finally
        {
            RobotScript.Finish();
        }
    }

    private static int Fail(ScriptError error, string[] lines)
    {
        var where = error.Line is { } line ? $"Ошибка в строке {line}" : "Ошибка";
        Console.Error.WriteLine($"{where}: {error.Message}");
        if (error.Line is { } number && number > 0 && number <= lines.Length)
        {
            Console.Error.WriteLine($"    {lines[number - 1].Trim()}");
        }

        if (error.Original is { } original)
        {
            Console.Error.WriteLine($"(C#: {original})");
        }

        Report(new JsonObject { ["type"] = "error", ["line"] = error.Line, ["column"] = error.Column, ["message"] = error.Message });
        return Failed;
    }

    private static void Report(JsonObject message)
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GEARBIT_RUN_ID")))
        {
            Markers.Emit(message, error: true);
        }
    }
}
