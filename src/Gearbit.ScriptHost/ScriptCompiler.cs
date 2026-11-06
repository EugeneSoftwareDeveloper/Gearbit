using System.Collections.Immutable;
using System.Text;
using Gearbit.Client;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using Microsoft.CodeAnalysis.Text;

namespace Gearbit.ScriptHost;

/// <summary>Где в программе ошибка (строка и столбец с 1) и что сказать ребёнку.</summary>
/// <param name="Original">Исходное сообщение C# — для взрослых, строкой ниже.</param>
internal sealed record ScriptError(int? Line, int? Column, string Message, string? Original);

/// <summary>
/// Программа вкладки «C#» — скрипт C# (Roslyn Scripting): команды пишутся сразу, без class и Main.
/// Подключены привычные пространства имён и <c>using static Gearbit.Client.RobotScript</c>:
/// отсюда <c>robot</c> и <c>Wait</c>.
/// </summary>
internal static class ScriptCompiler
{
    /// <summary>Версия языка. Хаб показывает её в строке «Готово к запуску · C# 14».</summary>
    public const LanguageVersion Version = LanguageVersion.CSharp14;

    public static readonly ImmutableArray<string> Imports =
    [
        "System",
        "System.Collections.Generic",
        "System.Linq",
        "System.Text",
        "System.Threading",
        "System.Threading.Tasks",
        "Gearbit.Client",
        "Gearbit.Client.RobotScript",
    ];

    public static ScriptOptions Options(string path) =>
        ScriptOptions.Default
            .WithFilePath(path)
            .WithFileEncoding(Encoding.UTF8)
            .WithEmitDebugInformation(true) // номера строк в ошибках во время работы
            .WithOptimizationLevel(OptimizationLevel.Debug)
            .WithLanguageVersion(Version)
            .AddReferences(typeof(Robot).Assembly, typeof(Enumerable).Assembly, typeof(Console).Assembly, typeof(List<>).Assembly)
            .AddReferences("System.Runtime", "System.Collections")
            .WithImports(Imports);

    /// <summary>Собрать программу. Если в ней ошибки — первая из них с понятным объяснением.</summary>
    public static (Script<object>? Script, ScriptError? Error, int ErrorCount) Compile(string code, string path)
    {
        var script = CSharpScript.Create(code, Options(path));
        var errors = script.Compile()
            .Where(d => d.Severity == DiagnosticSeverity.Error)
            .OrderBy(d => d.Location.SourceSpan.Start)
            .ToList();
        if (errors.Count == 0)
        {
            return (script, null, 0);
        }

        // Первая ошибка обычно настоящая, остальные — её следствия.
        var first = errors[0];
        var position = first.Location.IsInSource ? first.Location.GetLineSpan().StartLinePosition : (LinePosition?)null;
        return (null, new ScriptError(
            position?.Line + 1,
            position?.Character + 1,
            CompileErrors.Explain(first),
            CompileErrors.Original(first)), errors.Count);
    }
}
