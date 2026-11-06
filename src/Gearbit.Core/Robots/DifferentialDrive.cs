using Gearbit.Core.Components;
using Gearbit.Core.Descriptors;

namespace Gearbit.Core.Robots;

/// <summary>
/// Танковый привод из двух моторов. Учитывает зеркальный монтаж (инверсию) из сборки,
/// поэтому «вперёд» всегда значит вперёд, как бы ни были поставлены моторы.
/// </summary>
public sealed class DifferentialDrive
{
    private readonly bool _invertLeft;
    private readonly bool _invertRight;

    public DifferentialDrive(IMotor left, IMotor right, bool invertLeft, bool invertRight)
    {
        ArgumentNullException.ThrowIfNull(left);
        ArgumentNullException.ThrowIfNull(right);
        Left = left;
        Right = right;
        _invertLeft = invertLeft;
        _invertRight = invertRight;
    }

    public IMotor Left { get; }

    public IMotor Right { get; }

    public static DifferentialDrive? FromProfile(DriveProfile? profile, Func<string, IMotor?> findMotor)
    {
        ArgumentNullException.ThrowIfNull(findMotor);
        if (profile is null || !string.Equals(profile.Type, "differential", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var left = findMotor(profile.Left);
        var right = findMotor(profile.Right);
        return left is null || right is null ? null : new DifferentialDrive(left, right, profile.InvertLeft, profile.InvertRight);
    }

    /// <summary>Мощность каждого борта отдельно, −100..100.</summary>
    public void Tank(int left, int right)
    {
        Left.SetPower(_invertLeft ? -Math.Clamp(left, -100, 100) : Math.Clamp(left, -100, 100));
        Right.SetPower(_invertRight ? -Math.Clamp(right, -100, 100) : Math.Clamp(right, -100, 100));
    }

    /// <summary>
    /// «Аркадное» управление: газ и поворот (как стик геймпада). Положительный поворот — направо.
    /// Если сумма выходит за 100, оба борта масштабируются пропорционально, чтобы не терять форму поворота.
    /// </summary>
    public void Arcade(int throttle, int turn)
    {
        var (left, right) = Mix(throttle, turn);
        Tank(left, right);
    }

    public void Stop() => Tank(0, 0);

    public static (int Left, int Right) Mix(int throttle, int turn)
    {
        throttle = Math.Clamp(throttle, -100, 100);
        turn = Math.Clamp(turn, -100, 100);
        double left = throttle + turn;
        double right = throttle - turn;
        var max = Math.Max(Math.Abs(left), Math.Abs(right));
        if (max > 100)
        {
            left = left * 100 / max;
            right = right * 100 / max;
        }

        return ((int)Math.Round(left, MidpointRounding.AwayFromZero), (int)Math.Round(right, MidpointRounding.AwayFromZero));
    }
}
