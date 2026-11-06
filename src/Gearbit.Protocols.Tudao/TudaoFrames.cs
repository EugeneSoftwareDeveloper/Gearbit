namespace Gearbit.Protocols.Tudao;

/// <summary>
/// Рамка кадра TUDAO: <c>FF FE [len] [payload…] FD FC</c>, где len — длина полезной нагрузки.
/// Пример: запрос UID <c>FF FE 01 04 FD FC</c>, кадр состояния <c>FF FE 09 01 02 … FD FC</c>.
/// </summary>
public static class TudaoFrames
{
    public const byte Head0 = 0xFF;
    public const byte Head1 = 0xFE;
    public const byte Tail0 = 0xFD;
    public const byte Tail1 = 0xFC;

    /// <summary>Байты рамки вокруг полезной нагрузки: 2 заголовка + длина + 2 хвоста.</summary>
    public const int Overhead = 5;

    /// <summary>Длинная нагрузка — признак мусора в потоке (кадры TUDAO короткие).</summary>
    public const int MaxPayload = 64;

    public const int UidLength = 8;

    /// <summary>Начало нагрузки кадра состояния.</summary>
    public static ReadOnlySpan<byte> StatePrefix => [0x01, 0x02];

    /// <summary>Префикс авторизации в формате «55 AA» (отдельный протокол Apitor, без рамки FF FE).</summary>
    public static ReadOnlySpan<byte> AuthPrefix => [0x55, 0xAA];

    public static byte[] Wrap(ReadOnlySpan<byte> payload)
    {
        if (payload.Length > MaxPayload)
        {
            throw new ArgumentException($"Нагрузка кадра не может быть длиннее {MaxPayload} байт.", nameof(payload));
        }

        var frame = new byte[payload.Length + Overhead];
        frame[0] = Head0;
        frame[1] = Head1;
        frame[2] = (byte)payload.Length;
        payload.CopyTo(frame.AsSpan(3));
        frame[^2] = Tail0;
        frame[^1] = Tail1;
        return frame;
    }

    public static bool HasHeader(ReadOnlySpan<byte> data) => data.Length >= 2 && data[0] == Head0 && data[1] == Head1;

    public static bool HasTailAt(ReadOnlySpan<byte> data, int totalLength) =>
        totalLength >= Overhead && data.Length >= totalLength && data[totalLength - 2] == Tail0 && data[totalLength - 1] == Tail1;

    /// <summary>Нагрузка готового кадра (без рамки).</summary>
    public static ReadOnlySpan<byte> Payload(ReadOnlySpan<byte> frame) => frame[3..^2];

    public static string ToHex(ReadOnlySpan<byte> data) => Convert.ToHexString(data);
}
