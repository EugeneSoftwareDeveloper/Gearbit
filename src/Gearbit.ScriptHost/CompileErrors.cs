using System.Globalization;
using System.Reflection;
using System.Text.RegularExpressions;
using Gearbit.Client;
using Microsoft.CodeAnalysis;

namespace Gearbit.ScriptHost;

/// <summary>Ошибки компиляции по-русски: «В конце команды нужна точка с запятой» вместо CS1002.</summary>
internal static partial class CompileErrors
{
    private static readonly CultureInfo Russian = CultureInfo.GetCultureInfo("ru-RU");

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

    /// <summary>Сообщение C# как есть (по-русски, если есть перевод Roslyn): строкой ниже объяснения, для взрослых.</summary>
    public static string Original(Diagnostic diagnostic) => $"{diagnostic.Id}: {diagnostic.GetMessage(Russian)}";

    public static string Explain(Diagnostic diagnostic)
    {
        ArgumentNullException.ThrowIfNull(diagnostic);
        var text = diagnostic.GetMessage(CultureInfo.InvariantCulture);
        var quoted = Quoted().Matches(text).Select(m => m.Groups[1].Value).ToList();
        string Arg(int index) => index < quoted.Count ? quoted[index] : "";

        switch (diagnostic.Id)
        {
            case "CS1002":
                return "В конце команды нужна точка с запятой «;».";
            case "CS1513":
                return "Не хватает закрывающей фигурной скобки «}». У каждой «{» должна быть своя «}».";
            case "CS1514":
                return "Не хватает открывающей фигурной скобки «{».";
            case "CS1026":
                return "Не хватает закрывающей скобки «)».";
            case "CS1003":
                return $"Здесь не хватает «{Arg(0)}».";
            case "CS1525":
                return $"Здесь не может стоять «{Arg(0)}». Проверьте скобки и знаки.";
            case "CS1001":
                return "Здесь нужно имя: переменной, команды или типа.";
            case "CS1010":
            case "CS1039":
                return "Текст не закрыт: не хватает кавычки \" в конце.";
            case "CS1011":
            case "CS1012":
                return "Текст пишется в двойных кавычках: \"привет\". В одинарных — только одна буква: 'а'.";
            case "CS1022":
                return "Лишняя закрывающая скобка «}» или команда после конца программы.";
            case "CS1056":
                return $"Странный символ «{Arg(0)}». Возможно, это русская буква или «умная» кавычка вместо обычной.";
            case "CS0103":
                return UnknownName(Arg(0));
            case "CS1061":
            case "CS0117":
                return UnknownMember(Arg(0), Arg(1));
            case "CS1501":
                return $"У команды {Arg(0)} не бывает столько значений в скобках. Наведите мышь на команду или посмотрите карточку «Команды».";
            case "CS7036":
                return $"Команде не хватает значения в скобках: нужно ещё «{Arg(0)}».";
            case "CS1503":
                return ArgumentMismatch(text, Arg(0), Arg(1));
            case "CS0029":
            case "CS0266":
                return Conversion(diagnostic.Id, Arg(0), Arg(1));
            case "CS0165":
                return $"Переменной «{Arg(0)}» ещё не дали значение. Например: {Arg(0)} = 0;";
            case "CS0128":
                return AlreadyDefined(Arg(0));
            case "CS0102":
                // В скрипте переменные верхнего уровня — поля класса Submission#0.
                return AlreadyDefined(Arg(1));
            case "CS0841":
                return $"Переменную «{Arg(0)}» используют раньше, чем создали. Перенесите строку с var {Arg(0)} = … выше.";
            case "CS0019":
                return $"Знак «{Arg(0)}» не работает с {TypeName(Arg(1))} и {TypeName(Arg(2))}.";
            case "CS0201":
                return "Эта строка ничего не делает. Может быть, у команды не хватает скобок: robot.Stop(); или написано == вместо =?";
            case "CS0428":
                return $"После команды {Arg(0)} нужны скобки: {Arg(0)}().";
            case "CS1955":
                return $"«{Arg(0)}» — не команда: скобки после него не нужны.";
            case "CS0246":
                return $"C# не знает тип «{Arg(0)}». Для переменных подойдёт var: var x = 5;";
            case "CS0131":
                return "Слева от = должна быть переменная. Чтобы сравнить, пишите ==.";
            case "CS0139":
                return "break и continue работают только внутри цикла.";
            case "CS0815":
            case "CS0818":
                return "C# не понял, что будет в переменной. Дайте ей значение сразу: var x = 0;";
            case "CS0122":
                return $"«{Arg(0)}» — внутренняя часть, её нельзя использовать в программе.";
            default:
                return "C# не понял эту строку. Проверьте скобки, кавычки, точки с запятой и знаки.";
        }
    }

    private static string UnknownName(string name)
    {
        if (string.Equals(name, "wait", StringComparison.OrdinalIgnoreCase))
        {
            return "Пишите Wait с большой буквы: Wait(1);";
        }

        if (string.Equals(name, "print", StringComparison.OrdinalIgnoreCase))
        {
            return "В C# печатают так: Console.WriteLine(\"Привет!\");";
        }

        if (name is "True" or "False" or "TRUE" or "FALSE")
        {
            return $"В C# пишут {name.ToLowerInvariant()} с маленькой буквы.";
        }

        if (string.Equals(name, "robot", StringComparison.OrdinalIgnoreCase))
        {
            return "Робот называется robot — с маленькой буквы: robot.Forward(50);";
        }

        if (Similar(name, RobotMembers) is { } command)
        {
            return $"«{name}» — это команда робота. Пишите так: robot.{command}(…);";
        }

        return $"C# не знает «{name}». Проверьте, как написано: большие и маленькие буквы различаются. Новую переменную сначала создают: var {name} = 0;";
    }

    private static string UnknownMember(string type, string name)
    {
        switch (type)
        {
            case "Robot":
            case "Gearbit.Client.Robot":
                var guess = Similar(name, RobotMembers);
                var hint = guess is null ? "" : $" Может быть, robot.{guess}?";
                return $"У робота нет команды «{name}».{hint} Все команды — в карточке «Команды» справа от программы.";
            case "Console":
            case "System.Console":
                return Similar(name, ConsoleMembers) is { } console
                    ? $"У Console нет «{name}». Может быть, Console.{console}?"
                    : $"У Console нет «{name}». Чтобы напечатать строчку: Console.WriteLine(\"Привет!\");";
            case "Math":
            case "System.Math":
                return Similar(name, MathMembers) is { } math
                    ? $"У Math нет «{name}». Может быть, Math.{math}?"
                    : $"У Math нет «{name}».";
            default:
                return $"У {TypeName(type)} нет «{name}». Проверьте, как написано: большие и маленькие буквы различаются.";
        }
    }

    private static string AlreadyDefined(string name) =>
        $"Переменная «{name}» уже есть. Чтобы поменять её значение, пишите без var: {name} = …;";

    private static string ArgumentMismatch(string text, string from, string to)
    {
        var number = ArgumentNumber().Match(text) is { Success: true } m ? m.Groups[1].Value : null;
        var which = number is null ? "Значение" : $"Значение номер {number}";
        return $"{which} в скобках не подходит: нужно {TypeName(to)}, а здесь {TypeName(from)}.";
    }

    private static string Conversion(string id, string from, string to)
    {
        if (to == "bool")
        {
            return "Здесь нужно условие, которое бывает true или false. Чтобы сравнить, пишите ==, а не =.";
        }

        if (id == "CS0266" && to == "int" && from is "double" or "float" or "decimal")
        {
            return "Дробное число не помещается в int. Объявите переменную как double или округлите: (int)Math.Round(x).";
        }

        return $"Нельзя положить {TypeName(from)} туда, где нужно {TypeName(to)}.";
    }

    /// <summary>Тип словами: «число», «текст в кавычках».</summary>
    private static string TypeName(string type) => type switch
    {
        "int" or "double" or "float" or "decimal" or "long" or "short" or "byte" or "uint" or "ulong" or "int?" or "double?" => "число",
        "string" => "текст в кавычках",
        "bool" => "true или false",
        "char" => "одна буква в одинарных кавычках",
        "void" => "ничего (эта команда ничего не возвращает)",
        "method group" => "команда без скобок",
        "<null>" => "null",
        "(int X, int Y)" => "пара чисел",
        "" => "это",
        _ => $"«{type}»",
    };

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
