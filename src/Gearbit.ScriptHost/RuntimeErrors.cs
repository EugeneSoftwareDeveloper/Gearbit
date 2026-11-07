using System.Diagnostics;
using Gearbit.Client;

namespace Gearbit.ScriptHost;

/// <summary>Ошибки во время работы программы понятными словами и строка программы, где они случились.</summary>
internal static class RuntimeErrors
{
    public static ScriptError Explain(Exception exception, string path, IScriptText? text = null)
    {
        ArgumentNullException.ThrowIfNull(exception);
        var (line, column) = Locate(exception, path);
        var message = Message(exception, text ?? ScriptText.Current);
        var original = $"{exception.GetType().Name}: {exception.Message}";
        return new ScriptError(line, column, message, exception is GearbitException || message == exception.Message ? null : original);
    }

    private static string Message(Exception exception, IScriptText t) => exception switch
    {
        GearbitException e => e.Message,
        DivideByZeroException => t.DivideByZero,
        IndexOutOfRangeException or ArgumentOutOfRangeException => t.IndexOutOfRange,
        NullReferenceException => t.NullReference,
        FormatException => t.BadNumberText,
        OverflowException => t.Overflow,
        InvalidCastException => t.InvalidCast,
        KeyNotFoundException => t.KeyNotFound,
        InvalidOperationException e when e.Message.Contains("no elements", StringComparison.Ordinal) => t.EmptyList,
        _ => t.OtherError(exception.Message),
    };

    /// <summary>Самое глубокое место в файле программы: там ребёнок и ошибся (а не внутри Gearbit или .NET).</summary>
    private static (int? Line, int? Column) Locate(Exception exception, string path)
    {
        var full = Path.GetFullPath(path);
        foreach (var frame in new StackTrace(exception, fNeedFileInfo: true).GetFrames())
        {
            var file = frame.GetFileName();
            if (file is null || frame.GetFileLineNumber() <= 0)
            {
                continue;
            }

            if (string.Equals(Path.GetFullPath(file), full, StringComparison.OrdinalIgnoreCase))
            {
                var column = frame.GetFileColumnNumber();
                return (frame.GetFileLineNumber(), column > 0 ? column : null);
            }
        }

        return (null, null);
    }
}
