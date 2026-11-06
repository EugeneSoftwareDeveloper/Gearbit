namespace BotStudio.Protocols.Tudao;

/// <summary>Кусок потока после разбиения: кадр FF FE, команда 55 AA или мусор.</summary>
public enum TudaoChunkKind
{
    Frame,
    Auth,
    Junk,
}

public readonly record struct TudaoChunk(TudaoChunkKind Kind, byte[] Data);

/// <summary>
/// Собирает кадры из потока, приходящего кусками (BLE режет данные по 20 байт).
/// Длину кадра берёт из байта len; если хвост FD FC не на месте, пробует известные длины
/// (на случай, если в каком-то кадре третий байт — тип, а не длина). Сбившись, ищет следующий FF FE.
/// </summary>
public sealed class TudaoStreamSplitter
{
    private readonly List<byte> _buffer = [];
    private readonly int[] _knownLengths;
    private readonly int _authLength;

    /// <param name="knownLengths">Полные длины кадров, которые стоит пробовать, если поле len не сходится.</param>
    /// <param name="authLength">Длина команды 55 AA (0 — не ждать таких команд).</param>
    public TudaoStreamSplitter(IEnumerable<int> knownLengths, int authLength = 0)
    {
        ArgumentNullException.ThrowIfNull(knownLengths);
        _knownLengths = knownLengths.Where(l => l >= TudaoFrames.Overhead).Distinct().Order().ToArray();
        _authLength = authLength;
    }

    /// <summary>Сколько байт ждут продолжения кадра.</summary>
    public int Pending => _buffer.Count;

    public IReadOnlyList<TudaoChunk> Feed(ReadOnlySpan<byte> data)
    {
        _buffer.AddRange(data);
        var result = new List<TudaoChunk>();
        var junk = new List<byte>();

        while (_buffer.Count > 0)
        {
            var span = System.Runtime.InteropServices.CollectionsMarshal.AsSpan(_buffer);

            if (span[0] == TudaoFrames.Head0)
            {
                if (span.Length < 2)
                {
                    break;
                }

                if (span[1] == TudaoFrames.Head1)
                {
                    var status = TryTakeFrame(span, out var length);
                    if (status == TakeStatus.NeedMore)
                    {
                        break;
                    }

                    if (status == TakeStatus.Ok)
                    {
                        Flush(junk, result);
                        result.Add(new TudaoChunk(TudaoChunkKind.Frame, span[..length].ToArray()));
                        _buffer.RemoveRange(0, length);
                        continue;
                    }
                }
            }
            else if (_authLength > 0 && span[0] == TudaoFrames.AuthPrefix[0])
            {
                if (span.Length < 2)
                {
                    break;
                }

                if (span[1] == TudaoFrames.AuthPrefix[1])
                {
                    if (span.Length < _authLength)
                    {
                        break;
                    }

                    Flush(junk, result);
                    result.Add(new TudaoChunk(TudaoChunkKind.Auth, span[.._authLength].ToArray()));
                    _buffer.RemoveRange(0, _authLength);
                    continue;
                }
            }

            // Не начало кадра: откладываем байт в «мусор» и ищем дальше.
            junk.Add(span[0]);
            _buffer.RemoveAt(0);
        }

        Flush(junk, result);
        return result;
    }

    public void Reset() => _buffer.Clear();

    private enum TakeStatus
    {
        Ok,
        NeedMore,
        Invalid,
    }

    private TakeStatus TryTakeFrame(ReadOnlySpan<byte> span, out int length)
    {
        length = 0;
        if (span.Length < 3)
        {
            return TakeStatus.NeedMore;
        }

        var needMore = false;
        var declared = span[2] + TudaoFrames.Overhead;
        if (span[2] <= TudaoFrames.MaxPayload)
        {
            if (span.Length < declared)
            {
                needMore = true;
            }
            else if (TudaoFrames.HasTailAt(span, declared))
            {
                length = declared;
                return TakeStatus.Ok;
            }
        }

        foreach (var known in _knownLengths)
        {
            if (known == declared)
            {
                continue;
            }

            if (span.Length < known)
            {
                needMore = true;
                continue;
            }

            if (TudaoFrames.HasTailAt(span, known))
            {
                length = known;
                return TakeStatus.Ok;
            }
        }

        return needMore ? TakeStatus.NeedMore : TakeStatus.Invalid;
    }

    private static void Flush(List<byte> junk, List<TudaoChunk> result)
    {
        if (junk.Count > 0)
        {
            result.Add(new TudaoChunk(TudaoChunkKind.Junk, junk.ToArray()));
            junk.Clear();
        }
    }
}
