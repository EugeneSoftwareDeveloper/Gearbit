namespace Gearbit.Hub;

public enum ControllerKind
{
    /// <summary>Пульт в интерфейсе: клавиатура, геймпад, кнопки. Под «кнопкой мертвеца».</summary>
    Remote,

    /// <summary>Программа ребёнка (Scratch, Python, C#).</summary>
    Program,

    /// <summary>Замеры протокола: сырые кадры в ручном режиме робота (см. <see cref="ServiceMode"/>).</summary>
    Service,
}

public sealed record ControlOwner(string ClientId, string ClientName, ControllerKind Kind, DateTimeOffset Since);

public sealed class ControlChangedEventArgs(ControlOwner? owner) : EventArgs
{
    public ControlOwner? Owner { get; } = owner;
}

/// <summary>
/// Арбитр управления: моторами в каждый момент управляет кто-то один — пульт или программа.
/// «СТОП» разрешён всем и всегда. Управление можно забрать явно (кнопка «Забрать управление»).
/// </summary>
public sealed class ControlArbiter(TimeProvider time)
{
    private readonly Lock _lock = new();
    private ControlOwner? _owner;
    private long _lastMotionTimestamp;

    public ControlOwner? Owner
    {
        get
        {
            lock (_lock)
            {
                return _owner;
            }
        }
    }

    public event EventHandler<ControlChangedEventArgs>? Changed;

    /// <summary>Сколько прошло с последней команды движения от владельца.</summary>
    public TimeSpan SinceLastMotion
    {
        get
        {
            lock (_lock)
            {
                return time.GetElapsedTime(_lastMotionTimestamp);
            }
        }
    }

    /// <summary>
    /// Проверить право на команду движения и отметить её время. Если управление свободно — занять его.
    /// </summary>
    public void Authorize(string clientId, string clientName, ControllerKind kind)
    {
        ControlOwner? changed = null;
        lock (_lock)
        {
            if (_owner is null || (_owner.ClientId == clientId && _owner.Kind != kind))
            {
                _owner = new ControlOwner(clientId, clientName, kind, time.GetUtcNow());
                changed = _owner;
            }
            else if (_owner.ClientId != clientId)
            {
                var owner = _owner;
                throw new HubException(HubErrors.ControlBusy, t => t.ControlBusy(owner.Kind, owner.ClientName));
            }

            _lastMotionTimestamp = time.GetTimestamp();
        }

        if (changed is not null)
        {
            Changed?.Invoke(this, new ControlChangedEventArgs(changed));
        }
    }

    /// <summary>Забрать управление (явно, по кнопке).</summary>
    public void Take(string clientId, string clientName, ControllerKind kind)
    {
        var owner = new ControlOwner(clientId, clientName, kind, time.GetUtcNow());
        lock (_lock)
        {
            _owner = owner;
            _lastMotionTimestamp = time.GetTimestamp();
        }

        Changed?.Invoke(this, new ControlChangedEventArgs(owner));
    }

    /// <summary>Освободить управление, если им владеет этот клиент. Возвращает true, если освободили.</summary>
    public bool Release(string clientId)
    {
        lock (_lock)
        {
            if (_owner?.ClientId != clientId)
            {
                return false;
            }

            _owner = null;
        }

        Changed?.Invoke(this, new ControlChangedEventArgs(null));
        return true;
    }

    public void Reset()
    {
        lock (_lock)
        {
            if (_owner is null)
            {
                return;
            }

            _owner = null;
        }

        Changed?.Invoke(this, new ControlChangedEventArgs(null));
    }
}
