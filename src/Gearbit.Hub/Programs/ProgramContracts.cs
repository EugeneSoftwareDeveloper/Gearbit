namespace Gearbit.Hub.Programs;

/// <summary>Поток вывода программы.</summary>
public enum ProgramStream
{
    Out,
    Err,
}

/// <summary>Что запустить: исполняемый файл, аргументы и переменные окружения.</summary>
public sealed record ProgramCommand(string FileName, IReadOnlyList<string> Arguments, IReadOnlyDictionary<string, string> Environment);

/// <summary>Можно ли запускать программы на языке: нашёлся ли Python, собран ли запускатель C#.</summary>
/// <param name="Problem">Что сделать, если запустить нечем, — текст на языке клиента.</param>
public sealed record LanguageStatus(bool Available, string? Version, Func<IHubText, string>? Problem);

/// <summary>
/// Язык программ ребёнка (Python, C#). Программа всегда работает в отдельном процессе
/// и управляет роботом через хаб, как любой другой клиент.
/// </summary>
public interface IProgramLanguage
{
    /// <summary>Идентификатор для <c>program.run</c>: <c>python</c>, <c>csharp</c>.</summary>
    string Id { get; }

    string Title { get; }

    /// <summary>Имя файла, в который сохраняется программа перед запуском.</summary>
    string FileName { get; }

    Task<LanguageStatus> CheckAsync(CancellationToken cancellationToken);

    /// <summary>Команда запуска сохранённой программы. Если запустить нечем — <see cref="HubException"/> с понятным текстом.</summary>
    Task<ProgramCommand> PrepareAsync(string programPath, CancellationToken cancellationToken);
}

/// <summary>Запущенный процесс программы.</summary>
public interface IProgramProcess
{
    /// <summary>Код выхода; завершается, когда процесс закончился и вывод прочитан.</summary>
    Task<int> Completion { get; }

    /// <summary>Убить процесс вместе с дочерними. Повторный вызов ничего не делает.</summary>
    void Kill();
}

/// <summary>Запуск процессов. В тестах подменяется, чтобы не зависеть от установленного Python.</summary>
public interface IProgramLauncher
{
    /// <param name="onLine">Вызывается для каждой строки stdout и stderr, из разных потоков.</param>
    IProgramProcess Start(ProgramCommand command, string workingDirectory, Action<ProgramStream, string> onLine);
}
