using Gearbit.ScriptHost;

namespace Gearbit.Tests;

/// <summary>Ошибки компиляции программ на C# — понятными словами и с правильной строкой.</summary>
public sealed class CSharpScriptTests
{
    private const string Path = "program.csx";

    [Theory]
    [InlineData("var x = 1\nrobot.Forward(50);", 1, "точка с запятой")]
    [InlineData("robot.forwrd(50);", 1, "robot.Forward?")]
    [InlineData("robot.Stop();\nrobot.turn_left(40);", 2, "robot.TurnLeft?")]
    [InlineData("wait(1);", 1, "Wait с большой буквы")]
    [InlineData("Forward(50);", 1, "robot.Forward(")]
    [InlineData("print(\"привет\");", 1, "Console.WriteLine")]
    [InlineData("robot.Forward(\"быстро\");", 1, "нужно число, а здесь текст в кавычках")]
    [InlineData("var n = 0;\nif (n = 5) { }", 2, "пишите ==")]
    [InlineData("while (true)\n{\n    robot.Forward(50);\n", 3, "фигурной скобки")]
    [InlineData("int speed = 2.5;", 1, "Дробное число")]
    [InlineData("var a = 1;\nvar a = 2;", 2, "уже есть")]
    [InlineData("Console.Writeline(1);", 1, "Console.WriteLine?")]
    [InlineData("robot.Tank(50);", 1, "не хватает значения")]
    public void Compile_error_is_explained(string code, int line, string expected)
    {
        var (script, error, _) = ScriptCompiler.Compile(code, Path, ScriptText.Russian);

        Assert.Null(script);
        Assert.NotNull(error);
        Assert.Equal(line, error.Line);
        Assert.Contains(expected, error.Message, StringComparison.Ordinal);
        Assert.StartsWith("CS", error.Original, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("var x = 1\nrobot.Forward(50);", "needs a semicolon")]
    [InlineData("robot.forwrd(50);", "no command «forwrd». Maybe robot.Forward?")]
    [InlineData("robot.Forward(\"fast\");", "a number is needed, but here is text in quotes")]
    [InlineData("Consol.WriteLine(1);", "C# does not know «Consol»")]
    public void Compile_error_is_explained_in_english(string code, string expected)
    {
        var (_, error, _) = ScriptCompiler.Compile(code, Path, ScriptText.English);

        Assert.NotNull(error);
        Assert.Contains(expected, error.Message, StringComparison.Ordinal);
        Assert.DoesNotMatch("[А-Яа-яЁё]", error.Original!);
    }

    [Fact]
    public void Runtime_error_is_explained_in_english()
    {
        var error = RuntimeErrors.Explain(new DivideByZeroException(), Path, ScriptText.English);

        Assert.Equal("You cannot divide by zero.", error.Message);
    }

    [Fact]
    public void Correct_program_compiles_with_robot_and_wait()
    {
        var (script, error, count) = ScriptCompiler.Compile(
            """
            var steps = new List<int> { 1, 2, 3 };
            foreach (var step in steps.Where(s => s > 1))
            {
                robot.Forward(50, 0.5);
                Wait(0.1);
                robot.Say($"Шаг {step}");
            }

            if (robot.Obstacle("front") || robot.Distance("справа") < 2)
            {
                robot.Light("all", "red");
            }

            var (x, y) = robot.Tilt();
            Console.WriteLine(Math.Abs(x) + y);
            """,
            Path);

        Assert.Null(error);
        Assert.Equal(0, count);
        Assert.NotNull(script);
    }

    [Theory]
    [InlineData("forwrd", "Forward")]
    [InlineData("turn_right", "TurnRight")]
    [InlineData("lightsoff", "LightsOff")]
    [InlineData("jump", null)]
    public void Similar_robot_command(string name, string? expected) =>
        Assert.Equal(expected, CompileErrors.Similar(name, CompileErrors.RobotMembers));
}
