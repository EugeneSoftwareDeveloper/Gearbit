using System.Text.Json.Nodes;

namespace Gearbit.Client;

/// <summary>
/// Строки «@@gearbit:{json}» для интерфейса Gearbit: хаб вырезает их из вывода программы
/// и превращает в события (облачко над роботом, строка с ошибкой). См. docs/dev/hub-api.md.
/// </summary>
internal static class Markers
{
    public const string Prefix = "@@gearbit:";

    public static void Emit(JsonObject message, bool error = false)
    {
        var line = Prefix + message.ToJsonString(Json.Options);
        var writer = error ? Console.Error : Console.Out;
        writer.WriteLine(line);
        writer.Flush();
    }
}

internal static class Json
{
    /// <summary>Кириллица — как есть, без \uXXXX: строки читаются в журнале.</summary>
    public static readonly System.Text.Json.JsonSerializerOptions Options = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
