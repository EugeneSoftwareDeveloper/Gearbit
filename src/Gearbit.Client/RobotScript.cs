namespace Gearbit.Client;

/// <summary>
/// Готовый робот и <c>Wait</c> для коротких программ. Во вкладке «C#» подключён сам,
/// а в своём консольном проекте достаточно одной строки:
/// <code>
/// using static Gearbit.Client.RobotScript;
///
/// robot.Forward(50);
/// Wait(1);
/// robot.Stop();
/// </code>
/// Когда программа заканчивается, моторы робота выключаются сами.
/// </summary>
public static class RobotScript
{
    private static readonly Lazy<Robot> Default = new(Create, LazyThreadSafetyMode.ExecutionAndPublication);

    /// <summary>Робот, которым управляет программа.</summary>
#pragma warning disable IDE1006 // Имя со строчной буквы — как переменная в Python и в «Блоках»: robot.Forward(50).
    public static Robot robot => Default.Value;
#pragma warning restore IDE1006

    /// <summary>Подождать столько секунд. Робот при этом продолжает делать то, что ему сказали.</summary>
    public static void Wait(double seconds)
    {
        if (Default.IsValueCreated)
        {
            Default.Value.Wait(seconds);
        }
        else
        {
            // Программе без робота подключаться к Gearbit незачем.
            Thread.Sleep(Robot.Duration(seconds));
        }
    }

    /// <summary>Остановить моторы, которые включала программа, и отключиться. Вызывается сам при выходе.</summary>
    public static void Finish()
    {
        if (Default.IsValueCreated)
        {
            Default.Value.Dispose();
        }
    }

    private static Robot Create()
    {
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Finish();
        return new Robot();
    }
}
