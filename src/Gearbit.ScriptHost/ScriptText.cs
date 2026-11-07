using System.Globalization;
using Gearbit.Client;

namespace Gearbit.ScriptHost;

/// <summary>
/// Объяснения ошибок программы на C# для ребёнка. Язык — как у клиента (<c>GEARBIT_LANG</c> или язык Windows).
/// Новый текст добавьте сюда и в оба класса ниже: без перевода проект не соберётся.
/// </summary>
internal interface IScriptText
{
    /// <summary>Культура, в которой показывается исходное сообщение Roslyn строкой «(C#: …)».</summary>
    CultureInfo RoslynCulture { get; }

    string Usage { get; }

    string Error { get; }

    string ErrorInLine(int line);

    string TotalErrors(string original, int count);

    string ProgramStopped(string reason);

    // ---------- Ошибки компиляции (коды Roslyn) ----------

    string Semicolon { get; }

    string CloseBrace { get; }

    string OpenBrace { get; }

    string CloseParen { get; }

    string NeedName { get; }

    string TextNotClosed { get; }

    string TextQuotes { get; }

    string ExtraBrace { get; }

    string NoEffect { get; }

    string AssignLeft { get; }

    string BreakOutsideLoop { get; }

    string CannotInfer { get; }

    string NotUnderstood { get; }

    string WaitCapital { get; }

    string PrintHint { get; }

    string RobotLowercase { get; }

    string NeedCondition { get; }

    string FractionToInt { get; }

    string Missing(string token);

    string CannotStand(string token);

    string StrangeChar(string character);

    string WrongArgCount(string command);

    string MissingArg(string parameter);

    string Unassigned(string name);

    string UsedBeforeDeclared(string name);

    string Operator(string op, string left, string right);

    string NeedParens(string command);

    string NotCommand(string name);

    string UnknownType(string name);

    string Inaccessible(string name);

    string LowercaseBool(string lower);

    string IsRobotCommand(string name, string command);

    string UnknownName(string name);

    string RobotNoCommand(string name, string? guess);

    string ConsoleNo(string name, string? guess);

    string MathNo(string name, string? guess);

    string TypeNo(string type, string name);

    string AlreadyDefined(string name);

    string ArgumentMismatch(string? number, string to, string from);

    string CannotPut(string from, string to);

    /// <summary>Тип словами: «число», «текст в кавычках».</summary>
    string TypeName(string type);

    // ---------- Ошибки во время работы ----------

    string DivideByZero { get; }

    string IndexOutOfRange { get; }

    string NullReference { get; }

    string BadNumberText { get; }

    string Overflow { get; }

    string InvalidCast { get; }

    string KeyNotFound { get; }

    string EmptyList { get; }

    string OtherError(string message);
}

internal static class ScriptText
{
    public static readonly IScriptText Russian = new RuScriptText();
    public static readonly IScriptText English = new EnScriptText();

    /// <summary>Тексты на языке клиента: <c>GEARBIT_LANG</c>, иначе язык Windows.</summary>
    public static IScriptText Current => For(ClientText.Current);

    public static IScriptText For(IClientText client) => client.Language == "en" ? English : Russian;
}

internal sealed class RuScriptText : IScriptText
{
    public CultureInfo RoslynCulture { get; } = CultureInfo.GetCultureInfo("ru-RU");

    public string Usage => "Использование: Gearbit.ScriptHost программа.csx";

    public string Error => "Ошибка";

    public string ErrorInLine(int line) => $"Ошибка в строке {line}";

    public string TotalErrors(string original, int count) => $"{original} (всего ошибок: {count})";

    public string ProgramStopped(string reason) => $"Программа остановлена: {reason}";

    public string Semicolon => "В конце команды нужна точка с запятой «;».";

    public string CloseBrace => "Не хватает закрывающей фигурной скобки «}». У каждой «{» должна быть своя «}».";

    public string OpenBrace => "Не хватает открывающей фигурной скобки «{».";

    public string CloseParen => "Не хватает закрывающей скобки «)».";

    public string NeedName => "Здесь нужно имя: переменной, команды или типа.";

    public string TextNotClosed => "Текст не закрыт: не хватает кавычки \" в конце.";

    public string TextQuotes => "Текст пишется в двойных кавычках: \"привет\". В одинарных — только одна буква: 'а'.";

    public string ExtraBrace => "Лишняя закрывающая скобка «}» или команда после конца программы.";

    public string NoEffect => "Эта строка ничего не делает. Может быть, у команды не хватает скобок: robot.Stop(); или написано == вместо =?";

    public string AssignLeft => "Слева от = должна быть переменная. Чтобы сравнить, пишите ==.";

    public string BreakOutsideLoop => "break и continue работают только внутри цикла.";

    public string CannotInfer => "C# не понял, что будет в переменной. Дайте ей значение сразу: var x = 0;";

    public string NotUnderstood => "C# не понял эту строку. Проверьте скобки, кавычки, точки с запятой и знаки.";

    public string WaitCapital => "Пишите Wait с большой буквы: Wait(1);";

    public string PrintHint => "В C# печатают так: Console.WriteLine(\"Привет!\");";

    public string RobotLowercase => "Робот называется robot — с маленькой буквы: robot.Forward(50);";

    public string NeedCondition => "Здесь нужно условие, которое бывает true или false. Чтобы сравнить, пишите ==, а не =.";

    public string FractionToInt => "Дробное число не помещается в int. Объявите переменную как double или округлите: (int)Math.Round(x).";

    public string Missing(string token) => $"Здесь не хватает «{token}».";

    public string CannotStand(string token) => $"Здесь не может стоять «{token}». Проверьте скобки и знаки.";

    public string StrangeChar(string character) =>
        $"Странный символ «{character}». Возможно, это русская буква или «умная» кавычка вместо обычной.";

    public string WrongArgCount(string command) =>
        $"У команды {command} не бывает столько значений в скобках. Наведите мышь на команду или посмотрите карточку «Команды».";

    public string MissingArg(string parameter) => $"Команде не хватает значения в скобках: нужно ещё «{parameter}».";

    public string Unassigned(string name) => $"Переменной «{name}» ещё не дали значение. Например: {name} = 0;";

    public string UsedBeforeDeclared(string name) =>
        $"Переменную «{name}» используют раньше, чем создали. Перенесите строку с var {name} = … выше.";

    public string Operator(string op, string left, string right) => $"Знак «{op}» не работает с {left} и {right}.";

    public string NeedParens(string command) => $"После команды {command} нужны скобки: {command}().";

    public string NotCommand(string name) => $"«{name}» — не команда: скобки после него не нужны.";

    public string UnknownType(string name) => $"C# не знает тип «{name}». Для переменных подойдёт var: var x = 5;";

    public string Inaccessible(string name) => $"«{name}» — внутренняя часть, её нельзя использовать в программе.";

    public string LowercaseBool(string lower) => $"В C# пишут {lower} с маленькой буквы.";

    public string IsRobotCommand(string name, string command) => $"«{name}» — это команда робота. Пишите так: robot.{command}(…);";

    public string UnknownName(string name) =>
        $"C# не знает «{name}». Проверьте, как написано: большие и маленькие буквы различаются. Новую переменную сначала создают: var {name} = 0;";

    public string RobotNoCommand(string name, string? guess)
    {
        var hint = guess is null ? "" : $" Может быть, robot.{guess}?";
        return $"У робота нет команды «{name}».{hint} Все команды — в карточке «Команды» справа от программы.";
    }

    public string ConsoleNo(string name, string? guess) => guess is null
        ? $"У Console нет «{name}». Чтобы напечатать строчку: Console.WriteLine(\"Привет!\");"
        : $"У Console нет «{name}». Может быть, Console.{guess}?";

    public string MathNo(string name, string? guess) => guess is null
        ? $"У Math нет «{name}»."
        : $"У Math нет «{name}». Может быть, Math.{guess}?";

    public string TypeNo(string type, string name) =>
        $"У {type} нет «{name}». Проверьте, как написано: большие и маленькие буквы различаются.";

    public string AlreadyDefined(string name) =>
        $"Переменная «{name}» уже есть. Чтобы поменять её значение, пишите без var: {name} = …;";

    public string ArgumentMismatch(string? number, string to, string from)
    {
        var which = number is null ? "Значение" : $"Значение номер {number}";
        return $"{which} в скобках не подходит: нужно {to}, а здесь {from}.";
    }

    public string CannotPut(string from, string to) => $"Нельзя положить {from} туда, где нужно {to}.";

    public string TypeName(string type) => type switch
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

    public string DivideByZero => "Делить на ноль нельзя.";

    public string IndexOutOfRange =>
        "Такого номера в списке нет. Номера начинаются с 0, а последний на один меньше, чем элементов в списке.";

    public string NullReference => "Здесь пустое значение (null): переменной ещё ничего не дали.";

    public string BadNumberText => "Не получилось превратить текст в число. Проверьте, что в тексте только цифры.";

    public string Overflow => "Число получилось слишком большим.";

    public string InvalidCast => "Значение не того типа.";

    public string KeyNotFound => "Такого ключа в словаре нет.";

    public string EmptyList => "Список пустой.";

    public string OtherError(string message) => $"Ошибка: {message}";
}

internal sealed class EnScriptText : IScriptText
{
    // Английский — нейтральный язык Roslyn: сателлитная сборка ему не нужна.
    public CultureInfo RoslynCulture => CultureInfo.InvariantCulture;

    public string Usage => "Usage: Gearbit.ScriptHost program.csx";

    public string Error => "Error";

    public string ErrorInLine(int line) => $"Error in line {line}";

    public string TotalErrors(string original, int count) => $"{original} (errors in total: {count})";

    public string ProgramStopped(string reason) => $"The program was stopped: {reason}";

    public string Semicolon => "A command needs a semicolon «;» at the end.";

    public string CloseBrace => "A closing curly bracket «}» is missing. Every «{» needs its own «}».";

    public string OpenBrace => "An opening curly bracket «{» is missing.";

    public string CloseParen => "A closing bracket «)» is missing.";

    public string NeedName => "A name is needed here: of a variable, a command or a type.";

    public string TextNotClosed => "The text is not closed: a quote \" is missing at the end.";

    public string TextQuotes => "Text goes in double quotes: \"hello\". Single quotes hold only one letter: 'a'.";

    public string ExtraBrace => "An extra closing bracket «}», or a command after the end of the program.";

    public string NoEffect => "This line does nothing. Maybe the command is missing brackets: robot.Stop(); or == is written instead of =?";

    public string AssignLeft => "There must be a variable to the left of =. To compare, write ==.";

    public string BreakOutsideLoop => "break and continue work only inside a loop.";

    public string CannotInfer => "C# did not understand what goes into the variable. Give it a value right away: var x = 0;";

    public string NotUnderstood => "C# did not understand this line. Check the brackets, quotes, semicolons and signs.";

    public string WaitCapital => "Write Wait with a capital letter: Wait(1);";

    public string PrintHint => "In C# you print like this: Console.WriteLine(\"Hello!\");";

    public string RobotLowercase => "The robot is called robot, with a small letter: robot.Forward(50);";

    public string NeedCondition => "A condition that is true or false is needed here. To compare, write ==, not =.";

    public string FractionToInt => "A decimal number does not fit into int. Declare the variable as double or round it: (int)Math.Round(x).";

    public string Missing(string token) => $"«{token}» is missing here.";

    public string CannotStand(string token) => $"«{token}» cannot be here. Check the brackets and signs.";

    public string StrangeChar(string character) =>
        $"A strange character «{character}». Maybe it is a non-English letter or a «smart» quote instead of a plain one.";

    public string WrongArgCount(string command) =>
        $"The command {command} does not take this many values in brackets. Hover over the command or look at the «Commands» card.";

    public string MissingArg(string parameter) => $"The command is missing a value in brackets: «{parameter}» is needed too.";

    public string Unassigned(string name) => $"The variable «{name}» has no value yet. For example: {name} = 0;";

    public string UsedBeforeDeclared(string name) =>
        $"The variable «{name}» is used before it is created. Move the line with var {name} = … higher.";

    public string Operator(string op, string left, string right) => $"The sign «{op}» does not work with {left} and {right}.";

    public string NeedParens(string command) => $"The command {command} needs brackets: {command}().";

    public string NotCommand(string name) => $"«{name}» is not a command: it needs no brackets.";

    public string UnknownType(string name) => $"C# does not know the type «{name}». For variables, var works: var x = 5;";

    public string Inaccessible(string name) => $"«{name}» is an internal part: a program cannot use it.";

    public string LowercaseBool(string lower) => $"In C# you write {lower} with a small letter.";

    public string IsRobotCommand(string name, string command) => $"«{name}» is a robot command. Write it like this: robot.{command}(…);";

    public string UnknownName(string name) =>
        $"C# does not know «{name}». Check the spelling: capital and small letters are different. Create a new variable first: var {name} = 0;";

    public string RobotNoCommand(string name, string? guess)
    {
        var hint = guess is null ? "" : $" Maybe robot.{guess}?";
        return $"The robot has no command «{name}».{hint} All commands are in the «Commands» card to the right of the program.";
    }

    public string ConsoleNo(string name, string? guess) => guess is null
        ? $"Console has no «{name}». To print a line: Console.WriteLine(\"Hello!\");"
        : $"Console has no «{name}». Maybe Console.{guess}?";

    public string MathNo(string name, string? guess) => guess is null
        ? $"Math has no «{name}»."
        : $"Math has no «{name}». Maybe Math.{guess}?";

    public string TypeNo(string type, string name) =>
        $"{Capitalize(type)} has no «{name}». Check the spelling: capital and small letters are different.";

    public string AlreadyDefined(string name) =>
        $"The variable «{name}» already exists. To change its value, write it without var: {name} = …;";

    public string ArgumentMismatch(string? number, string to, string from)
    {
        var which = number is null ? "The value" : $"Value number {number}";
        return $"{which} in brackets does not fit: {to} is needed, but here is {from}.";
    }

    public string CannotPut(string from, string to) => $"You cannot put {from} where {to} is needed.";

    public string TypeName(string type) => type switch
    {
        "int" or "double" or "float" or "decimal" or "long" or "short" or "byte" or "uint" or "ulong" or "int?" or "double?" => "a number",
        "string" => "text in quotes",
        "bool" => "true or false",
        "char" => "one letter in single quotes",
        "void" => "nothing (this command returns nothing)",
        "method group" => "a command without brackets",
        "<null>" => "null",
        "(int X, int Y)" => "a pair of numbers",
        "" => "this",
        _ => $"«{type}»",
    };

    public string DivideByZero => "You cannot divide by zero.";

    public string IndexOutOfRange =>
        "The list has no item with this number. Numbers start at 0, and the last one is one less than the number of items.";

    public string NullReference => "There is an empty value (null) here: the variable has not been given anything yet.";

    public string BadNumberText => "Could not turn the text into a number. Check that the text has only digits.";

    public string Overflow => "The number got too big.";

    public string InvalidCast => "The value has the wrong type.";

    public string KeyNotFound => "The dictionary has no such key.";

    public string EmptyList => "The list is empty.";

    public string OtherError(string message) => $"Error: {message}";

    private static string Capitalize(string text) =>
        text.Length > 0 && char.IsLower(text[0]) ? char.ToUpperInvariant(text[0]) + text[1..] : text;
}
