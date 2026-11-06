namespace BotStudio.Protocols.Tudao;

/// <summary>Команда, которую устройство получило от ПК.</summary>
public abstract record TudaoHostCommand;

public sealed record TudaoAuthCommand(byte[] Data) : TudaoHostCommand;

public sealed record TudaoUidRequest : TudaoHostCommand;

/// <param name="Motors">Мощности в единицах устройства (int8 со знаком), по слотам M1…</param>
/// <param name="Lights">Коды цветов по слотам L1…</param>
public sealed record TudaoStateCommand(IReadOnlyList<int> Motors, IReadOnlyList<byte> Lights) : TudaoHostCommand;

public sealed record TudaoUnknownCommand(byte[] Data) : TudaoHostCommand;

/// <summary>
/// Протокол TUDAO «глазами прошивки»: разбор команд от ПК и сборка кадров телеметрии.
/// Нужен эмулятору и тестам, чтобы проверять драйвер без настоящего робота.
/// </summary>
public sealed class TudaoDeviceCodec
{
    private readonly TudaoOptions _options;
    private readonly TudaoStreamSplitter _splitter;

    public TudaoDeviceCodec(TudaoOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
        var stateLength = TudaoFrames.Overhead + TudaoFrames.StatePrefix.Length + options.MotorSlots.Count + options.LightSlots.Count;
        _splitter = new TudaoStreamSplitter([stateLength, options.Handshake.Length], options.Auth.Length);
    }

    public IReadOnlyList<TudaoHostCommand> Feed(ReadOnlySpan<byte> data)
    {
        var commands = new List<TudaoHostCommand>();
        foreach (var chunk in _splitter.Feed(data))
        {
            commands.Add(chunk.Kind switch
            {
                TudaoChunkKind.Auth => new TudaoAuthCommand(chunk.Data),
                TudaoChunkKind.Frame => DecodeFrame(chunk.Data),
                _ => new TudaoUnknownCommand(chunk.Data),
            });
        }

        return commands;
    }

    public TudaoHostCommand DecodeFrame(byte[] frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        if (frame.AsSpan().SequenceEqual(_options.Handshake))
        {
            return new TudaoUidRequest();
        }

        var payload = TudaoFrames.Payload(frame);
        var expected = TudaoFrames.StatePrefix.Length + _options.MotorSlots.Count + _options.LightSlots.Count;
        if (payload.Length == expected && payload.StartsWith(TudaoFrames.StatePrefix))
        {
            var values = payload[TudaoFrames.StatePrefix.Length..];
            var motors = new int[_options.MotorSlots.Count];
            for (var i = 0; i < motors.Length; i++)
            {
                motors[i] = unchecked((sbyte)values[i]);
            }

            var lights = values[motors.Length..].ToArray();
            return new TudaoStateCommand(motors, lights);
        }

        return new TudaoUnknownCommand(frame);
    }

    /// <summary>Ответ на запрос UID: <c>FF FE 08 [8 байт] FD FC</c>.</summary>
    public static byte[] EncodeUid(ReadOnlySpan<byte> uid)
    {
        if (uid.Length != TudaoFrames.UidLength)
        {
            throw new ArgumentException($"UID должен быть {TudaoFrames.UidLength} байт.", nameof(uid));
        }

        return TudaoFrames.Wrap(uid);
    }

    /// <summary>
    /// Кадр телеметрии заданного варианта. Незаданные поля — «нет данных» (255).
    /// Для полей imuX/imuY нужно передавать угол без смещения: смещение добавляется здесь.
    /// </summary>
    public byte[] EncodeTelemetry(string firmware, IReadOnlyDictionary<string, int?> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        var variant = _options.TelemetryVariants.FirstOrDefault(v => string.Equals(v.Firmware, firmware, StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException($"Неизвестный вариант телеметрии «{firmware}».", nameof(firmware));

        var frame = new byte[variant.Length];
        frame.AsSpan().Fill((byte)_options.NoValue);
        frame[0] = TudaoFrames.Head0;
        frame[1] = TudaoFrames.Head1;
        frame[2] = (byte)(variant.Length - TudaoFrames.Overhead);
        frame[^2] = TudaoFrames.Tail0;
        frame[^1] = TudaoFrames.Tail1;

        foreach (var (name, index) in variant.Fields)
        {
            if (values.TryGetValue(name, out var value) && value is { } v)
            {
                if (name is "imuX" or "imuY")
                {
                    v += variant.ImuOffset;
                }

                frame[index] = (byte)Math.Clamp(v, 0, 254);
            }
        }

        return frame;
    }
}
