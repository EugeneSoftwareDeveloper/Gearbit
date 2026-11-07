using System.Globalization;
using System.Reflection;
using System.Text.RegularExpressions;
using Gearbit.Client;
using Microsoft.CodeAnalysis;

namespace Gearbit.ScriptHost;

/// <summary>Ошибки компиляции понятными словами: «В конце команды нужна точка с запятой» вместо CS1002. Тексты — в <see cref="IScriptText"/>.</summary>
internal static partial class CompileErrors
{
    /// <summary>Команды и свойства робота — для подсказки «Может быть, robot.Forward?».</summary>
    public static readonly IReadOnlyList<string> RobotMembers =
    [
        .. typeof(Robot).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName && m.Name != nameof(Robot.Dispose))
            .Select(m => m.Name)
            .Concat(typeof(Robot).GetProperties(BindingFlags.Public | BindingFlags.Instance).Select(p => p.Name))
            .Distinct()
            .Order(StringComparer.Ordinal),
    ];

    private static readonly IReadOnlyList<string> ConsoleMembers =
        [.. typeof(Console).GetMembers(BindingFlags.Public | BindingFlags.Static).Select(m => m.Name).Where(n => !n.StartsWith("get_", StringComparison.Ordinal) && !n.StartsWith("set_", StringComparison.Ordinal) && !n.StartsWith("add_", StringComparison.Ordinal) && !n.StartsWith("remove_", StringComparison.Ordinal)).Distinct()];

    private static readonly IReadOnlyList<string> MathMembers =
        [.. typeof(Math).GetMembers(BindingFlags.Public | BindingFlags.Static).Select(m => m.Name).Distinct()];

    /// <summary>Сообщение C# как есть, на языке программы (русский — из перевода Roslyn): строкой ниже объяснения, для взрослых.</summary>
    public static string Original(Diagnostic diagnostic, IScriptText? text = null)
    {
        ArgumentNullException.ThrowIfNull(diagnostic);
        return $"{diagnostic.Id}: {diagnostic.GetMessage((text ?? ScriptText.Current).RoslynCulture)}";
    }

    public static string Explain(Diagnostic diagnostic, IScriptText? text = null)
    {
        ArgumentNullException.ThrowIfNull(diagnostic);
        var t = text ?? ScriptText.Current;

        // Имена из сообщения берутся в нейтральной культуре: там они всегда в 'кавычках'.
        var message = diagnostic.GetMessage(CultureInfo.InvariantCulture);
        var quoted = Quoted().Matches(message).Select(m => m.Groups[1].Value).ToList();
        string Arg(int index) => index < quoted.Count ? quoted[index] : "";

        return diagnostic.Id switch
        {
            "CS1002" => t.Semicolon,
            "CS1513" => t.CloseBrace,
            "CS1514" => t.OpenBrace,
            "CS1026" => t.CloseParen,
            "CS1003" => t.Missing(Arg(0)),
            "CS1525" => t.CannotStand(Arg(0)),
            "CS1001" => t.NeedName,
            "CS1010" or "CS1039" => t.TextNotClosed,
            "CS1011" or "CS1012" => t.TextQuotes,
            "CS1022" => t.ExtraBrace,
            "CS1056" => t.StrangeChar(Arg(0)),
            "CS0103" => UnknownName(t, Arg(0)),
            "CS1061" or "CS0117" => UnknownMember(t, Arg(0), Arg(1)),
            "CS1501" => t.WrongArgCount(Arg(0)),
            "CS7036" => t.MissingArg(Arg(0)),
            "CS1503" => ArgumentMismatch(t, message, Arg(0), Arg(1)),
            "CS0029" or "CS0266" => Conversion(t, diagnostic.Id, Arg(0), Arg(1)),
            "CS0165" => t.Unassigned(Arg(0)),
            "CS0128" => t.AlreadyDefined(Arg(0)),

            // В скрипте переменные верхнего уровня — поля класса Submission#0.
            "CS0102" => t.AlreadyDefined(Arg(1)),
            "CS0841" => t.UsedBeforeDeclared(Arg(0)),
            "CS0019" => t.Operator(Arg(0), t.TypeName(Arg(1)), t.TypeName(Arg(2))),
            "CS0201" => t.NoEffect,
            "CS0428" => t.NeedParens(Arg(0)),
            "CS1955" => t.NotCommand(Arg(0)),
            "CS0246" => t.UnknownType(Arg(0)),
            "CS0131" => t.AssignLeft,
            "CS0139" => t.BreakOutsideLoop,
            "CS0815" or "CS0818" => t.CannotInfer,
            "CS0122" => t.Inaccessible(Arg(0)),
            _ => t.NotUnderstood,
        };
    }

    private static string UnknownName(IScriptText t, string name)
    {
        if (string.Equals(name, "wait", StringComparison.OrdinalIgnoreCase))
        {
            return t.WaitCapital;
        }

        if (string.Equals(name, "print", StringComparison.OrdinalIgnoreCase))
        {
            return t.PrintHint;
        }

        if (name is "True" or "False" or "TRUE" or "FALSE")
        {
            return t.LowercaseBool(name.ToLowerInvariant());
        }

        if (string.Equals(name, "robot", StringComparison.OrdinalIgnoreCase))
        {
            return t.RobotLowercase;
        }

        if (Similar(name, RobotMembers) is { } command)
        {
            return t.IsRobotCommand(name, command);
        }

        return t.UnknownName(name);
    }

    private static string UnknownMember(IScriptText t, string type, string name) => type switch
    {
        "Robot" or "Gearbit.Client.Robot" => t.RobotNoCommand(name, Similar(name, RobotMembers)),
        "Console" or "System.Console" => t.ConsoleNo(name, Similar(name, ConsoleMembers)),
        "Math" or "System.Math" => t.MathNo(name, Similar(name, MathMembers)),
        _ => t.TypeNo(t.TypeName(type), name),
    };

    private static string ArgumentMismatch(IScriptText t, string message, string from, string to)
    {
        var number = ArgumentNumber().Match(message) is { Success: true } m ? m.Groups[1].Value : null;
        return t.ArgumentMismatch(number, t.TypeName(to), t.TypeName(from));
    }

    private static string Conversion(IScriptText t, string id, string from, string to)
    {
        if (to == "bool")
        {
            return t.NeedCondition;
        }

        if (id == "CS0266" && to == "int" && from is "double" or "float" or "decimal")
        {
            return t.FractionToInt;
        }

        return t.CannotPut(t.TypeName(from), t.TypeName(to));
    }

    /// <summary>Похожее имя: те же буквы без «_» и регистра (turn_left → TurnLeft) или одна-две опечатки.</summary>
    internal static string? Similar(string name, IEnumerable<string> candidates)
    {
        if (string.IsNullOrEmpty(name))
        {
            return null;
        }

        static string Normal(string s) => s.Replace("_", "", StringComparison.Ordinal).ToLowerInvariant();
        var key = Normal(name);
        var list = candidates.ToList();
        var exact = list.FirstOrDefault(c => Normal(c) == key);
        if (exact is not null)
        {
            return exact;
        }

        var limit = Math.Max(1, key.Length / 3);
        return list
            .Select(c => (Name: c, Distance: Distance(Normal(c), key)))
            .Where(c => c.Distance <= limit)
            .OrderBy(c => c.Distance)
            .Select(c => c.Name)
            .FirstOrDefault();
    }

    private static int Distance(string a, string b)
    {
        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }

            (previous, current) = (current, previous);
        }

        return previous[b.Length];
    }

    [GeneratedRegex("'([^']*)'")]
    private static partial Regex Quoted();

    [GeneratedRegex(@"^Argument (\d+):")]
    private static partial Regex ArgumentNumber();
}
