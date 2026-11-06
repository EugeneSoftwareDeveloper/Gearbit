using System.Diagnostics;
using Gearbit.Client;

namespace Gearbit.ScriptHost;

/// <summary>Ошибки во время работы программы по-русски и строка программы, где они случились.</summary>
internal static class RuntimeErrors
{
    public static ScriptError Explain(Exception exception, string path)
    {
        ArgumentNullException.ThrowIfNull(exception);
        var (line, column) = Locate(exception, path);
        var message = Message(exception);
        var original = $"{exception.GetType().Name}: {exception.Message}";
        return new ScriptError(line, column, message, exception is GearbitException || message == exception.Message ? null : original);
    }

    private static string Message(Exception exception) => exception switch
    {
        GearbitException e => e.Message,
        DivideByZeroException => "Делить на ноль нельзя.",
        IndexOutOfRangeException or ArgumentOutOfRangeException =>
            "Такого номера в списке нет. Номера начинаются с 0, а последний на один меньше, чем элементов в списке.",
        NullReferenceException => "Здесь пустое значение (null): переменной ещё ничего не дали.",
        FormatException => "Не получилось превратить текст в число. Проверьте, что в тексте только цифры.",
        OverflowException => "Число получилось слишком большим.",
        InvalidCastException => "Значение не того типа.",
        KeyNotFoundException => "Такого ключа в словаре нет.",
        InvalidOperationException e when e.Message.Contains("no elements", StringComparison.Ordinal) => "Список пустой.",
        _ => $"Ошибка: {exception.Message}",
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
